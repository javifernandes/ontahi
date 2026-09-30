import {
  graphSchema,
  type AnyEntityDefinition,
  type GraphReadPolicy,
  type GraphSchemaFields,
} from '../../data-graph/index.js';

import type { ModelGraphReadExposure } from './model-graph-read.js';

type EntityFieldName<TEntity extends AnyEntityDefinition> = keyof TEntity['fields'] & string;

export type ModelGraphReadExposureOptions<TEntity extends AnyEntityDefinition> = Pick<
  ModelGraphReadExposure,
  'description' | 'message'
> & {
  mode: 'run' | 'count';
  equals?: readonly EntityFieldName<TEntity>[];
  orderBy?: readonly EntityFieldName<TEntity>[];
  limit?: number;
  validate?: ModelGraphReadExposure['validate'];
};

const strict = (fields: GraphSchemaFields) => graphSchema.object(fields, { unknownKeys: 'strict' });

const union = (schemas: GraphSchemaFields[string][]) => graphSchema.union(schemas);

/** Reflects one bounded Model-facing read shape from an Entity read policy. */
export const createModelGraphReadExposure = <TEntity extends AnyEntityDefinition, TAuthority>(
  policy: GraphReadPolicy<TEntity, TAuthority>,
  options: ModelGraphReadExposureOptions<TEntity>,
): ModelGraphReadExposure => {
  if (!policy.modes.includes(options.mode))
    throw new Error(
      `Model ${policy.entity.name} ${options.mode} exposure has no matching read policy.`,
    );
  if (options.limit !== undefined) {
    if (options.mode !== 'run')
      throw new Error(`Model ${policy.entity.name} count exposure cannot declare a limit.`);
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > policy.maxLimit)
      throw new Error(
        `Model ${policy.entity.name} read exposure limit must be between 1 and ${policy.maxLimit}.`,
      );
  }

  const equals = options.equals ?? [];
  for (const fieldName of equals) {
    if (!policy.fields[fieldName]?.filter?.includes('eq'))
      throw new Error(
        `Model ${policy.entity.name} read exposure cannot filter ${fieldName} by equality outside its read policy.`,
      );
  }
  const orderBy = options.orderBy ?? [];
  for (const fieldName of orderBy) {
    if (!policy.fields[fieldName]?.order)
      throw new Error(
        `Model ${policy.entity.name} read exposure cannot order by ${fieldName} outside its read policy.`,
      );
  }

  const all = strict({ kind: graphSchema.literal('all') });
  const expressions = [
    all,
    ...equals.map(fieldName => {
      const value = { ...policy.entity.fields[fieldName]! };
      delete value.optional;
      delete value.defaultValue;
      return strict({
        kind: graphSchema.literal('predicate'),
        fieldName: graphSchema.literal(fieldName),
        operator: graphSchema.literal('eq'),
        value,
      });
    }),
  ];
  const simple = union(expressions);
  const selection = strict({
    kind: graphSchema.literal('selection'),
    entityName: graphSchema.literal(policy.entity.name),
    expression: union([
      simple,
      strict({ kind: graphSchema.literal('and'), operands: graphSchema.array(simple) }),
    ]),
  });
  const direction = union([graphSchema.literal('asc'), graphSchema.literal('desc')]);
  const orderByItem = strict({
    fieldName:
      orderBy.length === 0
        ? graphSchema.literal('')
        : union(orderBy.map(fieldName => graphSchema.literal(fieldName))),
    direction,
  });
  const orderBySchema = graphSchema.array(
    orderByItem,
    orderBy.length === 0 ? { maxItems: 0 } : undefined,
  );

  return {
    description: options.description,
    request: strict({
      version: graphSchema.literal(1),
      kind: graphSchema.literal('graph-read'),
      mode: graphSchema.literal(options.mode),
      selection,
      orderBy: orderBySchema,
      ...(options.limit === undefined ? {} : { limit: graphSchema.literal(options.limit) }),
    }),
    validate: options.validate ?? (() => undefined),
    ...(options.message ? { message: options.message } : {}),
  };
};
