import type { DataGraphTransactionCapability } from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import type { Pool, PoolConnection } from 'mysql2/promise';

import { MysqlDataGraphError, mysqlError } from './runtime-error.js';

const statement = (client: PoolConnection, sql: string) =>
  Effect.tryPromise({
    try: () => client.query(sql),
    catch: mysqlError,
  }).pipe(Effect.asVoid, Effect.uninterruptible);

export const createMysqlTransactionCapability = <TRuntime>(
  pool: Pick<Pool, 'getConnection'>,
  createRuntime: (client: PoolConnection) => TRuntime,
): DataGraphTransactionCapability<TRuntime, MysqlDataGraphError> => ({
  transaction: work =>
    Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => pool.getConnection(), catch: mysqlError }),
      client => {
        const rollback = statement(client, 'ROLLBACK').pipe(
          Effect.catchAll(error =>
            Effect.sync(() => client.destroy()).pipe(Effect.zipRight(Effect.fail(error))),
          ),
        );
        return statement(client, 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED').pipe(
          Effect.zipRight(statement(client, 'START TRANSACTION')),
          Effect.zipRight(Effect.suspend(() => work(createRuntime(client)))),
          Effect.flatMap(value => statement(client, 'COMMIT').pipe(Effect.as(value))),
          Effect.onError(() => rollback.pipe(Effect.orDie)),
        );
      },
      client => Effect.sync(() => client.release()),
    ),
});
