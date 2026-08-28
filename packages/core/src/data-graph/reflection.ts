import type { OperationInvocationResult } from '../runtime/contracts.js';

import {
  getEntityMapping,
  resolveFieldNameForEntity,
  type AnyEntityDefinition,
  type RelationDefinition,
  type RelationConstraint,
  type RelationKind,
} from './definitions.js';
import type { PortableOperationConditions } from './model-expression/index.js';
import type {
  DomainOperationExecutionMetadata,
  OperationExecutionAffordance,
} from './operation-execution.js';
import type { AnyEntityRef } from './ref/index.js';
import type { EntityViewAst } from './view.js';

export type ReflectedSchemaRelation = {
  relationId: string;
  subjectEntityName: string;
  targetEntityName: string;
  name: string;
  declaredRelationName: string;
  declaredOnEntityName: string;
  kind: RelationKind;
  provenance: 'declared' | 'derived-inverse';
  direction: 'forward' | 'inverse';
  cardinality: 'one' | 'many';
  nullable?: boolean;
  required?: boolean;
  structuralVerbs: Array<'assign' | 'clear' | 'add' | 'remove'>;
  sourceField?: string;
  targetField?: string;
  constraints?: readonly RelationConstraint[];
};

const hasDeclaredInverse = (
  source: AnyEntityDefinition,
  relation: RelationDefinition<RelationKind, AnyEntityDefinition>,
) =>
  Object.values(relation.target.relations ?? {}).some(candidate => {
    if (candidate.target !== source) return false;

    return (
      (relation.relationKind === 'belongsTo' &&
        candidate.relationKind === 'hasMany' &&
        candidate.targetField === relation.sourceField) ||
      (relation.relationKind === 'hasMany' &&
        candidate.relationKind === 'belongsTo' &&
        candidate.sourceField === relation.targetField) ||
      (relation.relationKind === 'manyToMany' && candidate.relationKind === 'manyToMany')
    );
  });

const reflectedDeclaredRelation = (
  source: AnyEntityDefinition,
  name: string,
  relation: RelationDefinition<RelationKind, AnyEntityDefinition>,
): ReflectedSchemaRelation => {
  const nullable = relation.relationKind === 'belongsTo' && Boolean(relation.nullable);

  return {
    relationId: `${source.name}.${name}`,
    subjectEntityName: source.name,
    targetEntityName: relation.target.name,
    name,
    declaredRelationName: name,
    declaredOnEntityName: source.name,
    kind: relation.relationKind,
    provenance: 'declared',
    direction: relation.relationKind === 'hasMany' ? 'inverse' : 'forward',
    cardinality: relation.relationKind === 'belongsTo' ? 'one' : 'many',
    ...(relation.relationKind === 'belongsTo' ? { nullable, required: !nullable } : {}),
    structuralVerbs:
      relation.relationKind === 'belongsTo'
        ? nullable
          ? ['assign', 'clear']
          : ['assign']
        : ['add', 'remove'],
    ...(relation.sourceField ? { sourceField: relation.sourceField } : {}),
    ...(relation.targetField ? { targetField: relation.targetField } : {}),
    ...(relation.constraints ? { constraints: relation.constraints } : {}),
  };
};

const reflectedInverseRelation = (
  source: AnyEntityDefinition,
  name: string,
  relation: RelationDefinition<RelationKind, AnyEntityDefinition>,
): ReflectedSchemaRelation => ({
  relationId: `${source.name}.${name}`,
  subjectEntityName: relation.target.name,
  targetEntityName: source.name,
  name: `${source.name}.${name}`,
  declaredRelationName: name,
  declaredOnEntityName: source.name,
  kind:
    relation.relationKind === 'belongsTo'
      ? 'hasMany'
      : relation.relationKind === 'hasMany'
        ? 'belongsTo'
        : 'manyToMany',
  provenance: 'derived-inverse',
  direction: relation.relationKind === 'hasMany' ? 'forward' : 'inverse',
  cardinality: relation.relationKind === 'hasMany' ? 'one' : 'many',
  structuralVerbs: [],
  ...(relation.sourceField ? { targetField: relation.sourceField } : {}),
  ...(relation.targetField ? { sourceField: relation.targetField } : {}),
});

