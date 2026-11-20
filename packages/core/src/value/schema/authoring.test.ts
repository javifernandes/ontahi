import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  graphLiteral as legacyGraphLiteral,
  graphVoid as legacyGraphVoid,
} from '../../data-graph/definitions.js';

import { describeGraphSchema, graphLiteral, graphVoid, presentGraphSchema } from './authoring.js';

describe('value schema authoring', () => {
  it('authors literal and void schemas without model dependencies', () => {
    const status = graphLiteral('ready');
    expect(status).toEqual({ kind: 'schema.literal', value: 'ready' });
    expect(graphVoid()).toEqual({ kind: 'schema.void' });
    expectTypeOf(status.__value).toEqualTypeOf<'ready' | undefined>();
  });

  it('adds description and presentation immutably', () => {
    const schema = graphLiteral(true);
    expect(describeGraphSchema(schema, 'Enabled flag')).toEqual({
      kind: 'schema.literal',
      value: true,
      description: 'Enabled flag',
    });
    expect(presentGraphSchema(schema, { control: 'text' })).toEqual({
      kind: 'schema.literal',
      value: true,
      presentation: { control: 'text' },
    });
    expect(schema).toEqual({ kind: 'schema.literal', value: true });
  });

  it('preserves historical function identity', () => {
    expect(legacyGraphLiteral).toBe(graphLiteral);
    expect(legacyGraphVoid).toBe(graphVoid);
  });
});
