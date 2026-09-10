import {
  createEntityIdentityRef,
  selectionAnd,
  selectionReferences,
  type AnyEntityRef,
  type SelectionExpression,
  type ResolvedRelationConstraint,
} from '@ontahi/core/data-graph';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { executeMysql, normalizeMysqlRecord } from './client.js';
import type { MysqlEntityMapping } from './mapping.js';
import {
  invalidMysqlCommand as invalid,
  mysqlTableContract,
  requireMysqlOne,
} from './mutation-contract.js';
import { MysqlDataGraphError } from './runtime-error.js';
import { compileMysqlSelection, quoteMysqlIdentifier as quote } from './sql.js';

export type MysqlRelationshipContext = ReturnType<typeof createMysqlRelationshipContext>;
export const createMysqlRelationshipContext = (
  client: PoolConnection,
  mappings: readonly MysqlEntityMapping[],
) => {
  const mappingFor = (name: string) => {
    const mapping = mappings.find(candidate => candidate.entity.name === name);
    if (!mapping) return invalid(`Unmapped MySQL Entity ${name}.`);
    return mapping;
  };
  const assertRef = (mapping: MysqlEntityMapping, ref: AnyEntityRef) => {
    if (ref.entityName !== mapping.entity.name || Object.keys(ref.locator).length === 0)
      invalid('MySQL Relationship Ref has the wrong Entity or an empty locator.');
  };
  const rows = async (
    mapping: MysqlEntityMapping,
    selection: SelectionExpression,
    orderColumn?: string,
  ) => {
    const keys = await mysqlTableContract(client, mapping);
    const values: unknown[] = [];
    const predicate = compileMysqlSelection(selection, mapping, values);
    const columns = Object.entries(mapping.columns)
      .map(([field, column]) => `${quote(column)} AS ${quote(field)}`)
      .join(', ');
    const order = [
      ...(orderColumn ? [orderColumn] : []),
      ...keys.map(key => mapping.columns[key]!),
    ];
    const [result] = await executeMysql<RowDataPacket[]>(
      client,
      `SELECT ${columns} FROM ${quote(mapping.table)} WHERE ${predicate} ORDER BY ${order.map(column => quote(column)).join(', ')} FOR UPDATE`,
      values,
    );
    return result.map(row => normalizeMysqlRecord(mapping.entity, row));
  };
  const refRows = (mapping: MysqlEntityMapping, ref: AnyEntityRef) => {
    assertRef(mapping, ref);
    return rows(mapping, selectionReferences([ref]));
  };
  const one = async (mapping: MysqlEntityMapping, ref: AnyEntityRef) => {
    const matches = await refRows(mapping, ref);
    requireMysqlOne(matches.length);
    return matches[0]!;
  };
  const identity = (mapping: MysqlEntityMapping, row: Record<string, unknown>) => {
    const ref = createEntityIdentityRef(mapping.entity, row);
    if (!ref) return invalid(`Cannot materialize MySQL identity for ${mapping.entity.name}.`);
    return ref;
  };
  const update = async (
    mapping: MysqlEntityMapping,
    row: Record<string, unknown>,
    column: string,
    value: unknown,
  ) => {
    const keys = await mysqlTableContract(client, mapping);
    const where = keys.map(key => `${quote(mapping.columns[key]!)} = ?`).join(' AND ');
    await executeMysql<ResultSetHeader>(
      client,
      `UPDATE ${quote(mapping.table)} SET ${quote(column)} = ? WHERE ${where}`,
      [value, ...keys.map(key => row[key])],
    );
  };
  const constraints = async (
    rules: readonly ResolvedRelationConstraint[],
    participants: {
      source: Record<string, unknown>[];
      target: Record<string, unknown>[];
    },
  ) => {
    for (const rule of rules) {
      const mapping = mappingFor(rule.entity.name);
      for (const row of participants[rule.participant]) {
        const eligible = await rows(
          mapping,
          selectionAnd(selectionReferences([identity(mapping, row)]), rule.selection),
        );
        if (eligible.length !== 1)
          throw new MysqlDataGraphError(
            rule.rejection.message,
            'relation_constraint_rejected',
            undefined,
            rule.rejection,
          );
      }
    }
  };
  return { client, mappingFor, assertRef, rows, refRows, one, identity, update, constraints };
};
