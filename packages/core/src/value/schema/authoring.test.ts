import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  graphLiteral as legacyGraphLiteral,
  graphVoid as legacyGraphVoid,
} from '../../data-graph/definitions.js';

import {
  describeGraphSchema,
  graphLiteral,
  graphVoid,
  presentGraphSchema,
  valueArray,
  valueDefault,
  valueNamed,
  valueNullable,
  valueOptional,
  valueRecord,
  valueRefine,
  valueTransform,
  valueUnion,
} from './authoring.js';

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

  it('authors generic containers without model dependencies', () => {
    const item = graphLiteral('ready');

    expect(valueArray<typeof item, 'ready'>(item, { minItems: 1 })).toEqual({
      kind: 'schema.array',
      item,
      minItems: 1,
    });
    expect(valueNullable<typeof item, 'ready'>(item)).toEqual({ kind: 'schema.nullable', item });
    expect(valueOptional<typeof item, 'ready'>(item)).toEqual({ kind: 'schema.optional', item });
    expect(valueUnion<readonly [typeof item], 'ready'>([item])).toEqual({
      kind: 'schema.union',
      options: [item],
    });
    expect(valueRecord<typeof item, 'ready'>(item)).toEqual({ kind: 'schema.record', value: item });
    expect(valueDefault<typeof item, 'ready'>(item, 'ready')).toEqual({
      kind: 'schema.default',
      item,
      defaultValue: 'ready',
    });
    expect(valueTransform<typeof item, 'ready', number>(item, value => value.length).kind).toBe(
      'schema.transform',
    );
    expect(
      valueRefine<typeof item, 'ready'>(item, value => value === 'ready', {
        message: 'Must be ready',
      }).kind,
    ).toBe('schema.refinement');
    expect(valueNamed<typeof item, 'ready'>('Status', item)).toEqual({
      kind: 'schema.named',
      name: 'Status',
      item,
    });
  });
});
