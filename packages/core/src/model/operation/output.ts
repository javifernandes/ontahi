import type { AnyEntityDefinition } from '../entity/definition.js';

export type GraphOutputDescriptor =
  | GraphOutputOpaqueDescriptor
  | GraphOutputEntityDescriptor
  | GraphOutputArrayDescriptor
  | GraphOutputObjectDescriptor
  | GraphOutputNullableDescriptor
  | GraphOutputOptionalDescriptor;

export interface GraphOutputObjectFields {
  readonly [fieldName: string]: GraphOutputDescriptor;
}

export type GraphOutputOpaqueDescriptor = {
  kind: 'graph-output.opaque';
};

export type GraphOutputEntityDescriptor<TEntity extends AnyEntityDefinition = AnyEntityDefinition> =
  {
    kind: 'graph-output.entity';
    entity: TEntity;
    fields?: GraphOutputObjectFields;
  };

export type GraphOutputArrayDescriptor = {
  kind: 'graph-output.array';
  item: GraphOutputDescriptor;
};

export type GraphOutputObjectDescriptor = {
  kind: 'graph-output.object';
  fields: GraphOutputObjectFields;
};

export type GraphOutputNullableDescriptor = {
  kind: 'graph-output.nullable';
  item: GraphOutputDescriptor;
};

export type GraphOutputOptionalDescriptor = {
  kind: 'graph-output.optional';
  item: GraphOutputDescriptor;
};

function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
): GraphOutputEntityDescriptor<TEntity>;
function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  fields: GraphOutputObjectFields,
): GraphOutputEntityDescriptor<TEntity>;
function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  fields?: GraphOutputObjectFields,
): GraphOutputEntityDescriptor<TEntity> {
  return {
    kind: 'graph-output.entity',
    entity,
    ...(fields ? { fields } : {}),
  };
}

export const graphOutput = {
  opaque: (): GraphOutputOpaqueDescriptor => ({
    kind: 'graph-output.opaque',
  }),
  entity: graphOutputEntity,
  array: (item: GraphOutputDescriptor): GraphOutputArrayDescriptor => ({
    kind: 'graph-output.array',
    item,
  }),
  object: <TFields extends GraphOutputObjectFields>(
    fields: TFields,
  ): GraphOutputObjectDescriptor => ({
    kind: 'graph-output.object',
    fields,
  }),
  nullable: (item: GraphOutputDescriptor): GraphOutputNullableDescriptor => ({
    kind: 'graph-output.nullable',
    item,
  }),
  optional: (item: GraphOutputDescriptor): GraphOutputOptionalDescriptor => ({
    kind: 'graph-output.optional',
    item,
  }),
};
