import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  FieldDefinition as LegacyFieldDefinition,
  InferEntityMutationRecord as LegacyInferEntityMutationRecord,
} from '../../data-graph/definitions.js';

import {
  isDerivedFieldDefinition,
  type FieldDefinition,
  type InferEntityMutationRecord,
} from './field.js';

type BookFields = {
  id: FieldDefinition<string> & { fieldType: 'id'; generatedBy: 'database' };
  title: FieldDefinition<string>;
  subtitle: FieldDefinition<string | undefined> & { optional: true };
  slug: FieldDefinition<string> & { defaultValue: string };
  summary: FieldDefinition<string> & { derived: {} };
};

describe('Entity Field model', () => {
  it('keeps derived-field detection in the portable model', () => {
    expect(
      isDerivedFieldDefinition({
        kind: 'field',
        fieldType: 'string',
        derived: { dependencies: [{ kind: 'field', field: 'title' }] },
      }),
    ).toBe(true);
  });

  it('infers writable mutation records without generated or derived Fields', () => {
    expectTypeOf<InferEntityMutationRecord<BookFields>>().toEqualTypeOf<{
      title: string;
      subtitle?: string;
      slug?: string;
    }>();
  });

  it('preserves the historical data-graph type surface', () => {
    expectTypeOf<LegacyFieldDefinition<string>>().toEqualTypeOf<FieldDefinition<string>>();
    expectTypeOf<LegacyInferEntityMutationRecord<BookFields>>().toEqualTypeOf<
      InferEntityMutationRecord<BookFields>
    >();
  });
});