/** Reflects both declared Relation endpoints and read-only structural inverse endpoints. */
export const reflectSchemaRelations = (
  entities: readonly AnyEntityDefinition[],
): ReflectedSchemaRelation[] =>
  entities.flatMap(source =>
    Object.entries(source.relations ?? {}).flatMap(([name, relation]) => {
      const declared = reflectedDeclaredRelation(source, name, relation);
      return hasDeclaredInverse(source, relation)
        ? [declared]
        : [declared, reflectedInverseRelation(source, name, relation)];
    }),
  );

export type ReflectedOperationDescriptor<TInput = unknown, TData = unknown> = {
  id: string;
  entityName: string;
  name: string;
  kind?: 'graph' | 'domain' | 'durable';
  authority?: string;
  exposure?: string;
  execution?: DomainOperationExecutionMetadata;
  conditions?: PortableOperationConditions;
  _input?: TInput;
  _data?: TData;
};

export type ReflectedOperationInvocation<TInput = unknown> = {
  operationId: string;
  input: TInput;
  operation?: ReflectedOperationDescriptor<TInput, unknown>;
  view?: EntityViewAst;
};

export type ReflectedOperationInvoker = {
  canInvokeOperation?: (operation: ReflectedOperationDescriptor) => boolean;
  getOperationExecutionAffordance?: (
    operation: ReflectedOperationDescriptor,
  ) => OperationExecutionAffordance | undefined;
  invokeOperation: <TInput = unknown, TData = unknown>(
    invocation: ReflectedOperationInvocation<TInput>,
  ) => Promise<OperationInvocationResult<TData>>;
};

export type ReflectedEntityDataFilterOperator = 'contains' | 'equals' | 'in' | 'isNull';

export type ReflectedEntityDataFilter = {
  field: string;
  operator: ReflectedEntityDataFilterOperator;
  value?: string;
  values?: readonly unknown[];
};

export type ReflectedEntityDataSort = {
  field: string;
  direction: 'asc' | 'desc';
};

export type ReflectedEntityDataQuery = {
  entityName: string;
  search?: string;
  filters?: ReflectedEntityDataFilter[];
  sort?: ReflectedEntityDataSort;
  page?: number;
  pageSize?: number;
};

export type ReflectedEntityDataColumn = {
  field: string;
  type: string;
  nullable: boolean;
};

export type ReflectedEntityDataOmittedColumn = {
  field: string;
  column: string;
  reason: string;
};

export type ReflectedEntityDisplayDescriptor = {
  primary?: string;
  secondary?: string[];
  search?: string[];
};

