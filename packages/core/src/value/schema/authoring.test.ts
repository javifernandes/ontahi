import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  graphLiteral as legacyGraphLiteral,
  graphVoid as legacyGraphVoid,
} from '../../data-graph/definitions.js';

import {
  defineValue,
  describeGraphSchema,
  graphLiteral,
  graphVoid,
  pickValueFields,
  presentGraphSchema,
  valueArray,
  valueDefault,
  valueLazy,
  valueNamed,
  valueNullable,
  valueOptional,
  valueRecord,
  valueRefine,
  valueTransform,
  valueUnion,
  valueObject,
} from './authoring.js';
import type { ValueSchemaFieldSource } from './definition.js';

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
    const lazy = valueLazy<typeof item, 'ready'>('LazyStatus', () => item);
    expect(lazy.kind).toBe('schema.lazy');
    expect(lazy.resolve()).toBe(item);
    expectTypeOf(lazy.__value).toEqualTypeOf<'ready' | undefined>();
  });

  it('authors value and object shapes without model dependencies', () => {
    const status = graphLiteral('ready');
    const fields = { status };

    expect(
      defineValue<'StatusValue', typeof fields, { status: 'ready' }>('StatusValue', fields),
    ).toEqual({
      kind: 'value',
      name: 'StatusValue',
      fields,
    });
    expect(
      valueObject<typeof fields, 'strict', { status: 'ready' }>(fields, {
        unknownKeys: 'strict',
        description: 'Status object',
      }),
    ).toEqual({
      kind: 'schema.object',
      fields,
      unknownKeys: 'strict',
      description: 'Status object',
    });
  });

  it('derives portable named values from selected fields', () => {
    const ready = graphLiteral('ready');
    const source = valueObject({ ready, ignored: graphLiteral(false) });
    const picked = pickValueFields<typeof source, readonly ['ready'], { ready: 'ready' }>(source, [
      'ready',
    ]).named('ReadyValue');

    expect(picked).toEqual({
      kind: 'value',
      name: 'ReadyValue',
      fields: { ready },
      derivedFrom: {
        operation: 'pick',
        source: { kind: 'object' },
        fields: ['ready'],
      },
    });
    expectTypeOf(picked.__value).toEqualTypeOf<{ ready: 'ready' } | undefined>();
  });

  it('rejects unknown fields at the portable value boundary', () => {
    const source: ValueSchemaFieldSource = valueObject({ ready: graphLiteral('ready') });

    expect(() => pickValueFields(source, ['missing'])).toThrow(
      'Cannot pick unknown field missing from schema.object',
    );
    expect(() => pickValueFields(source, ['toString'])).toThrow(
      'Cannot pick unknown field toString from schema.object',
    );
  });

  it('snapshots pick provenance before callers can mutate their inputs', () => {
    const source = {
      kind: 'value' as const,
      name: 'SourceValue',
      fields: { ready: graphLiteral('ready'), ignored: graphLiteral(false) },
    };
    const keys: (keyof typeof source.fields)[] = ['ready'];
    const builder = pickValueFields<typeof source, typeof keys, { ready: 'ready' }>(source, keys);

    keys[0] = 'ignored';
    source.name = 'ChangedSource';

    expect(builder.named('ReadyValue').derivedFrom).toEqual({
      operation: 'pick',
      source: { kind: 'value', name: 'SourceValue' },
      fields: ['ready'],
    });
  });
});
