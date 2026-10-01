import { isRecord } from '../value/object.js';

import type { EntityMutationCommandPolicy } from './command-dispatcher.js';
import {
  graphSchema,
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type AnyFieldDefinition,
  type AnyGraphObjectDefinition,
  type GraphObjectDefinition,
  type GraphSchemaFields,
} from './definitions.js';
import { getEntityIdentityLocator } from './ref/index.js';
import {
  toGraphSchemaDescriptor,
  type GraphSchemaDescriptor,
  type GraphSchemaObjectDescriptor,
} from './schema-descriptor.js';
import type { SelectionPredicate } from './selection-ast.js';

export type EntityMutationAffordanceAction = 'create' | 'update' | 'delete';

type EntityMutationSelectionAffordance = {
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly schema: AnyFieldDefinition;
        readonly operators: readonly SelectionPredicate['operator'][];
      }
    >
  >;
  readonly allowAll?: true;
};

export type EntityMutationAffordance = {
  readonly kind: 'entity-mutation-affordance';
  readonly entity: AnyEntityDefinition;
  readonly action: EntityMutationAffordanceAction;
  readonly target?: {
    readonly exact: {
      readonly reference: ReturnType<typeof graphSchema.ref>;
      readonly locator: AnyGraphObjectDefinition;
    };
    readonly selection?: EntityMutationSelectionAffordance;
  };
  readonly values?: AnyGraphObjectDefinition;
  readonly condition?: AnyGraphObjectDefinition;
};

export type EntityMutationAffordanceDescriptor = {
  readonly kind: 'entity-mutation-affordance';
  readonly entityName: string;
  readonly action: EntityMutationAffordanceAction;
  readonly target?: {
    readonly exact: {
      readonly reference: GraphSchemaDescriptor;
      readonly locator: GraphSchemaObjectDescriptor;
    };
    readonly selection?: {
      readonly fields: Readonly<
        Record<
          string,
          {
            readonly schema: GraphSchemaDescriptor;
            readonly operators: readonly SelectionPredicate['operator'][];
          }
        >
      >;
      readonly allowAll?: true;
    };
  };
  readonly values?: GraphSchemaObjectDescriptor;
  readonly condition?: GraphSchemaObjectDescriptor;
};

const policyFields = (
  entity: AnyEntityDefinition,
  action: EntityMutationAffordanceAction,
  purpose: 'values' | 'condition' | 'selection',
  names: readonly string[],
): GraphSchemaFields =>
  Object.fromEntries(
    names.map(name => {
      const definition = entity.fields[name];
      if (!definition || isDerivedFieldDefinition(definition))
        throw new Error(
          `Entity Mutation affordance ${entity.name}.${action} has invalid ${purpose} Field ${name}.`,
        );
      if (purpose === 'values' && definition.generatedBy)
        throw new Error(
          `Entity Mutation affordance ${entity.name}.${action} cannot expose generated Field ${name}.`,
        );
      return [name, definition];
    }),
  );

const strictObject = (
  fields: GraphSchemaFields,
): GraphObjectDefinition<GraphSchemaFields, 'strict'> =>
  graphSchema.object(fields, { unknownKeys: 'strict' });

export const reflectEntityMutationAffordances = <TAuthority>(
  policy: EntityMutationCommandPolicy<any, TAuthority>,
): readonly EntityMutationAffordance[] =>
  (['create', 'update', 'delete'] as const).flatMap(action => {
    const declaration = policy.actions[action];
    if (!declaration) return [];
    const mutationFields = 'fields' in declaration ? declaration.fields : undefined;
    const conditionFields = 'if' in declaration ? declaration.if : undefined;
    const selectionDeclaration = 'selection' in declaration ? declaration.selection : undefined;
    const values =
      action === 'delete'
        ? undefined
        : strictObject(policyFields(policy.entity, action, 'values', mutationFields ?? []));
    const condition =
      action === 'create' || !conditionFields?.length
        ? undefined
        : strictObject(policyFields(policy.entity, action, 'condition', conditionFields));
    const selection =
      action === 'create' || !selectionDeclaration
        ? undefined
        : {
            fields: Object.fromEntries(
              Object.entries(selectionDeclaration.fields).map(([name, operators]) => {
                const schema = policyFields(policy.entity, action, 'selection', [name])[name]!;
                return [
                  name,
                  {
                    schema: schema as AnyFieldDefinition,
                    operators: operators as readonly SelectionPredicate['operator'][],
                  },
                ];
              }),
            ),
            ...(selectionDeclaration.allowAll ? { allowAll: true as const } : {}),
          };
    const identityFields = getEntityIdentityLocator(policy.entity)?.locator.fields ?? [];
    return [
      {
        kind: 'entity-mutation-affordance' as const,
        entity: policy.entity,
        action,
        ...(action === 'create'
          ? {}
          : {
              target: {
                exact: {
                  reference: graphSchema.ref(policy.entity),
                  locator: strictObject(
                    policyFields(policy.entity, action, 'condition', identityFields),
                  ),
                },
                ...(selection ? { selection } : {}),
              },
            }),
        ...(values ? { values } : {}),
        ...(condition ? { condition } : {}),
      },
    ];
  });

