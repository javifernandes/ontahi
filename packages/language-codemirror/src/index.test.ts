import {
  acceptCompletion,
  CompletionContext,
  currentCompletions,
  startCompletion,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';

import {
  selectionExpressionCompletionSource,
  selectionExpressionExtensions,
  selectionExpressionHoverSource,
  selectionExpressionLinter,
  toCodeMirrorSemanticRanges,
  toCodeMirrorDiagnostics,
} from './index.js';

const TodoItem = {
  name: 'TodoItem',
  fields: [
    { name: 'completed', type: 'boolean', nullable: false },
    { name: 'title', type: 'string', nullable: false },
  ],
} as const;

describe('Selection CodeMirror adapter', () => {
  it('installs the generated language parser without adding Ontahi semantics to editor state', () => {
    const state = EditorState.create({
      doc: 'completed = false',
      extensions: selectionExpressionExtensions(TodoItem),
    });

    expect(syntaxTree(state).toString()).toBe(
      'SelectionDocument(OrExpression(AndExpression(NotExpression(PrimaryExpression(Predicate(EqualityPredicate(FieldName(Identifier),Equals,ScalarLiteral(BooleanLiteral(False)))))))))',
    );
  });

  it('projects syntax and semantic diagnostics with exact CodeMirror ranges', () => {
    expect(
      toCodeMirrorDiagnostics({
        syntax: { kind: 'selection-document', from: 0, to: 11 },
        syntaxDiagnostics: [
          {
            channel: 'syntax',
            code: 'selection.syntax.invalid',
            message: 'Expected a string, number, or Boolean literal.',
            from: 11,
            to: 11,
          },
        ],
        semanticDiagnostics: [],
      }),
    ).toEqual([
      {
        from: 11,
        to: 11,
        severity: 'error',
        source: 'Ontahí syntax',
        message: 'Expected a string, number, or Boolean literal.',
      },
    ]);
  });

  it('re-analyzes the current editor document against structural Entity reflection', () => {
    const state = EditorState.create({ doc: 'missing = false' });
    const diagnostics = selectionExpressionLinter(TodoItem)({ state } as never);

    expect(diagnostics).toEqual([
      {
        from: 0,
        to: 7,
        severity: 'error',
        source: 'Ontahí semantics',
        message: 'Unknown Field TodoItem.missing.',
      },
    ]);
  });

  it('projects headless completions into CodeMirror completion items', async () => {
    const document = 'completed = ';
    const state = EditorState.create({
      doc: document,
      selection: { anchor: document.length },
      extensions: selectionExpressionExtensions(TodoItem),
    });
    const completion = await selectionExpressionCompletionSource(
      new CompletionContext(state, document.length, true),
    );

    expect(completion).toMatchObject({ from: document.length, to: document.length });
    expect(completion?.options).toEqual([
      { label: 'true', apply: 'true', type: 'constant', detail: 'Boolean value' },
      { label: 'false', apply: 'false', type: 'constant', detail: 'Boolean value' },
    ]);

    const updatedDocument = 'completed = t';
    const updatedState = EditorState.create({
      doc: updatedDocument,
      selection: { anchor: updatedDocument.length },
      extensions: selectionExpressionExtensions(TodoItem),
    });
    const updated = completion?.update?.(
      completion,
      completion.from,
      completion.to ?? document.length,
      new CompletionContext(updatedState, updatedDocument.length, false),
    );
    expect(updated?.options.map(option => option.label)).toEqual(['true', 'false']);
  });

  it('returns no completion when reflection or compatible operators are unavailable', async () => {
    const withoutReflection = EditorState.create();
    expect(
      await selectionExpressionCompletionSource(new CompletionContext(withoutReflection, 0, true)),
    ).toBeNull();

    const document = 'owner ';
    const unsupported = EditorState.create({
      doc: document,
      extensions: selectionExpressionExtensions({
        name: 'WorkItem',
        fields: [{ name: 'owner', type: 'reference', nullable: false }],
      }),
    });
    expect(
      await selectionExpressionCompletionSource(
        new CompletionContext(unsupported, document.length, true),
      ),
    ).toBeNull();
  });

  it('accepts a structural completion as an ordinary document transaction', async () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'compl',
        selection: { anchor: 5 },
        extensions: selectionExpressionExtensions(TodoItem),
      }),
    });

    expect(startCompletion(view)).toBe(true);
    await vi.waitFor(
      () =>
        expect(currentCompletions(view.state).map(completion => completion.label)).toEqual([
          'completed',
        ]),
      { timeout: 5_000 },
    );
    // CodeMirror deliberately ignores accidental acceptance immediately after a
    // completion opens. Wait past that interaction guard, independently of how
    // busy the test worker was while the completion source resolved.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(acceptCompletion(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('completed');
    view.destroy();
    parent.remove();
  });

  it('keeps Backspace editing while a structural completion is open', async () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'al',
        selection: { anchor: 2 },
        extensions: selectionExpressionExtensions(TodoItem),
      }),
    });

    expect(startCompletion(view)).toBe(true);
    await vi.waitFor(() => expect(currentCompletions(view.state)).not.toHaveLength(0));
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    expect(view.state.doc.toString()).toBe('a');
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    expect(view.state.doc.toString()).toBe('');

    view.destroy();
    parent.remove();
  });

  it('reads current reflection after an Entity compartment is reconfigured', async () => {
    const compartment = new Compartment();
    let state = EditorState.create({
      extensions: compartment.of(selectionExpressionExtensions(TodoItem)),
    });
    state = state.update({
      effects: compartment.reconfigure(
        selectionExpressionExtensions({
          name: 'ArchiveItem',
          fields: [{ name: 'archived', type: 'boolean', nullable: false }],
        }),
      ),
    }).state;

    const completion = await selectionExpressionCompletionSource(
      new CompletionContext(state, 0, true),
    );
    expect(completion?.options.map(option => option.label)).toContain('archived');
    expect(completion?.options.map(option => option.label)).not.toContain('completed');
  });

  it('maps semantic classifications to stable decoration classes', () => {
    expect(
      toCodeMirrorSemanticRanges([
        { kind: 'field', from: 0, to: 9 },
        { kind: 'invalid-identifier', from: 10, to: 17 },
        { kind: 'value', from: 18, to: 18 },
      ]),
    ).toEqual([
      { from: 0, to: 9, className: 'cm-ontahi-semantic-field' },
      { from: 10, to: 17, className: 'cm-ontahi-semantic-invalid' },
    ]);
  });

  it('renders semantic marks and reflection-powered hover without owning their meaning', async () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'completed = false',
        extensions: selectionExpressionExtensions(TodoItem),
      }),
    });

    expect(view.dom.querySelector('.cm-ontahi-semantic-field')?.textContent).toBe('completed');
    const tooltip = await selectionExpressionHoverSource(view, 2, 1);
    expect(tooltip).not.toBeNull();
    expect(Array.isArray(tooltip)).toBe(false);
    if (!tooltip || !('create' in tooltip)) throw new Error('Expected one hover tooltip.');
    const hover = tooltip.create(view).dom;
    expect(hover.textContent).toContain('TodoItem.completed');
    expect(hover.textContent).toContain('boolean · required');
    expect(hover.textContent).toContain('Supported Selection operators: =, in.');

    view.dispatch({ changes: { from: 0, to: 9, insert: 'missing' } });
    expect(view.dom.querySelector('.cm-ontahi-semantic-invalid')?.textContent).toBe('missing');
    view.destroy();
    parent.remove();
  });

  it('returns no hover without Entity reflection', async () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'completed = false' }) });

    expect(await selectionExpressionHoverSource(view, 2, 1)).toBeNull();
    view.destroy();
  });
});
