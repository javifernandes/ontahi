import {
  appliedRelationshipCommand,
  liftEntityReferenceRecord,
  notAppliedRelationshipCommand,
  type GraphCommandSpec,
  type ManyToManyRelationshipCommand,
  type RelationConstraintRejection,
  type RelationshipCommand,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  compilePostgresManyToManyCommand,
  materializePostgresManyToManyDelta,
} from './many-to-many.js';
import type { PostgresEntityMapping } from './mapping.js';
import {
  compilePostgresRelationshipCommand,
  materializePostgresRelationshipDelta,
  type PostgresRelationshipCommandRow,
} from './relationship-command.js';
import { PostgresDataGraphError } from './runtime-error.js';
import { compilePostgresCommand } from './sql.js';

type ExecuteQuery = <TRow extends QueryResultRow>(sql: {
  text: string;
  values: unknown[];
}) => Promise<QueryResult<TRow>>;

const invalidCommandCause = (cause: unknown) =>
  cause instanceof Error &&
  (cause.message.startsWith('PostgreSQL upsert') || cause.message.startsWith('PostgreSQL insert'));

const materializeCommandResult = <TResult>(
  command: GraphCommandSpec<any, any, TResult>,
  rows: QueryResultRow[],
): TResult => {
  if (!command.returning) return undefined as TResult;
  if (command.cardinality === 'one') {
    const row = rows[0];
    return (row ? liftEntityReferenceRecord(command.root, row) : row) as TResult;
  }
  return rows.map(row => liftEntityReferenceRecord(command.root, row)) as TResult;
};

export const executePostgresCommand = <TResult>(input: {
  command: GraphCommandSpec<any, any, TResult>;
  executeQuery: ExecuteQuery;
  mapping: PostgresEntityMapping;
}) =>
  Effect.tryPromise({
    try: () =>
      input.executeQuery<QueryResultRow>(compilePostgresCommand(input.command, input.mapping)),
    catch: cause =>
      new PostgresDataGraphError(
        'PostgreSQL data graph command failed.',
        invalidCommandCause(cause) ? 'invalid_command' : 'execution_failed',
        cause,
      ),
  }).pipe(
    Effect.flatMap(result => {
      if (input.command.cardinality === 'one' && result.rowCount !== 1) {
        return Effect.fail(
          new PostgresDataGraphError(
            `Expected exactly one affected row, got ${result.rowCount ?? 0}.`,
            'cardinality_mismatch',
          ),
        );
      }
      return Effect.succeed(materializeCommandResult(input.command, result.rows));
    }),
  );

export const executePostgresManyToManyCommand = (input: {
  command: ManyToManyRelationshipCommand;
  executeQuery: ExecuteQuery;
  mappings: readonly PostgresEntityMapping[];
}) =>
  Effect.tryPromise({
    try: async () => {
      const source = input.mappings.find(
        mapping => mapping.entity.name === input.command.relation.sourceEntityName,
      );
      const target = input.mappings.find(
        mapping => mapping.entity.name === input.command.relation.targetEntityName,
      );
      if (!source || !target) {
        throw new Error('PostgreSQL many-to-many Command references an unmapped Entity.');
      }
      const compiled = compilePostgresManyToManyCommand(input.command, source, target);
      const result = await input.executeQuery<
        {
          row_kind: 'meta' | 'fact';
          source_value: unknown;
          target_value: unknown;
          source_count: number | null;
          target_count: number | null;
          constraint_rejection: RelationConstraintRejection | null;
        } & QueryResultRow
      >(compiled.sql);
      const materialized = materializePostgresManyToManyDelta(input.command, compiled, result.rows);
      if (materialized.cardinalityMismatch || !materialized.delta) {
        if (materialized.constraintRejected) {
          throw new PostgresDataGraphError(
            materialized.constraintRejected.message,
            'relation_constraint_rejected',
            undefined,
            materialized.constraintRejected,
          );
        }
        throw new PostgresDataGraphError(
          'PostgreSQL many-to-many endpoint Ref did not resolve exactly once.',
          'cardinality_mismatch',
        );
      }
      return appliedRelationshipCommand(materialized.delta);
    },
    catch: cause => {
      if (cause instanceof PostgresDataGraphError) return cause;
      const reason =
        cause instanceof Error && cause.message.startsWith('PostgreSQL many-to-many')
          ? 'invalid_command'
          : 'execution_failed';
      return new PostgresDataGraphError('PostgreSQL many-to-many Command failed.', reason, cause);
    },
  });

export const executePostgresRelationshipCommand = (input: {
  command: RelationshipCommand;
  executeQuery: ExecuteQuery;
  mappings: readonly PostgresEntityMapping[];
  authoritySerialized?: boolean;
}) =>
  Effect.tryPromise({
    try: async () => {
      const source = input.mappings.find(
        mapping => mapping.entity.name === input.command.relation.sourceEntityName,
      );
      const target = input.mappings.find(
        mapping => mapping.entity.name === input.command.relation.targetEntityName,
      );
      if (!source || !target) {
        throw new Error('PostgreSQL Relationship Command references an unmapped Entity.');
      }
      const compiled = compilePostgresRelationshipCommand(input.command, source, target);
      if (compiled.serializationLock && !input.authoritySerialized) {
        throw new PostgresDataGraphError(
          'PostgreSQL Relationship Command requires an authority-serialized transaction.',
          'execution_failed',
        );
      }
      if (compiled.serializationLock) {
        await input.executeQuery<QueryResultRow>(compiled.serializationLock);
      }
      const result = await input.executeQuery<PostgresRelationshipCommandRow & QueryResultRow>(
        compiled.sql,
      );
      const row = result.rows[0];
      if (!row) throw new Error('PostgreSQL Relationship Command returned no state row.');
      const materialized = materializePostgresRelationshipDelta(input.command, compiled, row);
      if ('cardinalityMismatch' in materialized) {
        throw new PostgresDataGraphError(
          'PostgreSQL Relationship Command endpoint Ref did not resolve exactly once.',
          'cardinality_mismatch',
        );
      }
      if ('preconditionFailed' in materialized) {
        if (input.command.precondition?.onMismatch === 'skip') {
          return notAppliedRelationshipCommand(input.command);
        }
        throw new PostgresDataGraphError(
          'PostgreSQL Relationship Command current target did not match its precondition.',
          'relationship_precondition_failed',
        );
      }
      if ('constraintRejected' in materialized) {
        throw new PostgresDataGraphError(
          materialized.constraintRejected.message,
          'relation_constraint_rejected',
          undefined,
          materialized.constraintRejected,
        );
      }
      return appliedRelationshipCommand(materialized.delta);
    },
    catch: cause =>
      cause instanceof PostgresDataGraphError
        ? cause
        : new PostgresDataGraphError(
            'PostgreSQL Relationship Command failed.',
            cause instanceof Error && cause.message.startsWith('PostgreSQL Relationship Command')
              ? 'invalid_command'
              : 'execution_failed',
            cause,
          ),
  });
