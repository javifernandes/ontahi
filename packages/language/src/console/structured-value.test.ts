import type { GraphSchemaDescriptor } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  completeStructuredInput,
  normalizeStructuredInput,
  parseStructuredValue,
  validateStructuredInput,
} from './structured-value.js';

const strictInput = {
  kind: 'object',
  role: 'object',
  unknownKeys: 'strict',
  fields: {
    title: { kind: 'scalar', type: 'string' },
    count: { kind: 'scalar', type: 'number' },
    active: { kind: 'scalar', type: 'boolean' },
    state: { kind: 'scalar', type: 'enum', enumValues: ['open', 'closed'] },
    note: { kind: 'optional', item: { kind: 'scalar', type: 'string' } },
  },
} as const satisfies GraphSchemaDescriptor;

describe('structured Console values', () => {
  it('reports malformed source without leaking partial values', () => {
    expect(() => parseStructuredValue('{ title: "unfinished }')).toThrow('Unterminated string.');
    expect(() => parseStructuredValue('{ : true }')).toThrow('Expected an object property name.');
    expect(() => parseStructuredValue('{ title true }')).toThrow(
      'Expected ":" after property name.',
    );
    expect(() => parseStructuredValue('[true')).toThrow('Expected "]".');
  });

  it('normalizes nested references through arrays, records, and wrappers', () => {
    const descriptor = {
      kind: 'object',
      role: 'object',
      unknownKeys: 'strict',
      fields: {
        owner: { kind: 'entity-ref', entityName: 'User' },
        reviewers: {
          kind: 'array',
          item: { kind: 'entity-ref', entityName: 'User' },
        },
        aliases: {
          kind: 'record',
          value: {
            kind: 'optional',
            item: { kind: 'entity-ref', entityName: 'User' },
          },
        },
      },
    } as const satisfies GraphSchemaDescriptor;

    expect(
      normalizeStructuredInput(
        {
          owner: { id: 'u1' },
          reviewers: [{ id: 'u2' }],
          aliases: { primary: { id: 'u3' } },
        },
        descriptor,
      ),
    ).toEqual({
      owner: { kind: 'entity-ref', entityName: 'User', locator: { id: 'u1' } },
      reviewers: [{ kind: 'entity-ref', entityName: 'User', locator: { id: 'u2' } }],
      aliases: {
        primary: { kind: 'entity-ref', entityName: 'User', locator: { id: 'u3' } },
      },
    });
  });

  it('validates scalar, literal, reference, array, and strict object contracts', () => {
    expect(validateStructuredInput(null, { kind: 'nullable', item: strictInput })).toBeUndefined();
    expect(
      validateStructuredInput(1, {
        kind: 'optional',
        item: { kind: 'scalar', type: 'string' },
      }),
    ).toBe('Expected string.');
    expect(validateStructuredInput('x', { kind: 'scalar', type: 'number' })).toBe(
      'Expected number.',
    );
    expect(validateStructuredInput(Infinity, { kind: 'scalar', type: 'number' })).toBe(
      'Expected number.',
    );
    expect(validateStructuredInput('yes', { kind: 'scalar', type: 'boolean' })).toBe(
      'Expected boolean.',
    );
    expect(validateStructuredInput(undefined, { kind: 'scalar', type: 'json' })).toBe(
      'Expected json.',
    );
    expect(
      validateStructuredInput('pending', {
        kind: 'scalar',
        type: 'enum',
        enumValues: ['open', 'closed'],
      }),
    ).toBe('Expected one of open, closed.');
    expect(validateStructuredInput('wrong', { kind: 'literal', value: 'fixed' })).toBe(
      'Expected "fixed".',
    );
    expect(validateStructuredInput('u1', { kind: 'entity-ref', entityName: 'User' })).toBe(
      'Expected a reference.',
    );
    expect(
      validateStructuredInput(['ok', 1], {
        kind: 'array',
        item: { kind: 'scalar', type: 'string' },
      }),
    ).toBe('Expected string.');
    expect(
      validateStructuredInput(['ok'], {
        kind: 'array',
        item: { kind: 'scalar', type: 'string' },
      }),
    ).toBeUndefined();
    expect(
      validateStructuredInput('not-array', {
        kind: 'array',
        item: { kind: 'scalar', type: 'string' },
      }),
    ).toBe('Expected an array.');
    expect(validateStructuredInput([], strictInput)).toBe('Expected an object.');
    expect(validateStructuredInput({}, strictInput, { requireOne: true })).toBe(
      'At least one Field is required.',
    );
    expect(validateStructuredInput({ extra: true }, strictInput)).toBe(
      'Field extra is not writable.',
    );
    expect(validateStructuredInput({}, strictInput, { requireFields: true })).toBe(
      'Field title is required.',
    );
    expect(
      validateStructuredInput(
        { title: 'ok', count: 'many', active: true, state: 'open' },
        strictInput,
      ),
    ).toBe('Field count: Expected number.');
  });

  it('derives completion placeholders and details from descriptor kinds', () => {
    const descriptor = {
      kind: 'object',
      role: 'object',
      unknownKeys: 'strict',
      fields: {
        count: { kind: 'scalar', type: 'number' },
        state: { kind: 'scalar', type: 'enum', enumValues: ['open'] },
        fixed: { kind: 'literal', value: true },
        children: { kind: 'array', item: { kind: 'scalar', type: 'string' } },
        owner: { kind: 'entity-ref', entityName: 'User' },
        choice: {
          kind: 'union',
          options: [
            { kind: 'scalar', type: 'boolean' },
            { kind: 'scalar', type: 'string' },
          ],
        },
        empty: { kind: 'void' },
      },
    } as const satisfies GraphSchemaDescriptor;
    const valueFor = (field: string) => {
      const document = `{ ${field}: `;
      return completeStructuredInput(document, document.length, 0, descriptor)?.items[0]?.apply;
    };

    expect(valueFor('count')).toBe('0');
    expect(valueFor('state')).toBe('"open"');
    expect(valueFor('fixed')).toBe('true');
    expect(valueFor('children')).toBe('[]');
    expect(valueFor('owner')).toBe('{}');
    expect(valueFor('choice')).toBe('false');
    expect(valueFor('empty')).toBe('null');
  });
});
