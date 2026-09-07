import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import {
  selectionExpressionExtensions,
  selectionExpressionLinter,
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
});
