import {
  assertPortableRelationConstraints,
  type RelationDefinition,
  type RelationOptions,
} from '../relation/definition.js';

import type { AnyEntityDefinition } from './definition.js';
import type { FieldDefinitions } from './field.js';
import {
  normalizeEntityLocatorDeclarations,
  type ConventionalEntityLocatorDeclarations,
  type EntityLocatorDeclarations,
  type EntityRefLocatorFactories,
} from './locator.js';
import type { EntityDisplayDescriptor, EntityFreshnessDescriptor } from './metadata.js';
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

type MutableEntityAuthoring = {
  name: string;
  fields: FieldDefinitions;
  relations: Record<string, RelationDefinition>;
  refLocators: Record<string, unknown>;
  identityLocatorName?: string;
  displayMetadata?: EntityDisplayDescriptor;
  freshnessMetadata?: EntityFreshnessDescriptor;
};

export const setEntityDisplayMetadata = (
  entity: MutableEntityAuthoring,
  metadata: EntityDisplayDescriptor,
): void => {
  entity.displayMetadata = metadata;
};

export const setEntityFreshnessMetadata = (
  entity: MutableEntityAuthoring,
  metadata: EntityFreshnessDescriptor,
): void => {
  entity.freshnessMetadata = metadata;
};

export const addEntityLocators = <
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
>(
  entity: MutableEntityAuthoring & { fields: TFields },
  locators: TLocators,
): void => {
  entity.refLocators = {
    ...entity.refLocators,
    ...normalizeEntityLocatorDeclarations<TFields, TLocators>(locators),
  };
};

export const setEntityIdentity = (entity: MutableEntityAuthoring, locatorName: string): void => {
  if (!(locatorName in entity.refLocators)) {
    throw new Error(`Unknown identity locator ${locatorName} on entity ${entity.name}`);
  }
  entity.identityLocatorName = locatorName;
};

export const addEntityRelation = (
  entity: MutableEntityAuthoring,
  relationName: string,
  relationKind: 'hasMany' | 'belongsTo' | 'manyToMany',
  target: AnyEntityDefinition,
  options?: RelationOptions,
): void => {
  if (relationKind === 'hasMany' && options?.onDelete && options.onDelete !== 'cascade') {
    throw new Error('hasMany Relations only support onDelete: cascade.');
  }
  if (relationKind === 'manyToMany' && options?.onDelete && options.onDelete !== 'detach') {
    throw new Error('manyToMany Relations only support onDelete: detach.');
  }
  assertPortableRelationConstraints(options?.constraints);
  entity.relations[relationName] = {
    kind: 'relation',
    relationKind,
    target,
    ...(relationKind === 'hasMany' && options?.via ? { targetField: options.via } : {}),
    ...(relationKind === 'belongsTo' && options?.via ? { sourceField: options.via } : {}),
    ...(relationKind === 'hasMany' && options?.ordered ? { ordered: true } : {}),
    ...(options?.onDelete ? { onDelete: options.onDelete } : {}),
    ...(options?.constraints ? { constraints: options.constraints } : {}),
  };
};
