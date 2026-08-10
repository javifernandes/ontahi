import { getEntityMapping, type AnyEntityDefinition } from '@ontahi/core/data-graph';
import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

export type PostgresDataGraphSchemaIssue =
  | {
      kind: 'table-not-found';
      entity: string;
      schema: string;
      table: string;
    }
  | {
      kind: 'column-not-found';
      column: string;
      entity: string;
      field: string;
      schema: string;
      table: string;
    };

export type PostgresDataGraphSchemaInspection = {
  issues: PostgresDataGraphSchemaIssue[];
  ok: boolean;
};

export type InspectPostgresDataGraphSchemaOptions = {
  entities: readonly AnyEntityDefinition[];
  pool: Pick<Pool, 'query'>;
  schema?: string;
};

type PhysicalColumn = QueryResultRow & {
  column_name: string;
  table_name: string;
};

export const inspectPostgresDataGraphSchema = async ({
  entities,
  pool,
  schema = 'public',
}: InspectPostgresDataGraphSchemaOptions): Promise<PostgresDataGraphSchemaInspection> => {
  const physicalColumns = await pool.query<PhysicalColumn>(
    'SELECT table_name, column_name FROM information_schema.columns' +
      ' WHERE table_schema = $1 ORDER BY table_name, ordinal_position',
    [schema],
  );
  const columnsByTable = new Map<string, Set<string>>();

  physicalColumns.rows.forEach(({ column_name, table_name }) => {
    const columns = columnsByTable.get(table_name) ?? new Set<string>();
    columns.add(column_name);
    columnsByTable.set(table_name, columns);
  });

  const issues = entities.flatMap<PostgresDataGraphSchemaIssue>(entity => {
    const mapping = getEntityMapping(entity);
    const columns = columnsByTable.get(mapping.tableName);

    if (!columns) {
      return [
        {
          kind: 'table-not-found',
          entity: entity.name,
          schema,
          table: mapping.tableName,
        },
      ];
    }

    return Object.entries(mapping.columns).flatMap<PostgresDataGraphSchemaIssue>(
      ([field, column]) =>
        columns.has(column)
          ? []
          : [
              {
                kind: 'column-not-found',
                column,
                entity: entity.name,
                field,
                schema,
                table: mapping.tableName,
              },
            ],
    );
  });

  return { issues, ok: issues.length === 0 };
};

export type InspectPostgresDataGraphSchemaAtConnectionOptions = Omit<
  InspectPostgresDataGraphSchemaOptions,
  'pool'
> & {
  connection: PoolConfig;
};

export const inspectPostgresDataGraphSchemaAtConnection = async ({
  connection,
  ...options
}: InspectPostgresDataGraphSchemaAtConnectionOptions) => {
  const pool = new Pool(connection);

  try {
    return await inspectPostgresDataGraphSchema({ ...options, pool });
  } finally {
    await pool.end();
  }
};