export type ReflectedEntityDataResult = {
  entityName: string;
  columns: ReflectedEntityDataColumn[];
  display?: ReflectedEntityDisplayDescriptor;
  omittedColumns?: ReflectedEntityDataOmittedColumn[];
  rows: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ReflectedEntityDataReader = {
  readEntityData: (query: ReflectedEntityDataQuery) => Promise<ReflectedEntityDataResult>;
};

export type ReflectedRelatedEntityDataQuery = {
  source: AnyEntityRef;
  relationName: string;
  sourceEntityName: string;
  targetEntityName: string;
  page?: number;
  pageSize?: number;
};

/**
 * Host capability for Relation-root Queries. Implementations must execute through the configured
 * graph runtime and graph-read policy; Explorer never falls back to provider or table access.
 */
export type ReflectedRelatedEntityDataReader = {
  readRelatedEntityData: (
    query: ReflectedRelatedEntityDataQuery,
  ) => Promise<ReflectedEntityDataResult>;
};

type EntityDisplayLike = {
  displayMetadata?: {
    primary?: unknown;
    secondary?: unknown;
    search?: unknown;
  };
};

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : undefined;

export const describeReflectedEntityDisplay = (
  entity: unknown,
): ReflectedEntityDisplayDescriptor | undefined => {
  const display = (entity as EntityDisplayLike | undefined)?.displayMetadata;

  if (!display) {
    return undefined;
  }

  const descriptor: ReflectedEntityDisplayDescriptor = {};

  if (typeof display.primary === 'string') {
    descriptor.primary = display.primary;
  }

  const secondary = stringArray(display.secondary);
  if (secondary && secondary.length > 0) {
    descriptor.secondary = secondary;
  }

  const search = stringArray(display.search);
  if (search && search.length > 0) {
    descriptor.search = search;
  }

  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
};

type RelationDisplayPath = {
  path: string;
  relationName: string;
  targetField: string;
};

const relationDisplayPaths = (display: ReflectedEntityDisplayDescriptor | undefined) =>
  [display?.primary, ...(display?.secondary ?? [])]
    .filter((path): path is string => Boolean(path))
    .flatMap(path => {
      const [relationName, targetField, ...rest] = path.split('.');

      return relationName && targetField && rest.length === 0
        ? [{ path, relationName, targetField }]
        : [];
    });

const getIdentityField = (entity: AnyEntityDefinition) => {
  const identityName = entity.identityLocatorName;
  const fields = identityName ? entity.refLocators[identityName]?.fields : undefined;

  return fields?.length === 1 ? fields[0] : entity.fields.id ? 'id' : undefined;
};

const resolveBelongsToDisplayJoin = (source: AnyEntityDefinition, relationName: string) => {
  const relation = source.relations[relationName] as
    | RelationDefinition<RelationKind, AnyEntityDefinition>
    | undefined;

  if (!relation || relation.relationKind !== 'belongsTo') {
    return undefined;
  }

  const target = relation.target;
  const mapping = relation.mapping;

  if (mapping) {
    const sourceTable = getEntityMapping(source).tableName;
    const sourceUsesFrom = mapping.fromTable === sourceTable;
    const sourceUsesTo = mapping.toTable === sourceTable;

    if (sourceUsesFrom || sourceUsesTo) {
      return {
        target,
        sourceField: resolveFieldNameForEntity(
          source,
          sourceUsesFrom ? mapping.fromColumn : mapping.toColumn,
        ),
        targetField: resolveFieldNameForEntity(
          target,
          sourceUsesFrom ? mapping.toColumn : mapping.fromColumn,
        ),
      };
    }
  }

  const targetField = getIdentityField(target);
  return relation.sourceField && targetField
    ? { target, sourceField: relation.sourceField, targetField }
    : undefined;
};

const uniqueValues = (rows: readonly Record<string, unknown>[], field: string) => [
  ...new Set(rows.map(row => row[field]).filter(value => value != null)),
];

export const createRelationAwareReflectedEntityDataReader = ({
  entities,
  readEntityData,
}: {
  entities: readonly AnyEntityDefinition[];
  readEntityData: ReflectedEntityDataReader['readEntityData'];
}): ReflectedEntityDataReader => {
  const entitiesByName = new Map(entities.map(entity => [entity.name, entity]));

  return {
    readEntityData: async query => {
      const result = await readEntityData(query);
      const entity = entitiesByName.get(query.entityName);
      const paths = relationDisplayPaths(result.display);

      if (!entity || result.rows.length === 0 || paths.length === 0) {
        return result;
      }

      const rows = result.rows.map(row => ({ ...row }));
      const pathsByRelation = new Map<string, RelationDisplayPath[]>();
      paths.forEach(path => {
        pathsByRelation.set(path.relationName, [
          ...(pathsByRelation.get(path.relationName) ?? []),
          path,
        ]);
      });

      await Promise.all(
        [...pathsByRelation].map(async ([relationName, relationPaths]) => {
          const join = resolveBelongsToDisplayJoin(entity, relationName);
          if (!join) return;

          const sourceValues = uniqueValues(rows, join.sourceField);
          if (sourceValues.length === 0) return;

          const related = await readEntityData({
            entityName: join.target.name,
            filters: [
              {
                field: join.targetField,
                operator: 'in',
                values: sourceValues,
              },
            ],
            page: 1,
            pageSize: 100,
          });
          const relatedByValue = new Map(
            related.rows.map(row => [row[join.targetField], row] as const),
          );

          rows.forEach(row => {
            const relatedRow = relatedByValue.get(row[join.sourceField]);
            if (!relatedRow) return;

            relationPaths.forEach(({ path, targetField }) => {
              row[path] = relatedRow[targetField];
            });
          });
        }),
      );

      return { ...result, rows };
    },
  };
};
