import type { RelationDefinition } from '../relation/definition.js';

import type { AnyEntityDefinition } from './definition.js';
import type { FieldDefinitions } from './field.js';
import {
  normalizeEntityLocatorDeclarations,
  type ConventionalEntityLocatorDeclarations,
  type EntityRefLocatorFactories,
} from './locator.js';
import { isReferenceFieldDefinition } from './reference-field.js';

export type ReferenceFieldRelations<TFields extends FieldDefinitions> = {
  [TFieldName in keyof TFields as TFields[TFieldName] extends {
    fieldType: 'reference';
    target: AnyEntityDefinition;
  }
    ? TFieldName
    : never]: TFields[TFieldName] extends {
    fieldType: 'reference';
    target: infer TTarget extends AnyEntityDefinition;
  }
    ? RelationDefinition<
        'belongsTo',
        TTarget,
        TFields[TFieldName] extends { nullable: true } | { optional: true } ? true : false
      >
    : never;
};

export const createEntityDefinitionState = <TName extends string, TFields extends FieldDefinitions>(
  name: TName,
  fields: TFields,
) => {
  const entityFields = Object.fromEntries(
    Object.entries(fields).map(([fieldName, definition]) => {
      if (isReferenceFieldDefinition(definition) && definition.variant) {
        throw new TypeError(
          'Variant references are supported as Operation inputs, not stored Reference Fields yet.',
        );
      }
      return [fieldName, isReferenceFieldDefinition(definition) ? { ...definition } : definition];
    }),
  ) as TFields;
  const hasConventionalId =
    entityFields.id?.fieldType === 'id' && !entityFields.id.nullable && !entityFields.id.optional;
  const refLocators = normalizeEntityLocatorDeclarations<
    TFields,
    ConventionalEntityLocatorDeclarations<TFields>
  >((hasConventionalId ? { refById: 'id' } : {}) as ConventionalEntityLocatorDeclarations<TFields>);
  const relations = Object.fromEntries(
    Object.entries(entityFields).flatMap(([fieldName, definition]) =>
      isReferenceFieldDefinition(definition)
        ? [
            [
              fieldName,
              {
                kind: 'relation' as const,
                relationKind: 'belongsTo' as const,
                target: definition.target,
                sourceField: fieldName,
                nullable: Boolean(definition.nullable || definition.optional),
              },
            ],
          ]
        : [],
    ),
  ) as ReferenceFieldRelations<TFields>;

  return {
    kind: 'entity' as const,
    name,
    fields: entityFields,
    relations,
    refLocators: refLocators as EntityRefLocatorFactories<
      TFields,
      ConventionalEntityLocatorDeclarations<TFields>
    >,
    identityLocatorName: hasConventionalId ? ('refById' as const) : undefined,
  };
};

export const bindReferenceFieldSources = (
  fields: FieldDefinitions,
  source: AnyEntityDefinition,
): void => {
  Object.entries(fields).forEach(([fieldName, definition]) => {
    if (!isReferenceFieldDefinition(definition)) return;
    Object.defineProperties(definition, {
      source: { configurable: true, value: source },
      fieldName: { configurable: true, value: fieldName },
    });
  });
};
