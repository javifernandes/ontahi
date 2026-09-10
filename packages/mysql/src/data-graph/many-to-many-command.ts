import {
  appliedRelationshipCommand,
  getEntityIdentityLocator,
  resolveManyToManyRelationConstraints,
  type ManyToManyRelationshipCommand,
  type RelationshipFact,
  type RelationshipCommandResult,
  type RelationshipEndpointSelection,
} from '@ontahi/core/data-graph';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { executeMysql } from './client.js';
import type { MysqlEntityMapping } from './mapping.js';
import {
  assertMysqlUniqueColumns,
  invalidMysqlCommand as invalid,
  requireMysqlOne,
} from './mutation-contract.js';
import type { MysqlRelationshipContext } from './relationship-context.js';
import { quoteMysqlIdentifier as quote } from './sql.js';

export const executeMysqlManyToManyCommand = async (
  context: MysqlRelationshipContext,
  command: ManyToManyRelationshipCommand,
): Promise<RelationshipCommandResult> => {
  const source = context.mappingFor(command.relation.sourceEntityName);
  const target = context.mappingFor(command.relation.targetEntityName);
  const relation = source.entity.relations[command.relation.relationName];
  const mapping = relation?.mapping;
  const sourceKeys = getEntityIdentityLocator(source.entity)?.locator.fields;
  const targetKeys = getEntityIdentityLocator(target.entity)?.locator.fields;
  if (
    relation?.relationKind !== 'manyToMany' ||
    relation.target !== target.entity ||
    mapping?.type !== 'many-to-many' ||
    sourceKeys?.length !== 1 ||
    targetKeys?.length !== 1
  )
    return invalid(
      'MySQL many-to-many requires a mapped Relation and single-field endpoint identities.',
    );
  const sourceField = sourceKeys[0]!;
  const targetField = targetKeys[0]!;
  if (
    mapping.fromTable !== source.table ||
    mapping.toTable !== target.table ||
    mapping.fromColumn !== source.columns[sourceField] ||
    mapping.toColumn !== target.columns[targetField]
  )
    return invalid('MySQL many-to-many mapping does not match the endpoint mappings.');
  const [tables] = await executeMysql<RowDataPacket[]>(
    context.client,
    'SELECT ENGINE AS engine FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [mapping.throughTable],
  );
  if (tables[0]?.engine !== 'InnoDB') return invalid('MySQL relationship edges require InnoDB.');
  await assertMysqlUniqueColumns(context.client, mapping.throughTable, [
    mapping.throughFromColumn,
    mapping.throughToColumn,
  ]);
  const endpoints = async (
    entityMapping: MysqlEntityMapping,
    endpoint: RelationshipEndpointSelection,
  ) => {
    if (endpoint.entityName !== entityMapping.entity.name)
      return invalid('MySQL relationship endpoint has the wrong Entity.');
    const selected = await context.rows(entityMapping, endpoint.selection);
    if (endpoint.selection.kind === 'references') {
      // Resolve each explicit Ref, including alternate locators. A missing Ref invalidates the
      // entire command instead of leaving a partial Cartesian product.
      for (const ref of endpoint.selection.refs)
        requireMysqlOne((await context.refRows(entityMapping, ref)).length);
    }
    return selected;
  };
  const sources = await endpoints(source, command.sources);
  const targets = await endpoints(target, command.targets);
  if (command.action === 'link')
    await context.constraints(
      resolveManyToManyRelationConstraints(relation, source.entity, target.entity),
      { source: sources, target: targets },
    );
  const changed: RelationshipFact[] = [];
  const table = quote(mapping.throughTable);
  const from = quote(mapping.throughFromColumn);
  const to = quote(mapping.throughToColumn);
  for (const sourceRow of sources)
    for (const targetRow of targets) {
      const values = [sourceRow[sourceField], targetRow[targetField]];
      const [existing] = await executeMysql<RowDataPacket[]>(
        context.client,
        `SELECT ${from} FROM ${table} WHERE ${from} = ? AND ${to} = ? FOR UPDATE`,
        values,
      );
      if ((command.action === 'link') === existing.length > 0) continue;
      await executeMysql<ResultSetHeader>(
        context.client,
        command.action === 'link'
          ? `INSERT INTO ${table} (${from}, ${to}) VALUES (?, ?)`
          : `DELETE FROM ${table} WHERE ${from} = ? AND ${to} = ?`,
        values,
      );
      changed.push({
        relation: command.relation,
        source: context.identity(source, sourceRow),
        target: context.identity(target, targetRow),
      });
    }
  return appliedRelationshipCommand({
    added: command.action === 'link' ? changed : [],
    removed: command.action === 'unlink' ? changed : [],
  });
};
