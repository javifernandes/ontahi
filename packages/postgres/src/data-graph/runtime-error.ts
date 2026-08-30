import type { RelationConstraintRejection } from '@ontahi/core/data-graph';

export type PostgresDataGraphErrorReason =
  | 'execution_failed'
  | 'invalid_command'
  | 'cardinality_mismatch'
  | 'entity_mutation_condition_not_met'
  | 'relation_constraint_rejected'
  | 'relationship_precondition_failed';

export class PostgresDataGraphError extends Error {
  readonly _tag = 'PostgresDataGraphError';

  constructor(
    message: string,
    readonly reason: PostgresDataGraphErrorReason = 'execution_failed',
    readonly cause?: unknown,
    readonly rejection?: RelationConstraintRejection,
  ) {
    super(message);
  }
}
