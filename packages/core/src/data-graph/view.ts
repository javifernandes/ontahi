import { hasOwn, isRecord } from '../value/object.js';

import type {
  AnyEntityDefinition,
  EntityViewConfig,
  EntityViewDefinition,
  FieldDefinitions,
  GraphSchemaFields,
  InferEntityRecord,
  RelationDefinition,
  RelationKind,
} from './definitions.js';

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};
type EntityRecord<TEntity extends AnyEntityDefinition> = NonNullable<TEntity['__value']>;

export type FieldViewNode = {
  kind: 'field-view';
  field: string;
};

export type RelationViewNode = {
  kind: 'relation-view';
  relation: string;
  direction: 'forward' | 'inverse';
  targetEntity: string;
  cardinality: 'one' | 'many';
  nullable: boolean;
  view: ViewNode;
};

export type ViewNode = {
  kind: 'view-node';
  entity: string;
  fields: Record<string, FieldViewNode | RelationViewNode>;
};

export type EntityViewAst = {
  version: 1;
  kind: 'entity-view';
  name: string;
  entity: string;
  fields: Record<string, FieldViewNode | RelationViewNode>;
};

type RelationTarget<
  TEntity extends AnyEntityDefinition,
  TKey extends PropertyKey,
> = TKey extends keyof TEntity['fields']
  ? TEntity['fields'][TKey] extends {
      fieldType: 'reference';
      target: infer TTarget extends AnyEntityDefinition;
    }
    ? TTarget
    : RelationTargetFromDefinition<TEntity, TKey>
  : RelationTargetFromDefinition<TEntity, TKey>;

type RelationTargetFromDefinition<
  TEntity extends AnyEntityDefinition,
  TKey extends PropertyKey,
> = TKey extends keyof TEntity['relations']
  ? TEntity['relations'][TKey] extends RelationDefinition<
      RelationKind,
      infer TTarget extends AnyEntityDefinition
    >
    ? TTarget
    : never
  : never;

export type EntityViewShape<TEntity extends AnyEntityDefinition> = {
  [TKey in keyof TEntity['fields'] | keyof TEntity['relations']]?:
    | (TKey extends keyof TEntity['fields'] ? true : never)
    | (RelationTarget<TEntity, TKey> extends infer TTarget extends AnyEntityDefinition
        ? EntityViewShape<TTarget> | AnyRecursiveEntityViewDefinition<TTarget>
        : never);
};

type InferNestedViewResult<
  TRelation,
  TTarget extends AnyEntityDefinition,
  TValue,
> = TRelation extends {
  relationKind: infer TKind extends RelationKind;
  nullable?: infer TNullable;
}
  ? TValue extends {
      kind: 'entity-view';
      ast: EntityViewAst;
      __viewResult?: infer TResult;
    }
    ? TKind extends 'hasMany'
      ? TResult[]
      : TNullable extends true
        ? TResult | null
        : TResult
    : TValue extends object
      ? TKind extends 'hasMany'
        ? InferEntityViewShape<TTarget, TValue>[]
        : TNullable extends true
          ? InferEntityViewShape<TTarget, TValue> | null
          : InferEntityViewShape<TTarget, TValue>
      : never
  : never;

export type InferEntityViewShape<TEntity extends AnyEntityDefinition, TShape> = Simplify<{
  -readonly [TKey in keyof TShape]: TShape[TKey] extends true
    ? TKey extends keyof EntityRecord<TEntity>
      ? EntityRecord<TEntity>[TKey]
      : never
    : TKey extends keyof TEntity['relations']
      ? InferNestedViewResult<
          TEntity['relations'][TKey],
          RelationTarget<TEntity, TKey>,
          TShape[TKey]
        >
      : never;
}>;

type InferEntityViewShapeFromParts<
  TFields extends FieldDefinitions,
  TRelations extends Record<string, RelationDefinition<RelationKind, any>>,
  TShape,
> = Simplify<{
  -readonly [TKey in keyof TShape]: TShape[TKey] extends true
    ? TKey extends keyof InferEntityRecord<TFields>
      ? InferEntityRecord<TFields>[TKey]
      : never
    : TKey extends keyof TRelations
      ? InferNestedViewResult<
          TRelations[TKey],
          TKey extends keyof TFields
            ? TFields[TKey] extends {
                fieldType: 'reference';
                target: infer TTarget extends AnyEntityDefinition;
              }
              ? TTarget
              : TRelations[TKey]['target']
            : TRelations[TKey]['target'],
          TShape[TKey]
        >
      : never;
}>;

export type RecursiveEntityViewDefinition<
  TEntity extends AnyEntityDefinition,
  TShape extends EntityViewShape<TEntity>,
  TResult = InferEntityViewShape<TEntity, TShape>,
> = EntityViewDefinition<TEntity, string, {}, readonly []> & {
  ast: EntityViewAst;
  __entity?: TEntity;
  __shape?: TShape;
  __viewResult?: TResult;
  toJSON: () => EntityViewAst;
};

type AnyRecursiveEntityViewDefinition<TEntity extends AnyEntityDefinition = AnyEntityDefinition> =
  RecursiveEntityViewDefinition<TEntity, any, any>;

export type InferEntityViewResult<TView extends { __viewResult?: unknown }> = NonNullable<
  TView['__viewResult']
>;

export interface EntityViewFactory<
  TEntity extends AnyEntityDefinition,
  TFields extends FieldDefinitions = TEntity['fields'],
  TRelations extends Record<string, RelationDefinition<RelationKind, any>> = TEntity['relations'],
