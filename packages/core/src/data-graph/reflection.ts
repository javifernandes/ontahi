import type { OperationInvocationResult } from '../runtime/contracts.js';

import {
  getEntityMapping,
  resolveFieldNameForEntity,
  type AnyEntityDefinition,
  type RelationDefinition,
  type RelationKind,
} from './definitions.js';

export type ReflectedOperationDescriptor<TInput = unknown, TData = unknown> = {
  id: string;
  entityName: string;
  name: string;
  kind?: 'graph' | 'domain' | 'durable';
  authority?: string;
  exposure?: string;
  _input?: TInput;
  _data?: TData;
};

export type ReflectedOperationInvocation<TInput = unknown> = {
  operationId: string;
  input: TInput;
  operation?: ReflectedOperationDescriptor<TInput, unknown>;
};

export type ReflectedOperationInvoker = {
  canInvokeOperation?: (operation: ReflectedOperationDescriptor) => boolean;
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
