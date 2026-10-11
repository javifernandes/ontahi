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

type ModelEntityMutationSelectionShape<TEntity extends AnyEntityDefinition> = {
  selection?: readonly EntityFieldName<TEntity>[];
  selectionLiterals?: Partial<Record<EntityFieldName<TEntity>, JsonPrimitive>>;
};

export type ModelEntityMutationExposureOptions<TEntity extends AnyEntityDefinition> =
  ModelEntityMutationPresentation &
    (
      | ({ action: 'create' } & ModelEntityMutationValueShape<TEntity>)
      | ({ action: 'update' } & ModelEntityMutationValueShape<TEntity> &
          ModelEntityMutationConditionShape<TEntity> &
          ModelEntityMutationSelectionShape<TEntity>)
      | ({ action: 'delete' } & ModelEntityMutationConditionShape<TEntity> &
          ModelEntityMutationSelectionShape<TEntity>)
    );

const strict = (fields: GraphSchemaFields) => graphSchema.object(fields, { unknownKeys: 'strict' });

const assertFieldsAllowed = (
  entityName: string,
  action: string,
  purpose: 'values' | 'condition' | 'selection',
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
  purpose: 'values' | 'condition' | 'selection',
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
  const selection = options.action === 'create' ? undefined : options.selection;
  const selectionLiterals = options.action === 'create' ? undefined : options.selectionLiterals;
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
  if (selection) {
    if (condition?.length)
      throw new Error(
        `Model ${policy.entity.name} ${options.action} exposure cannot combine Selection and exact conditions.`,
      );
    assertFieldsAllowed(
      policy.entity.name,
      options.action,
      'selection',
      selection,
      affordance.target?.selection ? Object.keys(affordance.target.selection.fields) : undefined,
    );
    assertLiteralFieldsProjected(policy.entity.name, 'selection', selection, selectionLiterals);
  } else if (selectionLiterals && Object.keys(selectionLiterals).length > 0) {
    throw new Error(`Model ${policy.entity.name} exposure has Selection literals without fields.`);
  }

  const selectionExpression = selection
    ? (() => {
        const predicates = selection.map(fieldName => {
          const field = policy.entity.fields[fieldName]!;
          const hasLiteral = Object.prototype.hasOwnProperty.call(
            selectionLiterals ?? {},
            fieldName,
          );
          const value = hasLiteral
            ? graphSchema.literal(selectionLiterals![fieldName]!)
            : (() => {
                const required = { ...field };
                delete required.optional;
                delete required.defaultValue;
                return required;
              })();
          return strict({
            kind: graphSchema.literal('predicate'),
            fieldName: graphSchema.literal(fieldName),
            operator: graphSchema.literal('eq'),
            value,
          });
        });
        const predicate = graphSchema.union(predicates);
        const expression = graphSchema.union([
          predicate,
          strict({
            kind: graphSchema.literal('and'),
            operands: graphSchema.array(predicate, { minItems: 1, maxItems: selection.length }),
          }),
        ]);
        const requiredFields = Object.keys(selectionLiterals ?? {});
        return graphSchema.refine(
          expression,
          value => {
            const selectionValue = value as {
              readonly kind: 'predicate' | 'and';
              readonly fieldName?: string;
              readonly operands?: readonly { readonly fieldName: string }[];
            };
            const fieldNames =
              selectionValue.kind === 'and'
                ? selectionValue.operands!.map(operand => operand.fieldName)
                : [selectionValue.fieldName!];
            return (
              new Set(fieldNames).size === fieldNames.length &&
              requiredFields.every(fieldName => fieldNames.includes(fieldName))
            );
          },
          {
            message:
              'Selection predicates must use distinct fields and include every fixed predicate.',
            rule: 'model-command-selection-bounds',
          },
        );
      })()
    : undefined;

  const command = strict({
    kind: graphSchema.literal('entity-mutation-command'),
    action: graphSchema.literal(options.action),
    entityName: graphSchema.literal(policy.entity.name),
    ...(selectionExpression
      ? {
          target: strict({
            kind: graphSchema.literal('selection'),
            entityName: graphSchema.literal(policy.entity.name),
            expression: selectionExpression,
          }),
        }
      : affordance.target
        ? { target: affordance.target.exact.reference }
        : {}),
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
      version: graphSchema.literal(selectionExpression ? 3 : condition ? 2 : 1),
      kind: graphSchema.literal('graph-command'),
      command,
    }),
    validate: options.validate ?? (() => undefined),
    ...(options.message ? { message: options.message } : {}),
  };
};
