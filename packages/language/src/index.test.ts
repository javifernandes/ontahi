import { describe, expect, it } from 'vitest';

import { analyzeSelectionDocument, parseSelectionDocument } from './index.js';

const TodoItem = {
  name: 'TodoItem',
  fields: [
    { name: 'completed', type: 'boolean', nullable: false },
    { name: 'title', type: 'string', nullable: false },
  ],
} as const;

describe('Selection document language', () => {
  it('parses a Boolean equality into source-positioned recoverable syntax', () => {
    expect(parseSelectionDocument('completed = false')).toEqual({
      syntax: {
        kind: 'selection-document',
        from: 0,
        to: 17,
        expression: {
          kind: 'boolean-equality',
          from: 0,
          to: 17,
          field: { kind: 'field-name', from: 0, to: 9, text: 'completed' },
          operator: { kind: 'equals', from: 10, to: 11, text: '=' },
          value: {
            kind: 'boolean-literal',
            from: 12,
            to: 17,
            text: 'false',
            value: false,
          },
        },
      },
      syntaxDiagnostics: [],
    });
  });

  it('keeps an empty host document valid without inventing Selection meaning', () => {
    expect(analyzeSelectionDocument('   ', TodoItem)).toEqual({
      syntax: { kind: 'selection-document', from: 0, to: 3 },
      syntaxDiagnostics: [],
      semanticDiagnostics: [],
    });
  });

  it('reports incomplete syntax without lowering a Selection', () => {
    const analysis = analyzeSelectionDocument('completed =', TodoItem);

    expect(analysis.selection).toBeUndefined();
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntaxDiagnostics).toEqual([
      {
        channel: 'syntax',
        code: 'selection.syntax.invalid',
        message: 'Expected the Boolean literal true or false.',
        from: 11,
        to: 11,
      },
    ]);
  });

  it('separates unknown Fields and incompatible Field types from syntax', () => {
    const unknown = analyzeSelectionDocument('missing = false', TodoItem);
    const incompatible = analyzeSelectionDocument('title = false', TodoItem);

    expect(unknown.syntaxDiagnostics).toEqual([]);
    expect(unknown.semanticDiagnostics).toEqual([
      {
        channel: 'semantic',
        code: 'selection.semantic.unknown-field',
        message: 'Unknown Field TodoItem.missing.',
        from: 0,
        to: 7,
      },
    ]);
    expect(incompatible.syntaxDiagnostics).toEqual([]);
    expect(incompatible.semanticDiagnostics).toEqual([
      {
        channel: 'semantic',
        code: 'selection.semantic.incompatible-field-type',
        message: 'Field TodoItem.title is string, not Boolean.',
        from: 0,
        to: 5,
      },
    ]);
  });

  it('lowers valid meaning exactly to the existing Selection AST', () => {
    expect(analyzeSelectionDocument('completed = false', TodoItem).selection).toEqual({
      kind: 'selection',
      entityName: 'TodoItem',
      expression: {
        kind: 'predicate',
        fieldName: 'completed',
        operator: 'eq',
        value: false,
      },
    });
  });
});
