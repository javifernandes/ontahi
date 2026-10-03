import {
  graphSchema,
  reflectEntityMutationAffordances,
  type AnyEntityDefinition,
  type AnyFieldDefinition,
  type EntityMutationCommandPolicy,
  type GraphSchemaDefinition,
  type GraphSchemaFields,
  type StoredFieldName,
  type WritableStoredFieldName,
} from '../../../../data-graph/index.js';
import type { JsonPrimitive } from '../../../../value/json.js';

import type { ModelGraphCommandExposure } from './graph.js';

type EntityFieldName<TEntity extends AnyEntityDefinition> = StoredFieldName<TEntity['fields']> &
  string;
type WritableEntityFieldName<TEntity extends AnyEntityDefinition> = WritableStoredFieldName<
  TEntity['fields']
> &
  string;

type ModelEntityMutationPresentation = Pick<
  ModelGraphCommandExposure,
  'description' | 'message'
> & {
  validate?: ModelGraphCommandExposure['validate'];
};

type ModelEntityMutationValueShape<TEntity extends AnyEntityDefinition> = {
  values: readonly WritableEntityFieldName<TEntity>[];
  valueLiterals?: Partial<Record<WritableEntityFieldName<TEntity>, JsonPrimitive>>;
};

type ModelEntityMutationConditionShape<TEntity extends AnyEntityDefinition> = {
  condition?: readonly EntityFieldName<TEntity>[];
  conditionLiterals?: Partial<Record<EntityFieldName<TEntity>, JsonPrimitive>>;
};

export type ModelEntityMutationExposureOptions<TEntity extends AnyEntityDefinition> =
  ModelEntityMutationPresentation &
    (
      | ({ action: 'create' } & ModelEntityMutationValueShape<TEntity>)
      | ({ action: 'update' } & ModelEntityMutationValueShape<TEntity> &
          ModelEntityMutationConditionShape<TEntity>)
      | ({ action: 'delete' } & ModelEntityMutationConditionShape<TEntity>)
    );

const strict = (fields: GraphSchemaFields) => graphSchema.object(fields, { unknownKeys: 'strict' });

const assertFieldsAllowed = (
  entityName: string,
  action: string,
  purpose: 'values' | 'condition',
  requested: readonly string[],
  allowed: readonly string[] | undefined,
) => {
  if (requested.length === 0)
    throw new Error(
      `Model ${entityName} ${action} exposure requires at least one ${purpose} field.`,
    );
  const invalid = requested.find(fieldName => !allowed?.includes(fieldName));
  if (invalid)
    throw new Error(
      `Model ${entityName} ${action} exposure cannot use ${purpose} field ${invalid} outside its command policy.`,
    );
};

const projectFields = (
  entityName: string,
  available: GraphSchemaFields,
  names: readonly string[],
  literals: Partial<Record<string, JsonPrimitive>> | undefined,
  presence: 'entity' | 'required',
): GraphSchemaFields =>
  Object.fromEntries(
    names.map(name => {
      const field = available[name] as AnyFieldDefinition | undefined;
      if (!field) throw new Error(`Unknown field ${entityName}.${name} in Model command exposure.`);
      const hasLiteral = Object.prototype.hasOwnProperty.call(literals ?? {}, name);
      const literalValue = hasLiteral ? literals![name]! : undefined;
      const literal = hasLiteral
        ? ({ kind: 'schema.literal', value: literalValue } as unknown as GraphSchemaDefinition)
        : undefined;
      let definition: GraphSchemaDefinition;
      if (presence === 'entity') {
        definition = literal
          ? Object.prototype.hasOwnProperty.call(field, 'defaultValue')
            ? ({
                kind: 'schema.default',
                item: literal,
                defaultValue: literalValue,
              } as unknown as GraphSchemaDefinition)
            : field.optional
              ? ({
                  kind: 'schema.optional',
                  item: literal,
                } as unknown as GraphSchemaDefinition)
              : literal
          : field;
      } else if (literal) {
        definition = literal;
      } else {
        const required = { ...field };
        delete required.optional;
        delete required.defaultValue;
        definition = required;
      }
      return [name, definition];
    }),
  );

const assertLiteralFieldsProjected = (
  entityName: string,
  purpose: 'values' | 'condition',
  fields: readonly string[],
  literals: Partial<Record<string, JsonPrimitive>> | undefined,
) => {
  const unprojected = Object.keys(literals ?? {}).find(fieldName => !fields.includes(fieldName));
  if (unprojected)
    throw new Error(
      `Model ${entityName} exposure literal ${purpose} field ${unprojected} is not projected.`,
    );
};

/**
 * Reflects one exact Model-facing mutation shape from an Entity command policy.
 * Execution is still independently checked by the policy-backed command dispatcher.
 */
export const createModelEntityMutationExposure = <TEntity extends AnyEntityDefinition, TAuthority>(
  policy: EntityMutationCommandPolicy<TEntity, TAuthority>,
  options: ModelEntityMutationExposureOptions<TEntity>,
): ModelGraphCommandExposure => {
  const affordance = reflectEntityMutationAffordances(policy).find(
    candidate => candidate.action === options.action,
  );
  if (!affordance)
    throw new Error(
      `Model ${policy.entity.name} ${options.action} exposure has no matching command policy.`,
    );

  const condition = options.action === 'create' ? undefined : options.condition;
  const conditionLiterals = options.action === 'create' ? undefined : options.conditionLiterals;
  const values = options.action === 'delete' ? undefined : options.values;
  const valueLiterals = options.action === 'delete' ? undefined : options.valueLiterals;

  if (values) {
    assertFieldsAllowed(
      policy.entity.name,
      options.action,
      'values',
      values,
      affordance.values ? Object.keys(affordance.values.fields) : undefined,
    );
    assertLiteralFieldsProjected(policy.entity.name, 'values', values, valueLiterals);
  }
  if (condition) {
    assertFieldsAllowed(
      policy.entity.name,
      options.action,
      'condition',
      condition,
      affordance.condition ? Object.keys(affordance.condition.fields) : undefined,
    );
    assertLiteralFieldsProjected(policy.entity.name, 'condition', condition, conditionLiterals);
  } else if (conditionLiterals && Object.keys(conditionLiterals).length > 0) {
    throw new Error(`Model ${policy.entity.name} exposure has condition literals without fields.`);
  }

  const command = strict({
    kind: graphSchema.literal('entity-mutation-command'),
    action: graphSchema.literal(options.action),
    entityName: graphSchema.literal(policy.entity.name),
    ...(affordance.target ? { target: affordance.target.exact.reference } : {}),
    ...(values
      ? {
          values: strict(
            projectFields(
              policy.entity.name,
              affordance.values!.fields,
              values,
              valueLiterals,
              options.action === 'create' ? 'entity' : 'required',
            ),
          ),
        }
      : {}),
    ...(condition
      ? {
          if: strict(
            projectFields(
              policy.entity.name,
              affordance.condition!.fields,
              condition,
              conditionLiterals,
              'required',
            ),
          ),
        }
      : {}),
  });

  return {
    description: options.description,
    request: strict({
      version: graphSchema.literal(condition ? 2 : 1),
      kind: graphSchema.literal('graph-command'),
      command,
    }),
    validate: options.validate ?? (() => undefined),
    ...(options.message ? { message: options.message } : {}),
  };
};
