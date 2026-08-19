import {
  lowerSelectionReferences,
  lowerEntityReferenceRecord,
  lowerEntityReferenceSelection,
  resolveQuerySpec,
  type GraphCommandSpec,
  type QueryOrView,
  type QuerySpec,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';

export type ParameterizedSql = {
  text: string;
  values: unknown[];
};

export const quotePostgresIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

const quoteIdentifier = quotePostgresIdentifier;

export const compilePostgresSelection = (
  expression: SelectionExpression,
  mapping: PostgresEntityMapping,
  values: unknown[],
): string => {
  const lowered = lowerSelectionReferences(expression);

  if (lowered.kind === 'all') return 'TRUE';
  if (lowered.kind === 'none') return 'FALSE';
  if (lowered.kind === 'and' || lowered.kind === 'or') {
    return `(${lowered.operands
      .map(operand => compilePostgresSelection(operand, mapping, values))
      .join(lowered.kind === 'and' ? ' AND ' : ' OR ')})`;
  }
  if (lowered.kind === 'not') {
    return `(NOT ${compilePostgresSelection(lowered.operand, mapping, values)})`;
  }
  if (lowered.kind === 'references') {
    throw new Error('PostgreSQL selection references could not be lowered.');
  }

  const predicate = lowerEntityReferenceSelection(mapping.entity, lowered);
  if (predicate.kind !== 'predicate') {
    throw new Error('PostgreSQL selection predicate could not be lowered.');
  }

  const column = mapping.columns[predicate.fieldName];
  if (!column) {
    throw new Error(`Field ${mapping.entity.name}.${predicate.fieldName} is not mapped.`);
  }
  const quotedColumn = quoteIdentifier(column);

  if (predicate.operator === 'isNull') return `${quotedColumn} IS NULL`;
  if (predicate.operator === 'in') {
    if (predicate.values.length === 0) return 'FALSE';
    const placeholders = predicate.values.map(value => {
      values.push(value);
      return `$${values.length}`;
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
  return `${quotedColumn} ${operator} $${values.length}`;
};

const columnsFor = (mapping: PostgresEntityMapping) =>
  Object.entries(mapping.columns).map(
    ([field, column]) => `${quoteIdentifier(column)} AS ${quoteIdentifier(field)}`,
  );

export const compilePostgresQuery = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  mapping: PostgresEntityMapping,
  options: { count?: boolean } = {},
): ParameterizedSql => {
  const spec = resolveQuerySpec(queryOrView, params) as QuerySpec;
  if (spec.root !== mapping.entity) {
    throw new Error(`PostgreSQL mapping does not match query root ${spec.root.name}.`);
  }

  const values: unknown[] = [];
  const selection = compilePostgresSelection(spec.selection, mapping, values);
  const order = options.count
    ? ''
    : spec.orderBy
        .map(orderSpec => {
          const column = mapping.columns[orderSpec.fieldName];
          if (!column) {
            throw new Error(`Field ${mapping.entity.name}.${orderSpec.fieldName} is not mapped.`);
          }
          return (
            `${quoteIdentifier(column)} ${orderSpec.direction.toUpperCase()}` +
            (orderSpec.direction === 'asc' ? ' NULLS FIRST' : ' NULLS LAST')
          );
        })
        .join(', ');
  const limit = !options.count && spec.limit != null ? ` LIMIT ${spec.limit}` : '';

  return {
    text:
      `SELECT ${options.count ? 'COUNT(*)::int AS "count"' : columnsFor(mapping).join(', ')}` +
      ` FROM ${quoteIdentifier(mapping.table)} WHERE ${selection}` +
      `${order ? ` ORDER BY ${order}` : ''}${limit}`,
    values,
  };
};

const returningClause = (
  command: GraphCommandSpec,
  mapping: PostgresEntityMapping,
  forceProbe: boolean,
) => {
  const fields = command.returning?.length
    ? command.returning
    : forceProbe
      ? [Object.keys(mapping.columns)[0]!]
      : [];
  return fields.length
    ? ` RETURNING ${fields
        .map(field => `${quoteIdentifier(mapping.columns[field]!)} AS ${quoteIdentifier(field)}`)
        .join(', ')}`
    : '';
};

export const compilePostgresCommand = (
  command: GraphCommandSpec,
  mapping: PostgresEntityMapping,
): ParameterizedSql => {
  if (command.root !== mapping.entity) {
    throw new Error(`PostgreSQL mapping does not match command root ${command.root.name}.`);
  }

  const values: unknown[] = [];
  const payloads = Array.isArray(command.payload) ? command.payload : [command.payload];
  const returning = returningClause(command, mapping, command.cardinality === 'one');

  if (
    command.operation === 'insert' ||
    command.operation === 'insert_many' ||
    command.operation === 'upsert'
  ) {
    const rows = (payloads as Array<Record<string, unknown>>).map(row =>
      lowerEntityReferenceRecord(command.root, row),
    );
    if (rows.length === 0) {
      throw new Error('PostgreSQL insert requires at least one row.');
    }
    const fields = Object.keys(rows[0]!);
    const conflictFields = command.upsert?.conflictOn ?? [];
    if (command.operation === 'upsert' && conflictFields.length === 0) {
      throw new Error('PostgreSQL upsert requires at least one conflict field.');
    }
    if (
      command.operation === 'upsert' &&
      rows.some(row => conflictFields.some(field => row[field] === undefined))
    ) {
      throw new Error('PostgreSQL upsert payload is missing a conflict field.');
    }
    const tuples = rows.map(row => {
      const placeholders = fields.map(field => {
        values.push(row[field]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const conflict =
      command.operation === 'upsert'
        ? ` ON CONFLICT (${conflictFields
            .map(field => quoteIdentifier(mapping.columns[field]!))
            .join(', ')}) ${
            command.upsert?.strategy === 'ignore'
              ? 'DO NOTHING'
              : `DO UPDATE SET ${fields
                  .map(
                    field =>
                      `${quoteIdentifier(mapping.columns[field]!)} = EXCLUDED.${quoteIdentifier(
                        mapping.columns[field]!,
                      )}`,
                  )
                  .join(', ')}`
          }`
        : '';
    return {
      text:
        `INSERT INTO ${quoteIdentifier(mapping.table)}` +
        ` (${fields.map(field => quoteIdentifier(mapping.columns[field]!)).join(', ')})` +
        ` VALUES ${tuples.join(', ')}${conflict}${returning}`,
      values,
    };
  }

  const selection = compilePostgresSelection(command.selection, mapping, values);
  const cardinalityGuard =
    command.cardinality === 'one'
      ? ` AND (SELECT COUNT(*) FROM ${quoteIdentifier(mapping.table)} WHERE ${selection}) = 1`
      : '';
  if (command.operation === 'delete') {
    return {
      text: `DELETE FROM ${quoteIdentifier(mapping.table)} WHERE ${selection}${cardinalityGuard}${returning}`,
      values,
    };
  }

  const payload = lowerEntityReferenceRecord(
    command.root,
    command.payload as Record<string, unknown>,
  );
  const assignments = Object.entries(payload).map(([field, value]) => {
    values.push(value);
    return `${quoteIdentifier(mapping.columns[field]!)} = $${values.length}`;
  });
  return {
    text:
      `UPDATE ${quoteIdentifier(mapping.table)} SET ${assignments.join(', ')}` +
      ` WHERE ${selection}${cardinalityGuard}${returning}`,
    values,
  };
};
