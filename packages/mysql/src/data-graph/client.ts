import type { AnyEntityDefinition } from '@ontahi/core/data-graph';
import type { ParameterizedSql } from '@ontahi/sql';
import type { Pool, RowDataPacket, ExecuteValues, QueryResult } from 'mysql2/promise';

import { MysqlDataGraphError } from './runtime-error.js';

export type MysqlQueryClient = Pick<Pool, 'execute'>;

// mysql2 reports TINYINT(1) as numbers. Conversion follows the Entity field, not the column width.
export const normalizeMysqlRecord = (entity: AnyEntityDefinition, row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const definition = entity.fields[key] as { fieldType?: string } | undefined;
      if (definition?.fieldType === 'boolean' && value != null) {
        if (value !== 0 && value !== 1 && typeof value !== 'boolean') {
          throw new MysqlDataGraphError(`Invalid MySQL boolean for ${entity.name}.${key}.`);
        }
        return [key, Boolean(value)];
      }
      return [key, value];
    }),
  );

export const executeMysql = <TResult extends QueryResult>(
  client: MysqlQueryClient,
  text: string,
  values: unknown[],
) => client.execute<TResult>(text, values as ExecuteValues[]);

export const createMysqlQueryExecutor =
  (client: MysqlQueryClient) =>
  async <TRow extends Record<string, unknown>>(
    sql: ParameterizedSql,
  ): Promise<{ rows: TRow[] }> => {
    const [rows] = await executeMysql<RowDataPacket[]>(client, sql.text, sql.values);
    return { rows: rows as TRow[] };
  };
