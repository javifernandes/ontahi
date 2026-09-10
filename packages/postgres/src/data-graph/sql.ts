import {
  lowerEntityReferenceRecord,
  isDerivedFieldDefinition,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import { createSqlQueryCompiler, type ParameterizedSql } from '@ontahi/sql';

import { postgresDialect } from './dialect.js';
import type { PostgresEntityMapping } from './mapping.js';
export type {
  ParameterizedSql,
  SqlSelectionLeafCompiler as PostgresSelectionLeafCompiler,
} from '@ontahi/sql';
export const quotePostgresIdentifier = postgresDialect.quoteIdentifier;
const quoteIdentifier = quotePostgresIdentifier;
const compiler = createSqlQueryCompiler(postgresDialect);
export const compilePostgresQuery = compiler.compileQuery;
export const compilePostgresSelection = compiler.compileSelection;
export const compilePostgresSelectionWith = compiler.compileSelectionWith;

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
  const derivedFields = fields.filter(fieldName =>
    isDerivedFieldDefinition(command.root.fields[fieldName]!),
  );
  if (derivedFields.length > 0) {
    throw new Error(
      `PostgreSQL Commands cannot return virtual derived Fields on ${command.root.name}: ${derivedFields.join(', ')}. Read them through a Query instead.`,
    );
  }
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
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object') continue;
    const derivedFields = Object.keys(payload).filter(fieldName => {
      const field = command.root.fields[fieldName];
      return field ? isDerivedFieldDefinition(field) : false;
    });
    if (derivedFields.length > 0) {
      throw new Error(
        `Cannot assign derived Fields on ${command.root.name}: ${derivedFields.join(', ')}.`,
      );
    }
  }
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
