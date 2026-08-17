import type { AnyEntityDefinition } from './definitions.js';
import {
  RelationQueryBuilder,
  type AnyRelationQueryBuilder,
  type QuerySpec,
  type SelectionValue,
} from './query.js';
import type { RecursiveEntityViewDefinition, ViewNode } from './view.js';

type CompiledViewShape = {
  select: Record<string, SelectionValue>;
  includes: Record<string, AnyRelationQueryBuilder>;
};

const compileViewNode = (
  entity: AnyEntityDefinition,
  node: Pick<ViewNode, 'entity' | 'fields'>,
): CompiledViewShape => {
  if (node.entity !== entity.name) {
    throw new Error(`View node targets ${node.entity}, not ${entity.name}.`);
  }

  const select: Record<string, SelectionValue> = {};
  const includes: Record<string, AnyRelationQueryBuilder> = {};

  for (const [key, field] of Object.entries(node.fields)) {
    if (field.kind === 'field-view') {
      if (!(field.field in entity.fields)) {
        throw new Error(`View field ${entity.name}.${field.field} does not exist.`);
      }
      select[key] = { kind: 'field-ref', fieldName: field.field } as SelectionValue;
      continue;
    }

    const relation = entity.relations[key];
    if (!relation) {
      throw new Error(`Unknown relation ${entity.name}.${key} in view.`);
    }
    const expected = {
      relation: `${entity.name}.${key}`,
      direction: relation.relationKind === 'belongsTo' ? 'forward' : 'inverse',
      targetEntity: relation.target.name,
      cardinality: relation.relationKind === 'belongsTo' ? 'one' : 'many',
      nullable: relation.relationKind === 'belongsTo' && relation.nullable === true,
    } as const;
    for (const property of Object.keys(expected) as Array<keyof typeof expected>) {
      if (field[property] !== expected[property]) {
        throw new Error(
          `View relation ${entity.name}.${key} has incompatible ${property}: expected ${String(expected[property])}, received ${String(field[property])}.`,
        );
      }
    }
    const nested = compileViewNode(relation.target, field.view);
    includes[key] = new RelationQueryBuilder(
      key,
      relation.relationKind,
      relation.target,
      nested.select,
      nested.includes,
    );
  }

  return { select, includes };
};

export const applyViewToQuerySpec = <
  TEntity extends AnyEntityDefinition,
  TResult,
  TView extends RecursiveEntityViewDefinition<TEntity, any, any>,
>(
  spec: QuerySpec<TEntity, TResult>,
  view: TView,
): QuerySpec<TEntity, NonNullable<TView['__viewResult']>> => {
  if (view.ast.entity !== spec.root.name) {
    throw new Error(`Cannot apply ${view.name} (${view.ast.entity}) to ${spec.root.name}.`);
  }
  const compiled = compileViewNode(spec.root, view.ast);

  return {
    ...spec,
    select: compiled.select,
    includes: compiled.includes,
    view: view.ast,
  } as QuerySpec<TEntity, NonNullable<TView['__viewResult']>>;
};
