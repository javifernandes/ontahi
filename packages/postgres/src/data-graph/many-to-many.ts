import {
  createEntityIdentityRef,
  getEntityIdentityLocator,
  type AnyEntityDefinition,
  type ManyToManyRelationMapping,
  type ManyToManyRelationshipCommand,
  type RelationshipDelta,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import { compilePostgresSelection, quotePostgresIdentifier, type ParameterizedSql } from './sql.js';

export type CompiledPostgresManyToManyCommand = {
  sql: ParameterizedSql;
  sourceEntity: AnyEntityDefinition;
  sourceIdentityField: string;
  targetEntity: AnyEntityDefinition;
  targetIdentityField: string;
  expectedSourceCount?: number;
  expectedTargetCount?: number;
};

const explicitReferenceCount = (selection: ManyToManyRelationshipCommand['sources']['selection']) =>
  selection.kind === 'references'
    ? new Set(selection.refs.map(ref => JSON.stringify(ref.locator))).size
    : undefined;

const identityField = (entity: AnyEntityDefinition) => {
  const fields = getEntityIdentityLocator(entity)?.locator.fields;
  if (fields?.length !== 1) {
    throw new Error(
      `PostgreSQL many-to-many Relation requires one identity field on ${entity.name}.`,
    );
  }
  return fields[0]!;
};

const resolveRelationMapping = (
  command: ManyToManyRelationshipCommand,
  source: PostgresEntityMapping,
  target: PostgresEntityMapping,
) => {
  const relation = source.entity.relations[command.relation.relationName];
  if (
    !relation ||
    relation.relationKind !== 'manyToMany' ||
    relation.target !== target.entity ||
    relation.mapping?.type !== 'many-to-many'
  ) {
    throw new Error(
      `PostgreSQL many-to-many Relation ${source.entity.name}.${command.relation.relationName} is not mapped.`,
    );
  }
  return relation.mapping;
};

const assertMapping = (
  mapping: ManyToManyRelationMapping,
  source: PostgresEntityMapping,
  sourceField: string,
  target: PostgresEntityMapping,
  targetField: string,
) => {
  if (
    mapping.fromTable !== source.table ||
    mapping.fromColumn !== source.columns[sourceField] ||
    mapping.toTable !== target.table ||
    mapping.toColumn !== target.columns[targetField]
  ) {
    throw new Error('PostgreSQL many-to-many Relation mapping does not match Entity mappings.');
  }
};

const validCounts = (expectedSource?: number, expectedTarget?: number) =>
  [
    expectedSource === undefined ? 'TRUE' : `source_count = ${expectedSource}`,
    expectedTarget === undefined ? 'TRUE' : `target_count = ${expectedTarget}`,
  ].join(' AND ');

export const compilePostgresManyToManyCommand = (
  command: ManyToManyRelationshipCommand,
  source: PostgresEntityMapping,
  target: PostgresEntityMapping,
): CompiledPostgresManyToManyCommand => {
  if (
    command.relation.sourceEntityName !== source.entity.name ||
    command.relation.targetEntityName !== target.entity.name
  ) {
    throw new Error('PostgreSQL many-to-many Command does not match Entity mappings.');
  }
  const sourceIdentityField = identityField(source.entity);
  const targetIdentityField = identityField(target.entity);
  const relationMapping = resolveRelationMapping(command, source, target);
  assertMapping(relationMapping, source, sourceIdentityField, target, targetIdentityField);

  const values: unknown[] = [];
  const sourceSelection = compilePostgresSelection(command.sources.selection, source, values);
  const targetSelection = compilePostgresSelection(command.targets.selection, target, values);
  const expectedSourceCount = explicitReferenceCount(command.sources.selection);
  const expectedTargetCount = explicitReferenceCount(command.targets.selection);
  const sourceTable = quotePostgresIdentifier(source.table);
  const sourceColumn = quotePostgresIdentifier(source.columns[sourceIdentityField]!);
  const targetTable = quotePostgresIdentifier(target.table);
  const targetColumn = quotePostgresIdentifier(target.columns[targetIdentityField]!);
  const throughTable = quotePostgresIdentifier(relationMapping.throughTable);
  const throughFrom = quotePostgresIdentifier(relationMapping.throughFromColumn);
  const throughTo = quotePostgresIdentifier(relationMapping.throughToColumn);
  const countCondition = validCounts(expectedSourceCount, expectedTargetCount);
  const mutation =
    command.action === 'link'
      ? `INSERT INTO ${throughTable} (${throughFrom}, ${throughTo}) ` +
        `SELECT source_value, target_value FROM selected_sources CROSS JOIN selected_targets, counts ` +
        `WHERE ${countCondition} ON CONFLICT DO NOTHING ` +
        `RETURNING ${throughFrom} AS source_value, ${throughTo} AS target_value`
      : `DELETE FROM ${throughTable} edge USING selected_sources, selected_targets, counts ` +
        `WHERE edge.${throughFrom} = source_value AND edge.${throughTo} = target_value ` +
        `AND ${countCondition} ` +
        `RETURNING edge.${throughFrom} AS source_value, edge.${throughTo} AS target_value`;

  return {
    sql: {
      text:
        `WITH selected_sources AS (` +
        `SELECT DISTINCT ${sourceColumn} AS source_value FROM ${sourceTable} WHERE ${sourceSelection}` +
        `), selected_targets AS (` +
        `SELECT DISTINCT ${targetColumn} AS target_value FROM ${targetTable} WHERE ${targetSelection}` +
        `), counts AS (` +
        `SELECT (SELECT COUNT(*)::int FROM selected_sources) AS source_count, ` +
        `(SELECT COUNT(*)::int FROM selected_targets) AS target_count` +
        `), mutation AS (${mutation}) ` +
        `SELECT 'meta' AS row_kind, NULL AS source_value, NULL AS target_value, ` +
        `source_count, target_count FROM counts UNION ALL ` +
        `SELECT 'fact' AS row_kind, source_value, target_value, ` +
        `NULL AS source_count, NULL AS target_count FROM mutation`,
      values,
    },
    sourceEntity: source.entity,
    sourceIdentityField,
    targetEntity: target.entity,
    targetIdentityField,
    ...(expectedSourceCount === undefined ? {} : { expectedSourceCount }),
    ...(expectedTargetCount === undefined ? {} : { expectedTargetCount }),
  };
};

export const materializePostgresManyToManyDelta = (
  command: ManyToManyRelationshipCommand,
  compiled: CompiledPostgresManyToManyCommand,
  rows: Array<{
    row_kind: 'meta' | 'fact';
    source_value: unknown;
    target_value: unknown;
    source_count: number | null;
    target_count: number | null;
  }>,
): { delta?: RelationshipDelta; cardinalityMismatch?: true } => {
  const meta = rows.find(row => row.row_kind === 'meta');
  if (
    !meta ||
    (compiled.expectedSourceCount !== undefined &&
      meta.source_count !== compiled.expectedSourceCount) ||
    (compiled.expectedTargetCount !== undefined &&
      meta.target_count !== compiled.expectedTargetCount)
  ) {
    return { cardinalityMismatch: true };
  }
  const facts = rows
    .filter(row => row.row_kind === 'fact')
    .map(row => {
      const source = createEntityIdentityRef(compiled.sourceEntity, {
        [compiled.sourceIdentityField]: row.source_value,
      });
      const target = createEntityIdentityRef(compiled.targetEntity, {
        [compiled.targetIdentityField]: row.target_value,
      });
      if (!source || !target) {
        throw new Error('PostgreSQL many-to-many result could not produce endpoint Refs.');
      }
      return { relation: command.relation, source, target };
    });
  return {
    delta:
      command.action === 'link' ? { added: facts, removed: [] } : { added: [], removed: facts },
  };
};
