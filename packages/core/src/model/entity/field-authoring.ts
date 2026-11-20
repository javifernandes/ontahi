import {
  assertModelExpressionProgram,
  collectModelExpressionDependencies,
  type ModelExpressionProgram,
} from '../expression/program.js';

import type { AnyEntityDefinition } from './definition.js';
import type {
  AnyFieldDefinition,
  DefaultedFieldDefinition,
  DerivedFieldMetadata,
  GeneratedFieldDefinition,
  InferFieldValue,
} from './field.js';
import type { DeferredEntityReference, ReferenceFieldDefinition } from './reference-field.js';
import { scalarField } from './scalar-field-authoring.js';

export const field = {
  ...scalarField,
  ref: <TTarget extends AnyEntityDefinition>(
    target: TTarget | DeferredEntityReference<TTarget>,
  ): ReferenceFieldDefinition<TTarget> => ({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
  }),
  existingRef: <TTarget extends AnyEntityDefinition>(
    target: TTarget | DeferredEntityReference<TTarget>,
  ): ReferenceFieldDefinition<TTarget> & { mutationRequirement: 'existing' } => ({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
    mutationRequirement: 'existing',
  }),
  derived: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    authoring:
      | ModelExpressionProgram
      | ((model: Record<string, any>) => InferFieldValue<TDefinition>),
  ): TDefinition & { derived: DerivedFieldMetadata } => {
    if (definition.fieldType === 'id' || definition.fieldType === 'reference') {
      throw new TypeError('Derived Fields must use a non-identity scalar Field definition.');
    }
    if (typeof authoring === 'function') return { ...definition, derived: {} };

    assertModelExpressionProgram(authoring);
    return {
      ...definition,
      derived: {
        expression: authoring,
        dependencies: collectModelExpressionDependencies(authoring),
      },
    };
  },
  nullable: <TDefinition extends AnyFieldDefinition>(definition: TDefinition) =>
    ({ ...definition, nullable: true }) as Omit<TDefinition, '__value' | 'nullable'> & {
      nullable: true;
      __value?: InferFieldValue<TDefinition> | null;
    },
  optional: <TDefinition extends AnyFieldDefinition>(definition: TDefinition) =>
    ({ ...definition, optional: true }) as Omit<TDefinition, '__value' | 'optional'> & {
      optional: true;
      __value?: InferFieldValue<TDefinition> | undefined;
    },
  default: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    defaultValue: InferFieldValue<TDefinition>,
  ): DefaultedFieldDefinition<TDefinition> => {
    if (
      definition.optional ||
      definition.derived ||
      definition.fieldType === 'id' ||
      definition.fieldType === 'reference'
    ) {
      throw new TypeError(
        'Stored Field defaults require a non-optional, non-derived scalar Field other than id.',
      );
    }
    if (defaultValue === undefined)
      throw new TypeError('Stored Field defaults cannot be undefined.');
    return { ...definition, defaultValue } as DefaultedFieldDefinition<TDefinition>;
  },
  generated: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    generator: string,
  ): GeneratedFieldDefinition<TDefinition> => {
    if (
      definition.optional ||
      definition.derived ||
      Object.prototype.hasOwnProperty.call(definition, 'defaultValue') ||
      definition.fieldType === 'reference'
    ) {
      throw new TypeError(
        'Generated stored Fields require a non-optional, non-derived scalar Field without a default.',
      );
    }
    if (generator.trim().length === 0) {
      throw new TypeError('Generated stored Fields require a generator name.');
    }
    return { ...definition, generatedBy: generator } as GeneratedFieldDefinition<TDefinition>;
  },
};
