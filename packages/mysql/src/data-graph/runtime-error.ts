import type { RelationConstraintRejection } from '@ontahi/core/data-graph';
export type MysqlDataGraphErrorReason =
  | 'execution_failed'
  | 'invalid_command'
  | 'unsupported_command'
  | 'relation_constraint_rejected'
  | 'relationship_precondition_failed'
  | 'ordered_relationship_rejected'
  | 'cardinality_mismatch'
  | 'entity_mutation_condition_not_met';
export class MysqlDataGraphError extends Error {
  readonly _tag = 'MysqlDataGraphError';
  constructor(
    message: string,
    readonly reason: MysqlDataGraphErrorReason = 'execution_failed',
    readonly cause?: unknown,
    readonly rejection?: RelationConstraintRejection,
  ) {
    super(message);
  }
}
export const mysqlError = (cause: unknown) =>
  cause instanceof MysqlDataGraphError
    ? cause
    : new MysqlDataGraphError('MySQL data graph execution failed.', 'execution_failed', cause);
