import {
  RelationQueryBuilder,
  lowerSelectionReferences,
  lowerEntityReferenceSelection,
  isDerivedFieldDefinition,
  resolveQuerySpec,
  resolveRelationFields,
  type AnyRelationQueryBuilder,
  type QueryOrView,
  type QuerySpec,
  type SelectionExpression,
  type SelectionPredicate,
} from '@ontahi/core/data-graph';

import { createSqlDerivedFieldCompiler } from './derived-field.js';
import type { SqlDialect } from './dialect.js';
import type { SqlEntityMapping } from './mapping.js';

export type ParameterizedSql = {
  text: string;
  values: unknown[];
};

export type SqlSelectionLeafCompiler = (
  predicate: SelectionPredicate,
  quotedColumn: string,
  values: unknown[],
) => string;
export const createSqlQueryCompiler = (dialect: SqlDialect) => {
  const quoteIdentifier = dialect.quoteIdentifier;
  const compileSqlDerivedField = createSqlDerivedFieldCompiler(dialect);
  const resolveSqlFieldSql = (mapping: SqlEntityMapping, fieldName: string) => {
    const column = mapping.columns[fieldName];
    if (column) return quoteIdentifier(column);

    const field = mapping.entity.fields[fieldName];
    if (field && isDerivedFieldDefinition(field) && field.derived.expression) {
      return compileSqlDerivedField(mapping.entity, mapping, field.derived.expression);
    }
    return undefined;
  };

  const compileSqlSelectionTree = (
    expression: SelectionExpression,
    mapping: SqlEntityMapping,
    values: unknown[],
    compileLeaf: SqlSelectionLeafCompiler,
    description: string,
  ): string => {
    switch (expression.kind) {
      case 'relation-image':
        throw new TypeError('SQL does not yet support relation-image Selections.');
      case 'all':
        return 'TRUE';
      case 'none':
        return 'FALSE';
      case 'and':
      case 'or':
        return `(${expression.operands
          .map(operand =>
            compileSqlSelectionTree(operand, mapping, values, compileLeaf, description),
          )
          .join(expression.kind === 'and' ? ' AND ' : ' OR ')})`;
      case 'not':
        return `(NOT ${compileSqlSelectionTree(
          expression.operand,
          mapping,
          values,
          compileLeaf,
          description,
        )})`;
      case 'references':
        throw new Error(`SQL ${description} references could not be lowered.`);
    }

    const predicate = lowerEntityReferenceSelection(mapping.entity, expression);
    if (predicate.kind !== 'predicate') {
      throw new Error(`SQL ${description} predicate could not be lowered.`);
    }
    const fieldSql = resolveSqlFieldSql(mapping, predicate.fieldName);
    if (!fieldSql)
      throw new Error(`Field ${mapping.entity.name}.${predicate.fieldName} is not mapped.`);
    return compileLeaf(predicate, fieldSql, values);
  };

  const compileSqlSelectionWith = (
    expression: SelectionExpression,
    mapping: SqlEntityMapping,
    values: unknown[],
    compileLeaf: SqlSelectionLeafCompiler,
    description = 'selection',
  ): string =>
    compileSqlSelectionTree(
      lowerSelectionReferences(expression),
      mapping,
      values,
      compileLeaf,
      description,
    );

  const compileSqlSelectionLeaf: SqlSelectionLeafCompiler = (predicate, quotedColumn, values) => {
    if (predicate.operator === 'isNull') return `${quotedColumn} IS NULL`;
    if (predicate.operator === 'in') {
      if (predicate.values.length === 0) return 'FALSE';
      const placeholders = predicate.values.map(value => {
        values.push(value);
        return dialect.placeholder(values.length);
      });
      return `${quotedColumn} IN (${placeholders.join(', ')})`;
    }

    values.push(predicate.value);
    const operator = {
      eq: '=',
      lte: '<=',
      lt: '<',
      gte: '>=',
      gt: '>',
    }[predicate.operator];
    return `${quotedColumn} ${operator} ${dialect.placeholder(values.length)}`;
  };

  const compileSqlSelection = (
    expression: SelectionExpression,
    mapping: SqlEntityMapping,
    values: unknown[],
  ): string => compileSqlSelectionWith(expression, mapping, values, compileSqlSelectionLeaf);

  const collectSelectedFieldNames = (selection: Record<string, unknown>) => {
    const selected = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ((value as { kind?: string }).kind === 'field-ref') {
        selected.add((value as { fieldName: string }).fieldName);
        return;
      }
      if (value instanceof RelationQueryBuilder) return;
      Object.values(value as Record<string, unknown>).forEach(visit);
    };
    Object.values(selection).forEach(visit);
    return selected;
  };

  const collectRelationBuilders = (spec: QuerySpec) => {
    const relations: AnyRelationQueryBuilder[] = [];
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (value instanceof RelationQueryBuilder) {
        relations.push(value);
        return;
      }
      Object.values(value as Record<string, unknown>).forEach(visit);
    };
    Object.values(spec.select ?? {}).forEach(visit);
    Object.values(spec.includes ?? {}).forEach(visit);
    return relations;
  };

  const relationSourceField = (mapping: SqlEntityMapping, relation: AnyRelationQueryBuilder) => {
    const node = relation.toNodeSpec();
    const definition = mapping.entity.relations[node.relationName];
    if (definition?.relationKind !== 'manyToMany') {
      return resolveRelationFields(mapping.entity, node.relationName, node).sourceField;
    }
    if (definition.mapping?.type !== 'many-to-many') {
      throw new Error(
        `SQL many-to-many Relation ${mapping.entity.name}.${node.relationName} is not mapped.`,
      );
    }
    const sourceField = Object.entries(mapping.columns).find(
      ([, column]) => column === definition.mapping!.fromColumn,
    )?.[0];
    if (!sourceField) {
      throw new Error(
        `SQL many-to-many Relation ${mapping.entity.name}.${node.relationName} does not match Entity mappings.`,
      );
    }
    return sourceField;
  };

  const columnForField = (mapping: SqlEntityMapping, spec: QuerySpec, fieldName: string) => {
    const column = mapping.columns[fieldName];
    if (column) return `${quoteIdentifier(column)} AS ${quoteIdentifier(fieldName)}`;

    const field = spec.root.fields[fieldName];
    if (!field || !isDerivedFieldDefinition(field) || !field.derived.expression) {
      throw new Error(`Field ${spec.root.name}.${fieldName} is not mapped.`);
    }
    return `${compileSqlDerivedField(spec.root, mapping, field.derived.expression)} AS ${quoteIdentifier(fieldName)}`;
  };

  const columnsFor = (
    mapping: SqlEntityMapping,
    spec: QuerySpec,
    projectedFields?: readonly string[],
  ) => {
    if (!spec.select && !projectedFields) {
      return [
        ...Object.entries(mapping.columns).map(
          ([field, column]) => `${quoteIdentifier(column)} AS ${quoteIdentifier(field)}`,
        ),
        ...Object.entries(spec.root.fields)
          .filter(([, field]) => isDerivedFieldDefinition(field))
          .map(([fieldName]) => columnForField(mapping, spec, fieldName)),
      ];
    }

    const selected = projectedFields
      ? new Set(projectedFields)
      : collectSelectedFieldNames(spec.select!);
    if (!projectedFields) {
      collectRelationBuilders(spec).forEach(relation =>
        selected.add(relationSourceField(mapping, relation)),
      );
    }
    const columns = [...selected].map(fieldName => columnForField(mapping, spec, fieldName));
    return columns.length > 0 ? columns : [`1 AS ${quoteIdentifier('__ontahi_row')}`];
  };

  const compileSqlQuery = <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    mapping: SqlEntityMapping,
    options: {
      count?: boolean;
      projectedFields?: readonly string[];
      physicalOrderBy?: readonly string[];
    } = {},
  ): ParameterizedSql => {
    const spec = resolveQuerySpec(queryOrView, params) as QuerySpec;
    if (spec.root !== mapping.entity) {
      throw new Error(`SQL mapping does not match query root ${spec.root.name}.`);
    }

    const values: unknown[] = [];
    const selection = compileSqlSelection(spec.selection, mapping, values);
    let order = '';
    if (!options.count && spec.orderBy.length > 0) {
      order = spec.orderBy
        .map(orderSpec => {
          const fieldSql = resolveSqlFieldSql(mapping, orderSpec.fieldName);
          if (!fieldSql) {
            throw new Error(`Field ${mapping.entity.name}.${orderSpec.fieldName} is not mapped.`);
          }
          return dialect.order(
            fieldSql,
            orderSpec.direction,
            orderSpec.direction === 'asc' ? 'first' : 'last',
          );
        })
        .join(', ');
    } else if (!options.count) {
      order = (options.physicalOrderBy ?? [])
        .map(column => dialect.order(quoteIdentifier(column), 'asc', 'last'))
        .join(', ');
    }
    const limit = !options.count && spec.limit != null ? ` LIMIT ${spec.limit}` : '';

    const projection = options.count
      ? `${dialect.countExpression} AS ${quoteIdentifier('count')}`
      : columnsFor(mapping, spec, options.projectedFields).join(', ');
    const orderClause = order ? ` ORDER BY ${order}` : '';
    return {
      text: `SELECT ${projection} FROM ${quoteIdentifier(mapping.table)} WHERE ${selection}${orderClause}${limit}`,
      values,
    };
  };

  return {
    compileQuery: compileSqlQuery,
    compileSelection: compileSqlSelection,
    compileSelectionWith: compileSqlSelectionWith,
  };
};