> {
  <TViewName extends string, const TShape extends EntityViewShape<TEntity>>(
    viewName: TViewName,
    shape: TShape,
  ): RecursiveEntityViewDefinition<
    TEntity,
    TShape,
    InferEntityViewShapeFromParts<TFields, TRelations, TShape>
  >;
  <
    TViewName extends string,
    TViewFields extends GraphSchemaFields = {},
    TOmit extends readonly (keyof TEntity['fields'] & string)[] = readonly [],
  >(
    viewName: TViewName,
    config?: EntityViewConfig<TEntity, TViewFields, TOmit>,
  ): EntityViewDefinition<TEntity, TViewName, TViewFields, TOmit>;
}

const isRecursiveEntityView = (value: unknown): value is AnyRecursiveEntityViewDefinition =>
  value !== null &&
  typeof value === 'object' &&
  'ast' in value &&
  (value as { ast?: { kind?: string } }).ast?.kind === 'entity-view';

const validateViewNode = (entity: AnyEntityDefinition, node: ViewNode): void => {
  if (node.kind !== 'view-node' || node.entity !== entity.name || !isRecord(node.fields)) {
    throw new Error(`View node does not target ${entity.name}.`);
  }

  Object.entries(node.fields).forEach(([name, child]) => {
    if (!isRecord(child)) throw new Error(`Invalid View node ${entity.name}.${name}.`);

    if (child.kind === 'field-view') {
      if (child.field !== name || !hasOwn(entity.fields, name)) {
        throw new Error(`Unknown field ${entity.name}.${name}.`);
      }
      return;
    }

    const relation = entity.relations[name];
    if (!relation || child.kind !== 'relation-view') {
      throw new Error(`Unknown relation ${entity.name}.${name}.`);
    }

    const expected = {
      relation: `${entity.name}.${name}`,
      direction: relation.relationKind === 'belongsTo' ? 'forward' : 'inverse',
      targetEntity: relation.target.name,
      cardinality: relation.relationKind === 'belongsTo' ? 'one' : 'many',
      nullable: relation.relationKind === 'belongsTo' && relation.nullable === true,
    };
    if (
      child.relation !== expected.relation ||
      child.direction !== expected.direction ||
      child.targetEntity !== expected.targetEntity ||
      child.cardinality !== expected.cardinality ||
      child.nullable !== expected.nullable ||
      !isRecord(child.view)
    ) {
      throw new Error(`View relation ${entity.name}.${name} does not match its definition.`);
    }
    validateViewNode(relation.target, child.view as ViewNode);
  });
};

export const createRecursiveEntityViewFromAst = <TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  ast: EntityViewAst,
): RecursiveEntityViewDefinition<TEntity, any, any> => {
  if (
    !isRecord(ast) ||
    ast.version !== 1 ||
    ast.kind !== 'entity-view' ||
    typeof ast.name !== 'string' ||
    ast.entity !== entity.name ||
    !isRecord(ast.fields)
  ) {
    throw new Error(`View does not target ${entity.name}.`);
  }

  validateViewNode(entity, {
    kind: 'view-node',
    entity: ast.entity,
    fields: ast.fields,
  });

  return {
    kind: 'entity-view',
    name: ast.name,
    entity,
    fields: {},
    omit: [],
    ast,
    toJSON: () => ast,
  } as RecursiveEntityViewDefinition<TEntity, any, any>;
};

const buildViewNode = <TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  shape: EntityViewShape<TEntity>,
): ViewNode => ({
  kind: 'view-node',
  entity: entity.name,
  fields: Object.fromEntries(
    Object.entries(shape).map(([name, value]) => {
      if (value === true) {
        if (!hasOwn(entity.fields, name)) {
          throw new Error(`Unknown field ${entity.name}.${name}.`);
        }
        return [name, { kind: 'field-view', field: name } satisfies FieldViewNode];
      }

      const relation = entity.relations[name];
      if (!relation) {
        throw new Error(`Unknown relation ${entity.name}.${name}.`);
      }

      const nestedView = isRecursiveEntityView(value)
        ? value.ast.entity === relation.target.name
          ? ({
              kind: 'view-node',
              entity: value.ast.entity,
              fields: value.ast.fields,
            } satisfies ViewNode)
          : (() => {
              throw new Error(
                `View ${value.name} targets ${value.ast.entity}, not ${relation.target.name}.`,
              );
            })()
        : buildViewNode(relation.target, value as EntityViewShape<typeof relation.target>);

      return [
        name,
        {
          kind: 'relation-view',
          relation: `${entity.name}.${name}`,
          direction: relation.relationKind === 'belongsTo' ? 'forward' : 'inverse',
          targetEntity: relation.target.name,
          cardinality: relation.relationKind === 'belongsTo' ? 'one' : 'many',
          nullable: relation.relationKind === 'belongsTo' && relation.nullable === true,
          view: nestedView,
        } satisfies RelationViewNode,
      ];
    }),
  ),
});

export const createRecursiveEntityView = <
  TEntity extends AnyEntityDefinition,
  TShape extends EntityViewShape<TEntity>,
>(
  entity: TEntity,
  name: string,
  shape: TShape,
): RecursiveEntityViewDefinition<TEntity, TShape> => {
  const node = buildViewNode(entity, shape);
  const ast: EntityViewAst = {
    version: 1,
    kind: 'entity-view',
    name,
    entity: entity.name,
    fields: node.fields,
  };

  return {
    kind: 'entity-view',
    name,
    entity,
    fields: {},
    omit: [],
    ast,
    toJSON: () => ast,
  } as RecursiveEntityViewDefinition<TEntity, TShape>;
};

export const isRecursiveViewShape = (config: unknown): config is Record<string, unknown> => {
  if (config === null || typeof config !== 'object') return false;

  return Object.entries(config).some(
    ([key, value]) => !['fields', 'omit'].includes(key) || value === true,
  );
};
