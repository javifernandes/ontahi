import type { DataGraphTransactionCapability } from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import { PostgresDataGraphError } from './runtime-error.js';

export type PostgresTransactionClient = {
  query: (statement: string) => Promise<unknown>;
  release: () => void;
};

type PostgresTransactionConnectionPool = {
  connect: () => Promise<PostgresTransactionClient>;
};

const transactionError = (message: string, cause: unknown) =>
  new PostgresDataGraphError(message, 'execution_failed', cause);

const executeTransactionStatement = (
  client: PostgresTransactionClient,
  statement: 'BEGIN' | 'COMMIT' | 'ROLLBACK',
) =>
  Effect.tryPromise({
    try: () => client.query(statement),
    catch: cause =>
      transactionError(`PostgreSQL transaction ${statement.toLowerCase()} failed.`, cause),
  }).pipe(Effect.asVoid);

export const createPostgresTransactionCapability = <TRuntime>(
  pool: PostgresTransactionConnectionPool,
  createRuntime: (client: PostgresTransactionClient) => TRuntime,
): DataGraphTransactionCapability<TRuntime, PostgresDataGraphError> => ({
  transaction: work =>
    Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => pool.connect(),
        catch: cause => transactionError('PostgreSQL transaction connection failed.', cause),
      }),
      client =>
        executeTransactionStatement(client, 'BEGIN').pipe(
          Effect.zipRight(
            work(createRuntime(client)).pipe(
              Effect.matchCauseEffect({
                onFailure: cause =>
                  executeTransactionStatement(client, 'ROLLBACK').pipe(
                    Effect.orDie,
                    Effect.zipRight(Effect.failCause(cause)),
                  ),
                onSuccess: result =>
                  executeTransactionStatement(client, 'COMMIT').pipe(Effect.as(result)),
              }),
            ),
          ),
        ),
      client => Effect.sync(() => client.release()),
    ),
});
