import {
  acceptCompletion,
  CompletionContext,
  currentCompletions,
  startCompletion,
} from '@codemirror/autocomplete';
import { cursorCharForward, history, redo, undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { analyzeSelectionDocument } from '@ontahi/language';
import { describe, expect, it, vi } from 'vitest';

import {
  deriveSelectionFiniteValueProjections,
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

const WorkItem = {
  name: 'WorkItem',
  fields: [
    {
      name: 'status',
      type: 'enum',
      nullable: false,
      enumValues: ['open', 'blocked'],
    },
  ],
} as const;

const projectionExtensions = (entity: typeof TodoItem | typeof WorkItem) => [
  history(),
  ...selectionExpressionExtensions(entity, { finiteValueProjections: true }),
];

describe('Selection CodeMirror adapter', () => {
  it('derives finite projections only from complete, semantically resolved literals', () => {
    expect(deriveSelectionFiniteValueProjections('status = "open"', WorkItem)).toEqual([
      {
        from: 9,
        to: 15,
        fieldName: 'status',
        value: 'open',
        choices: [
          { label: 'open', text: '"open"', value: 'open' },
          { label: 'blocked', text: '"blocked"', value: 'blocked' },
        ],
      },
    ]);
    expect(deriveSelectionFiniteValueProjections('completed in [true, false]', TodoItem)).toEqual([
      {
        from: 14,
        to: 18,
        fieldName: 'completed',
        value: true,
        choices: [
          { label: 'true', text: 'true', value: true },
          { label: 'false', text: 'false', value: false },
        ],
      },
      {
        from: 20,
        to: 25,
        fieldName: 'completed',
        value: false,
        choices: [
          { label: 'true', text: 'true', value: true },
          { label: 'false', text: 'false', value: false },
        ],
      },
    ]);
    expect(deriveSelectionFiniteValueProjections('status = ', WorkItem)).toEqual([]);
    expect(deriveSelectionFiniteValueProjections('status = "unknown"', WorkItem)).toEqual([]);
    expect(deriveSelectionFiniteValueProjections('title = "open"', TodoItem)).toEqual([]);
    expect(
      deriveSelectionFiniteValueProjections(
        'not (status = "open" or status = "blocked") and all',
        WorkItem,
      ).map(projection => projection.value),
    ).toEqual(['open', 'blocked']);
    expect(
      deriveSelectionFiniteValueProjections('status is null', {
        ...WorkItem,
        fields: [{ ...WorkItem.fields[0], nullable: true }],
      }),
    ).toEqual([]);
  });

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
    expect(parent.querySelector('.cm-tooltip-autocomplete')).toBeTruthy();
    expect(parent.querySelector('.cm-completionIcon')).toBeNull();
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

  it('projects a finite literal as an atomic control while text remains the document', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'status = "open"',
        selection: { anchor: 9 },
        extensions: projectionExtensions(WorkItem),
      }),
    });

    const select = parent.querySelector<HTMLSelectElement>('.cm-ontahi-finite-value-select');
    expect(select?.getAttribute('aria-label')).toBe('Value for WorkItem.status');
    select?.focus();
    expect(document.activeElement).toBe(select);
    expect(select?.value).toBe('"open"');
    expect(view.state.doc.toString()).toBe('status = "open"');
    expect(cursorCharForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(15);

    view.destroy();
    parent.remove();
  });

  it('copies the underlying source text instead of projected labels', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const source = 'status = "open"';
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: projectionExtensions(WorkItem),
      }),
    });
    view.dispatch({ selection: { anchor: 0, head: source.length } });
    view.focus();

    const copied = new Map<string, string>();
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copy, 'clipboardData', {
      value: {
        clearData: () => copied.clear(),
        setData: (type: string, value: string) => copied.set(type, value),
      },
    });
    view.contentDOM.dispatchEvent(copy);

    expect(copied.get('text/plain')).toBe(source);
    view.destroy();
    parent.remove();
  });

  it('writes widget choices as ordinary text transactions with undo and redo', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'status = "open"',
        extensions: projectionExtensions(WorkItem),
      }),
    });

    const select = parent.querySelector<HTMLSelectElement>('.cm-ontahi-finite-value-select')!;
    select.value = '"blocked"';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('status = "blocked"');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('status = "open"');
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('status = "blocked"');

    view.destroy();
    parent.remove();
  });

  it('reparses a projected membership value into the canonical Selection AST', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'completed in [true, false]',
        extensions: projectionExtensions(TodoItem),
      }),
    });

    const controls = parent.querySelectorAll<HTMLSelectElement>('.cm-ontahi-finite-value-select');
    controls[0]!.value = 'false';
    controls[0]!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('completed in [false, false]');
    expect(analyzeSelectionDocument(view.state.doc.toString(), TodoItem).selection).toEqual({
      kind: 'selection',
      entityName: 'TodoItem',
      expression: {
        kind: 'predicate',
        fieldName: 'completed',
        operator: 'in',
        values: [false, false],
      },
    });
    view.destroy();
    parent.remove();
  });

  it('discards projected choices when Entity reflection is reconfigured', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const compartment = new Compartment();
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'status = "open"',
        extensions: compartment.of(projectionExtensions(WorkItem)),
      }),
    });
    expect(parent.querySelector('.cm-ontahi-finite-value-select')).toBeTruthy();

    view.dispatch({
      effects: compartment.reconfigure(
        selectionExpressionExtensions(
          {
            name: 'Note',
            fields: [{ name: 'status', type: 'string', nullable: false }],
          },
          { finiteValueProjections: true },
        ),
      ),
    });

    expect(parent.querySelector('.cm-ontahi-finite-value-select')).toBeNull();
    view.destroy();
    parent.remove();
  });

  it('reveals the selected literal with Escape and deletes it with ordinary diagnostics', () => {
    const createView = () => {
      const parent = document.createElement('div');
      document.body.append(parent);
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: 'completed = false',
          extensions: projectionExtensions(TodoItem),
        }),
      });
      return { parent, view };
    };

    const revealed = createView();
    revealed.parent
      .querySelector<HTMLSelectElement>('.cm-ontahi-finite-value-select')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    expect(revealed.parent.querySelector('.cm-ontahi-finite-value-select')).toBeNull();
    expect(revealed.view.state.selection.main.from).toBe(12);
    expect(revealed.view.state.selection.main.to).toBe(17);
    expect(revealed.view.state.doc.toString()).toBe('completed = false');
    revealed.view.destroy();
    revealed.parent.remove();

    const deleted = createView();
    deleted.parent
      .querySelector<HTMLSelectElement>('.cm-ontahi-finite-value-select')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
      );
    expect(deleted.view.state.doc.toString()).toBe('completed = ');
    expect(deleted.parent.querySelector('.cm-ontahi-finite-value-select')).toBeNull();
    expect(selectionExpressionLinter(TodoItem)(deleted.view)).toEqual([
      {
        from: 12,
        to: 12,
        severity: 'error',
        source: 'Ontahí syntax',
        message: 'Expected a string, number, or Boolean literal.',
      },
    ]);
    deleted.view.destroy();
    deleted.parent.remove();

    const forwardDeleted = createView();
    forwardDeleted.parent
      .querySelector<HTMLSelectElement>('.cm-ontahi-finite-value-select')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      );
    expect(forwardDeleted.view.state.doc.toString()).toBe('completed = ');
    forwardDeleted.view.destroy();
    forwardDeleted.parent.remove();
  });

  it('returns no hover without Entity reflection', async () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'completed = false' }) });

    expect(await selectionExpressionHoverSource(view, 2, 1)).toBeNull();
    view.destroy();
  });
});
