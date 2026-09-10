import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { executeMysql } from './client.js';
import type { MysqlEntityMapping } from './mapping.js';
import { MysqlDataGraphError } from './runtime-error.js';
export const invalidMysqlCommand = (message: string): never => {
  throw new MysqlDataGraphError(message, 'invalid_command');
};
export const requireMysqlOne = (count: number) => {
  if (count !== 1)
    throw new MysqlDataGraphError(
      `Expected exactly one affected row, got ${count}.`,
      'cardinality_mismatch',
      { actualAffectedRows: count },
    );
};

export const mappedMysqlFields = (mapping: MysqlEntityMapping, fields: readonly string[]) =>
  fields.map(field => {
    const column = mapping.columns[field];
    if (!column)
      return invalidMysqlCommand(
        `MySQL command field ${mapping.entity.name}.${field} is not stored or mapped.`,
      );
    return column;
  });

export const mysqlTableContract = async (client: PoolConnection, mapping: MysqlEntityMapping) => {
  const [tables] = await executeMysql<RowDataPacket[]>(
    client,
    'SELECT ENGINE AS engine FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [mapping.table],
  );
  if (tables[0]?.engine !== 'InnoDB')
    invalidMysqlCommand(`MySQL mutations require an InnoDB table for ${mapping.entity.name}.`);
  const [keys] = await executeMysql<RowDataPacket[]>(
    client,
    "SELECT COLUMN_NAME AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = 'PRIMARY' ORDER BY SEQ_IN_INDEX",
    [mapping.table],
  );
  const fields = keys.map(key =>
    Object.keys(mapping.columns).find(field => mapping.columns[field] === key.columnName),
  );
  if (!fields.length || fields.some(field => !field))
    invalidMysqlCommand(
      `MySQL mutations require a fully mapped PRIMARY KEY for ${mapping.entity.name}.`,
    );
  return fields as string[];
};

export const assertMysqlUniqueColumns = async (
  client: PoolConnection,
  table: string,
  columns: readonly string[],
) => {
  const [indexes] = await executeMysql<RowDataPacket[]>(
    client,
    'SELECT INDEX_NAME AS name, COLUMN_NAME AS columnName, SUB_PART AS prefix FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND NON_UNIQUE = 0 ORDER BY INDEX_NAME, SEQ_IN_INDEX',
    [table],
  );
  const groups = new Map<string, RowDataPacket[]>();
  for (const index of indexes) groups.set(index.name, [...(groups.get(index.name) ?? []), index]);
  const matches = [...groups.values()].some(
    index =>
      index.length === columns.length &&
      index.every(column => column.prefix === null && columns.includes(column.columnName)),
  );
  if (!columns.length || new Set(columns).size !== columns.length || !matches) {
    invalidMysqlCommand(`MySQL requires a full unique index on ${table} (${columns.join(', ')}).`);
  }
};