export const toEntityMutationAffordanceDescriptor = (
  affordance: EntityMutationAffordance,
): EntityMutationAffordanceDescriptor => ({
  kind: affordance.kind,
  entityName: affordance.entity.name,
  action: affordance.action,
  ...(affordance.target
    ? {
        target: {
          exact: {
            reference: toGraphSchemaDescriptor(affordance.target.exact.reference),
            locator: toGraphSchemaDescriptor(
              affordance.target.exact.locator,
            ) as GraphSchemaObjectDescriptor,
          },
          ...(affordance.target.selection
            ? {
                selection: {
                  fields: Object.fromEntries(
                    Object.entries(affordance.target.selection.fields).map(
                      ([name, { schema, operators }]) => [
                        name,
                        { schema: toGraphSchemaDescriptor(schema), operators: [...operators] },
                      ],
                    ),
                  ),
                  ...(affordance.target.selection.allowAll ? { allowAll: true as const } : {}),
                },
              }
            : {}),
        },
      }
    : {}),
  ...(affordance.values
    ? { values: toGraphSchemaDescriptor(affordance.values) as GraphSchemaObjectDescriptor }
    : {}),
  ...(affordance.condition
    ? { condition: toGraphSchemaDescriptor(affordance.condition) as GraphSchemaObjectDescriptor }
    : {}),
});

const mutationFieldSources = new Set([
  'caller-required',
  'caller-optional',
  'defaulted',
  'generated',
  'derived',
]);
const scalarTypes = new Set(['id', 'string', 'number', 'boolean', 'date', 'json', 'enum']);
const selectionOperators = new Set(['eq', 'in', 'isNull', 'lte', 'lt', 'gte', 'gt']);

const hasValidFieldSemantics = (value: Record<string, unknown>) =>
  value.field === undefined ||
  (isRecord(value.field) &&
    typeof value.field.source === 'string' &&
    mutationFieldSources.has(value.field.source) &&
    typeof value.field.nullable === 'boolean');

const isMutationFieldDescriptor = (value: unknown): value is GraphSchemaDescriptor => {
  if (!isRecord(value) || !hasValidFieldSemantics(value)) return false;
  if (value.kind === 'scalar') return typeof value.type === 'string' && scalarTypes.has(value.type);
  if (value.kind === 'entity-ref') return typeof value.entityName === 'string';
  if (
    ['nullable', 'optional', 'default', 'transform', 'refinement', 'named'].includes(
      String(value.kind),
    )
  )
    return isMutationFieldDescriptor(value.item);
  if (value.kind === 'literal')
    return ['string', 'number', 'boolean'].includes(typeof value.value) || value.value === null;
  return false;
};

const isMutationObjectDescriptor = (value: unknown): value is GraphSchemaObjectDescriptor =>
  isRecord(value) &&
  value.kind === 'object' &&
  value.unknownKeys === 'strict' &&
  isRecord(value.fields) &&
  Object.values(value.fields).every(isMutationFieldDescriptor);

const isWritableMutationFieldDescriptor = (value: unknown): boolean => {
  if (!isRecord(value) || !isMutationFieldDescriptor(value)) return false;
  if (
    isRecord(value.field) &&
    (value.field.source === 'generated' || value.field.source === 'derived')
  )
    return false;
  if (value.kind === 'scalar' && (value.readOnly === true || value.generatedBy || value.derived))
    return false;
  if (
    ['nullable', 'optional', 'default', 'transform', 'refinement', 'named'].includes(
      String(value.kind),
    ) &&
    'item' in value
  )
    return isWritableMutationFieldDescriptor(value.item);
  return true;
};

const isSelectionDescriptor = (value: unknown) =>
  isRecord(value) &&
  isRecord(value.fields) &&
  Object.values(value.fields).every(
    field =>
      isRecord(field) &&
      isMutationFieldDescriptor(field.schema) &&
      Array.isArray(field.operators) &&
      field.operators.length > 0 &&
      field.operators.every(
        operator => typeof operator === 'string' && selectionOperators.has(operator),
      ),
  ) &&
  (value.allowAll === undefined || value.allowAll === true);

export const isEntityMutationAffordanceDescriptor = (
  value: unknown,
): value is EntityMutationAffordanceDescriptor => {
  if (
    !isRecord(value) ||
    value.kind !== 'entity-mutation-affordance' ||
    typeof value.entityName !== 'string' ||
    value.entityName.trim() === '' ||
    !['create', 'update', 'delete'].includes(String(value.action))
  )
    return false;
  const targetValid =
    value.target === undefined ||
    (isRecord(value.target) &&
      isRecord(value.target.exact) &&
      isMutationFieldDescriptor(value.target.exact.reference) &&
      isRecord(value.target.exact.reference) &&
      value.target.exact.reference.kind === 'entity-ref' &&
      value.target.exact.reference.entityName === value.entityName &&
      isMutationObjectDescriptor(value.target.exact.locator) &&
      (value.target.selection === undefined || isSelectionDescriptor(value.target.selection)));
  if (!targetValid) return false;
  if (value.values !== undefined && !isMutationObjectDescriptor(value.values)) return false;
  if (
    isRecord(value.values) &&
    isRecord(value.values.fields) &&
    !Object.values(value.values.fields).every(isWritableMutationFieldDescriptor)
  )
    return false;
  if (value.condition !== undefined && !isMutationObjectDescriptor(value.condition)) return false;
  return value.action === 'create'
    ? value.target === undefined && value.values !== undefined && value.condition === undefined
    : value.action === 'update'
      ? value.target !== undefined && value.values !== undefined
      : value.target !== undefined && value.values === undefined;
};
