import {
  getEntityMapping,
  resolveColumnNameForEntity,
  resolveRelationFields,
  type AnyEntityDefinition,
} from './definitions.js';
import {
  RelationQueryBuilder,
  resolveQuerySpec,
  type QuerySpec,
  type AnyRelationQueryBuilder,
  type QueryOrView,
  type SelectionValue,
} from './query.js';

const collectSelectionFieldNames = (
  selection: Record<string, SelectionValue> | undefined,
): string[] => {
  if (!selection) {
    return [];
  }

  const fieldNames = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if ((value as { kind?: string }).kind === 'field-ref') {
      fieldNames.add((value as { fieldName: string }).fieldName);
      return;
    }

    if (value instanceof RelationQueryBuilder) {
      return;
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      visit(nestedValue);
    }
  };

  for (const value of Object.values(selection)) {
    visit(value);
  }

  return [...fieldNames];
};

export const getSelectColumnsForQuery = ({
  entityDefinition,
  selectShape,
  includeShape,
}: {
  entityDefinition: AnyEntityDefinition;
  selectShape?: Record<string, SelectionValue>;
  includeShape?: Record<string, AnyRelationQueryBuilder>;
}) => {
  const fieldNames =
    selectShape == null
      ? Object.keys(entityDefinition.fields)
      : collectSelectionFieldNames(selectShape);

  const columns = new Set(
    fieldNames.map(fieldName => resolveColumnNameForEntity(entityDefinition, fieldName)),
  );

  for (const [relationName, relationBuilder] of Object.entries(includeShape ?? {})) {
    const relationNode = relationBuilder.toNodeSpec();
    const { sourceField } = resolveRelationFields(entityDefinition, relationName, relationNode);
    columns.add(resolveColumnNameForEntity(entityDefinition, sourceField));
  }

  return [...columns];
};

export type CompiledPredicate =
  | { operator: 'eq'; field: string; column: string; value: unknown }
  | { operator: 'in'; field: string; column: string; values: readonly unknown[] }
  | { operator: 'isNull'; field: string; column: string }
  | { operator: 'lte'; field: string; column: string; value: unknown }
  | { operator: 'lt'; field: string; column: string; value: unknown };

export type CompiledOrderBy = {
  field: string;
  column: string;
  direction: 'asc' | 'desc';
};

export type CompiledIncludePlan = {
  relationName: string;
  relationKind: 'hasMany' | 'belongsTo';
  sourceField: string;
  sourceColumn: string;
  targetField: string;
  targetColumn: string;
  targetEntity: string;
  targetTable: string;
  orderBy: CompiledOrderBy[];
  limit?: number;
  includes: CompiledIncludePlan[];
};

export type CompiledQueryPlan = {
  rootEntity: string;
  rootTable: string;
  where: CompiledPredicate[];
  orderBy: CompiledOrderBy[];
  limit?: number;
  includes: CompiledIncludePlan[];
};

const compileOrderBy = (
  entityDefinition: AnyEntityDefinition,
  orderBy: Array<{ fieldName: string; direction: 'asc' | 'desc' }>,
): CompiledOrderBy[] =>
  orderBy.map(order => ({
    field: order.fieldName,
    column: resolveColumnNameForEntity(entityDefinition, order.fieldName),
    direction: order.direction,
  }));

const compileIncludes = (
  entityDefinition: AnyEntityDefinition,
  includeShape: Record<string, AnyRelationQueryBuilder> | undefined,
): CompiledIncludePlan[] =>
  Object.entries(includeShape ?? {}).map(([relationName, relationBuilder]) => {
    const node = relationBuilder.toNodeSpec();
    const fields = resolveRelationFields(entityDefinition, relationName, node);
    const targetMapping = getEntityMapping(node.entity);

    return {
      relationName,
      relationKind: node.relationKind,
      sourceField: fields.sourceField,
      sourceColumn: resolveColumnNameForEntity(entityDefinition, fields.sourceField),
      targetField: fields.targetField,
      targetColumn: resolveColumnNameForEntity(node.entity, fields.targetField),
      targetEntity: node.entity.name,
      targetTable: targetMapping.tableName,
      orderBy: compileOrderBy(node.entity, node.orderBy),
      limit: node.limit,
      includes: compileIncludes(node.entity, node.includes),
    };
  });

export const compileResolvedQueryPlan = <TEntity extends AnyEntityDefinition, TResult>(
  spec: QuerySpec<TEntity, TResult>,
): CompiledQueryPlan => {
  const rootMapping = getEntityMapping(spec.root);

  return {
    rootEntity: spec.root.name,
    rootTable: rootMapping.tableName,
    where: spec.where.map(predicate => {
      if (predicate.operator === 'eq') {
        return {
          operator: 'eq' as const,
          field: predicate.fieldName,
          column: resolveColumnNameForEntity(spec.root, predicate.fieldName),
          value: predicate.value,
        };
      }

      if (predicate.operator === 'in') {
        return {
          operator: 'in' as const,
          field: predicate.fieldName,
          column: resolveColumnNameForEntity(spec.root, predicate.fieldName),
          values: predicate.values,
        };
      }

      if (predicate.operator === 'lte') {
        return {
          operator: 'lte' as const,
          field: predicate.fieldName,
          column: resolveColumnNameForEntity(spec.root, predicate.fieldName),
          value: predicate.value,
        };
      }

      if (predicate.operator === 'lt') {
        return {
          operator: 'lt' as const,
          field: predicate.fieldName,
          column: resolveColumnNameForEntity(spec.root, predicate.fieldName),
          value: predicate.value,
        };
      }

      return {
        operator: 'isNull' as const,
        field: predicate.fieldName,
        column: resolveColumnNameForEntity(spec.root, predicate.fieldName),
      };
    }),
    orderBy: compileOrderBy(spec.root, spec.orderBy),
    limit: spec.limit,
    includes: compileIncludes(spec.root, spec.includes),
  };
};

export const compileQueryPlan = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
): CompiledQueryPlan => compileResolvedQueryPlan(resolveQuerySpec(queryOrView, params));
