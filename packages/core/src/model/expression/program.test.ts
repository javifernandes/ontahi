import { describe, expect, it } from 'vitest';

import {
  assertModelExpression,
  assertModelExpressionProgram,
  collectModelExpressionDependencies,
  type ModelExpressionProgram,
} from './program.js';

describe('model expression program validation', () => {
  it.each([
    [undefined, 'Model expression must be an object with a supported kind.'],
    [{ kind: 'field', field: '' }, 'Model Field expression field must be a non-empty string.'],
    [
      { kind: 'input-ref', input: undefined },
      'Model input Ref expression input must be a non-empty string.',
    ],
    [
      { kind: 'relation-aggregate', relation: '', aggregate: 'count' },
      'Model Relation aggregate relation must be a non-empty string.',
    ],
    [
      { kind: 'relation-aggregate', relation: 'students', aggregate: 'sum' },
      'Model Relation aggregate must use count.',
    ],
    [
      {
        kind: 'arithmetic',
        operator: 'add',
        left: { kind: 'field', field: 'capacity' },
        right: { kind: 'field', field: 'reserved' },
      },
      'Model arithmetic expression must use subtract.',
    ],
    [
      {
        kind: 'compare',
        operator: 'gt',
        left: { kind: 'field', field: 'capacity' },
        right: { kind: 'field', field: 'reserved' },
      },
      'Model comparison expression must use lte.',
    ],
    [
      {
        kind: 'ref-identity',
        operator: 'equals',
        left: { kind: 'input-ref', input: 'left' },
        right: { kind: 'input-ref', input: 'right' },
      },
      'Model Ref identity expression must use is.',
    ],
    [{ kind: 'unknown' }, 'Unsupported Model expression kind unknown.'],
  ])('rejects an invalid expression contract %#', (expression, message) => {
    expect(() => assertModelExpression(expression)).toThrow(message);
  });

  it('rejects invalid program envelopes', () => {
    expect(() => assertModelExpressionProgram(undefined)).toThrow(
      'Model expression program must be an object.',
    );
    expect(() => assertModelExpressionProgram({ version: 2, expression: {} })).toThrow(
      'Unsupported Model expression version 2.',
    );
  });

  it('collects every dependency kind once from nested expressions', () => {
    const program: ModelExpressionProgram = {
      version: 1,
      expression: {
        kind: 'compare',
        operator: 'lte',
        left: {
          kind: 'arithmetic',
          operator: 'subtract',
          left: { kind: 'field', field: 'capacity' },
          right: {
            kind: 'relation-aggregate',
            relation: 'students',
            aggregate: 'count',
          },
        },
        right: {
          kind: 'arithmetic',
          operator: 'subtract',
          left: { kind: 'field', field: 'capacity' },
          right: { kind: 'input-ref', input: 'reservedBy' },
        },
      },
    };

    expect(collectModelExpressionDependencies(program)).toEqual([
      { kind: 'field', field: 'capacity' },
      { kind: 'relation-aggregate', relation: 'students', aggregate: 'count' },
      { kind: 'input-ref', input: 'reservedBy' },
    ]);
  });
});
