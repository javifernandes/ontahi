import {
  lowerEntityReferenceRecord,
  liftEntityReferenceRecord,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { normalizeMysqlRecord, executeMysql } from './client.js';
import type { MysqlEntityMapping } from './mapping.js';
import {
  invalidMysqlCommand as invalid,
  requireMysqlOne as requireOne,
  mappedMysqlFields as mappedFields,
  mysqlTableContract as tableContract,
  assertMysqlUniqueColumns,
} from './mutation-contract.js';
import { compileMysqlSelection, quoteMysqlIdentifier as quote } from './sql.js';

type CommandInput<TResult = unknown> = {
  client: PoolConnection;
  mapping: MysqlEntityMapping;
  command: GraphCommandSpec<any, any, TResult>;
};
type Row = Record<string, unknown>;

const commandContext = async ({ client, mapping, command }: CommandInput<any>) => {
  if (command.root !== mapping.entity) invalid('MySQL command root does not match its mapping.');
  mappedFields(mapping, command.returning ?? []);
  const primaryFields = await tableContract(client, mapping);
  const columns = Object.entries(mapping.columns)
    .map(([field, column]) => `${quote(column)} AS ${quote(field)}`)
    .join(', ');
  const table = quote(mapping.table);
  const parameters = (fields: readonly string[], separator: string) =>
    mappedFields(mapping, fields)
      .map(column => `${quote(column)} = ?`)
      .join(separator);
  const readMatching = async (fields: readonly string[], row: Row) => {
    const where = parameters(fields, ' AND ');
    const [rows] = await executeMysql<RowDataPacket[]>(
      client,
      `SELECT ${columns} FROM ${table} WHERE ${where} FOR UPDATE`,
      fields.map(field => row[field]),
    );
    return rows;
  };
  const readByKey = async (row: Row) => {
    const rows = await readMatching(primaryFields, row);
    requireOne(rows.length);
    return rows[0]!;
  };
  const update = async (before: Row, payload: Row) => {
    const fields = Object.keys(payload);
    const assignments = parameters(fields, ', ');
    const where = parameters(primaryFields, ' AND ');
    await executeMysql<ResultSetHeader>(
      client,
      `UPDATE ${table} SET ${assignments} WHERE ${where}`,
      [...fields.map(field => payload[field]), ...primaryFields.map(field => before[field])],
    );
    return readByKey({ ...before, ...payload });
  };
  return {
    client,
    mapping,
    command,
    columns,
    table,
    primaryFields,
    parameters,
    readMatching,
    readByKey,
    update,
  };
};
type CommandContext = Awaited<ReturnType<typeof commandContext>>;

const validateInsert = async (context: CommandContext, payloads: (Row | undefined)[]) => {
  const { client, mapping, command } = context;
  if (!payloads.length) invalid('MySQL insert requires at least one row.');
  if (command.cardinality === 'one' && command.operation !== 'upsert') requireOne(payloads.length);
  if (command.operation !== 'upsert') return;
  if (command.upsert?.strategy !== 'merge' && command.upsert?.strategy !== 'ignore')
    invalid('Invalid MySQL upsert strategy.');
  const fields = command.upsert!.conflictOn;
  await assertMysqlUniqueColumns(client, mapping.table, mappedFields(mapping, fields));
  if (payloads.some(payload => fields.some(field => payload?.[field] === undefined)))
    invalid('MySQL upsert payload is missing a conflict field.');
};

const insertRow = async (context: CommandContext, row: Row) => {
  const fields = Object.keys(row);
  const columns = mappedFields(context.mapping, fields)
    .map(column => quote(column))
    .join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  const [result] = await executeMysql<ResultSetHeader>(
    context.client,
    `INSERT INTO ${context.table} (${columns}) VALUES (${placeholders})`,
    fields.map(field => row[field]),
  );
  const key = { ...row };
  const missing = context.primaryFields.filter(field => key[field] == null);
  if (missing.length === 1 && result.insertId) key[missing[0]!] = result.insertId;
  if (context.primaryFields.some(field => key[field] == null))
    invalid('Cannot recover inserted MySQL primary key. Provide its values explicitly.');
  return context.readByKey(key);
};

const upsertRow = async (context: CommandContext, row: Row) => {
  const conflictFields = context.command.upsert!.conflictOn;
  const readConflict = async () => {
    const matches = await context.readMatching(conflictFields, row);
    if (matches.length > 1) invalid('MySQL upsert conflict did not identify a unique row.');
    return matches[0];
  };
  let conflict = await readConflict();
  if (!conflict) {
    try {
      return await insertRow(context, row);
    } catch (cause) {
      if ((cause as { code?: string }).code !== 'ER_DUP_ENTRY') throw cause;
      // After the unique-key wait, READ COMMITTED sees the winning insert. A different unique-key
      // collision must propagate; it cannot silently choose an unrelated upsert target.
      conflict = await readConflict();
      if (!conflict) throw cause;
    }
  }
  if (context.command.upsert!.strategy === 'ignore') return undefined;
  return context.update(conflict, row);
};

const insertRows = async (context: CommandContext) => {
  const { command } = context;
  const payloads = Array.isArray(command.payload) ? command.payload : [command.payload];
  await validateInsert(context, payloads);
  const rows: Row[] = [];
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object')
      invalid('MySQL insert requires an object payload.');
    const row = lowerEntityReferenceRecord(command.root, payload as Row);
    mappedFields(context.mapping, Object.keys(row));
    const result =
      command.operation === 'upsert'
        ? await upsertRow(context, row)
        : await insertRow(context, row);
    if (result) rows.push(result);
  }
  return rows;
};

// Lock membership once, then address its primary keys even when the mutation changes its predicate.
const mutateSelectedRows = async (context: CommandContext) => {
  const { command, mapping, client, table, columns } = context;
  const values: unknown[] = [];
  const predicate = compileMysqlSelection(command.selection, mapping, values);
  const [before] = await executeMysql<RowDataPacket[]>(
    client,
    `SELECT ${columns} FROM ${table} WHERE ${predicate} FOR UPDATE`,
    values,
  );
  if (command.cardinality === 'one') requireOne(before.length);
  const payload =
    command.operation === 'update'
      ? lowerEntityReferenceRecord(command.root, command.payload as Row)
      : {};
  const fields = Object.keys(payload);
  mappedFields(mapping, fields);
  if (command.operation === 'update' && !fields.length)
    invalid('MySQL update requires at least one field.');
  const results: Row[] = [];
  for (const row of before) {
    if (command.operation === 'delete') {
      const where = context.parameters(context.primaryFields, ' AND ');
      await executeMysql<ResultSetHeader>(
        client,
        `DELETE FROM ${table} WHERE ${where}`,
        context.primaryFields.map(field => row[field]),
      );
      results.push(row);
    } else results.push(await context.update(row, payload));
  }
  return results;
};

export const executeMysqlCommand = async <TResult>(
  input: CommandInput<TResult>,
): Promise<TResult> => {
  const context = await commandContext(input);
  const { command } = input;
  const insert = ['insert', 'insert_many', 'upsert'].includes(command.operation);
  const rows = insert ? await insertRows(context) : await mutateSelectedRows(context);
  if (command.cardinality === 'one') requireOne(rows.length);
  if (!command.returning) return undefined as TResult;
  const fields = command.returning;
  const returned = rows.map(row =>
    liftEntityReferenceRecord(
      command.root,
      normalizeMysqlRecord(
        command.root,
        Object.fromEntries(fields.map(field => [field, row[field]])),
      ),
    ),
  );
  return (command.cardinality === 'one' ? returned[0] : returned) as TResult;
};
