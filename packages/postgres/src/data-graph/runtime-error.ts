export type PostgresDataGraphErrorReason =
  | 'execution_failed'
  | 'invalid_command'
  | 'cardinality_mismatch';

export class PostgresDataGraphError extends Error {
  readonly _tag = 'PostgresDataGraphError';

  constructor(
    message: string,
    readonly reason: PostgresDataGraphErrorReason = 'execution_failed',
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
