import {
  hasEntityMutationCondition,
  materializeEntityMutationDelta,
  toEntityMutationGraphCommand,
  type DataGraphExecutionRuntime,
  type DataGraphTransactionCapability,
  type EntityMutationCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type OrderedRelationshipCommandExecutionRuntime,
} from '@ontahi/core/data-graph';
import { createSqlReadRuntime, createSqlMappingRegistry } from '@ontahi/sql';
import { Effect, Stream } from 'effect';
import type { Pool, PoolConnection } from 'mysql2/promise';

import { createMysqlQueryExecutor, normalizeMysqlRecord } from './client.js';
import { executeMysqlCommand } from './command-runtime.js';
import { executeMysqlManyToManyCommand } from './many-to-many-command.js';
import type { MysqlEntityMapping } from './mapping.js';
import { executeMysqlOrderedRelationshipCommand } from './ordered-relationship-command.js';
import { executeMysqlRelationshipCommand } from './relationship-command.js';
import { createMysqlRelationshipContext } from './relationship-context.js';
import { MysqlDataGraphError, mysqlError } from './runtime-error.js';
import { mysqlDialect } from './sql.js';
import { createMysqlTransactionCapability } from './transaction.js';

export type MysqlDataGraphRuntime = DataGraphExecutionRuntime<MysqlDataGraphError> &
  EntityMutationCommandExecutionRuntime<MysqlDataGraphError> &
  RelationshipCommandExecutionRuntime<MysqlDataGraphError> &
  ManyToManyRelationshipCommandExecutionRuntime<MysqlDataGraphError> &
  OrderedRelationshipCommandExecutionRuntime<MysqlDataGraphError>;
export type MysqlTransactionDataGraphRuntime = MysqlDataGraphRuntime &
  DataGraphTransactionCapability<MysqlDataGraphRuntime, MysqlDataGraphError>;
export type MysqlDataGraphRuntimeOptions = {
  pool: Pick<Pool, 'execute' | 'getConnection'>;
  mappings: readonly MysqlEntityMapping[];
};

const createRuntime = (
  client: Pick<Pool, 'execute'>,
  mappings: readonly MysqlEntityMapping[],
  commands: Pick<
    MysqlDataGraphRuntime,
    | 'runCommand'
    | 'runRelationshipCommand'
    | 'runManyToManyRelationshipCommand'
    | 'runOrderedRelationshipCommand'
  >,
  semaphore?: ReturnType<typeof Effect.unsafeMakeSemaphore>,
): MysqlDataGraphRuntime => {
  const protect = <A, E>(work: Effect.Effect<A, E>) =>
    semaphore
      ? semaphore.withPermits(1)(Effect.uninterruptible(work))
      : Effect.uninterruptible(work);
  const reads = createSqlReadRuntime({
    mappings,
    dialect: mysqlDialect,
    executeQuery: createMysqlQueryExecutor(client),
    Error: MysqlDataGraphError,
    normalizeRow: normalizeMysqlRecord,
  });
  return {
    get: (read, params) => protect(reads.get(read, params)),
    run: (read, params) => protect(reads.run(read, params)),
    count: (read, params) => protect(reads.count(read, params)),
    stream: (read, params) =>
      Stream.fromEffect(protect(reads.run(read, params))).pipe(Stream.flatMap(Stream.fromIterable)),
    ...commands,
    runEntityMutationCommand: command =>
      Effect.try({
        try: () => {
          const mapping = mappings.find(candidate => candidate.entity.name === command.entityName);
          if (!mapping)
            throw new MysqlDataGraphError(
              `Unmapped MySQL Entity ${command.entityName}.`,
              'invalid_command',
            );
          return { mapping, graphCommand: toEntityMutationGraphCommand(mapping.entity, command) };
        },
        catch: mysqlError,
      }).pipe(
        Effect.flatMap(({ mapping, graphCommand }) =>
          commands.runCommand(graphCommand).pipe(
            Effect.map(values => materializeEntityMutationDelta(mapping.entity, command, values)),
            Effect.mapError(error =>
              hasEntityMutationCondition(command) &&
              error.reason === 'cardinality_mismatch' &&
              (error.cause as { actualAffectedRows?: number } | undefined)?.actualAffectedRows === 0
                ? new MysqlDataGraphError(
                    'Entity mutation condition was not satisfied.',
                    'entity_mutation_condition_not_met',
                    error,
                  )
                : error,
            ),
          ),
        ),
      ),
  };
};

const createTransactionRuntime = (
  client: PoolConnection,
  mappings: readonly MysqlEntityMapping[],
): MysqlDataGraphRuntime => {
  const registry = createSqlMappingRegistry(mappings);
  const semaphore = Effect.unsafeMakeSemaphore(1);
  const runMutation = <TResult>(work: () => Promise<TResult>) =>
    Effect.tryPromise({
      try: async () => {
        await client.query('SAVEPOINT ontahi_command');
        try {
          const result = await work();
          await client.query('RELEASE SAVEPOINT ontahi_command');
          return result;
        } catch (cause) {
          try {
            await client.query('ROLLBACK TO SAVEPOINT ontahi_command');
            await client.query('RELEASE SAVEPOINT ontahi_command');
          } catch (error_) {
            client.destroy();
            throw new MysqlDataGraphError(
              'MySQL command rollback failed; connection destroyed.',
              'execution_failed',
              { cause, rollbackCause: error_ },
            );
          }
          throw cause;
        }
      },
      catch: mysqlError,
    }).pipe(Effect.uninterruptible, semaphore.withPermits(1));
  const context = createMysqlRelationshipContext(client, mappings);
  return createRuntime(
    client,
    mappings,
    {
      runCommand: command =>
        runMutation(() => {
          const mapping = registry.get(command.root);
          if (!mapping)
            throw new MysqlDataGraphError(
              `Unmapped MySQL Entity ${command.root.name}.`,
              'invalid_command',
            );
          return executeMysqlCommand({ client, mapping, command });
        }),
      runRelationshipCommand: command =>
        runMutation(() => executeMysqlRelationshipCommand(context, command)),
      runManyToManyRelationshipCommand: command =>
        runMutation(() => executeMysqlManyToManyCommand(context, command)),
      runOrderedRelationshipCommand: command =>
        runMutation(() => executeMysqlOrderedRelationshipCommand(context, command)),
    },
    semaphore,
  );
};

export const createMysqlDataGraphRuntime = (
  options: MysqlDataGraphRuntimeOptions,
): MysqlTransactionDataGraphRuntime => {
  createSqlMappingRegistry(options.mappings);
  const transaction = createMysqlTransactionCapability(options.pool, client =>
    createTransactionRuntime(client, options.mappings),
  );
  return Object.assign(
    createRuntime(options.pool, options.mappings, {
      runCommand: command => transaction.transaction(runtime => runtime.runCommand(command)),
      runRelationshipCommand: command =>
        transaction.transaction(runtime => runtime.runRelationshipCommand(command)),
      runManyToManyRelationshipCommand: command =>
        transaction.transaction(runtime => runtime.runManyToManyRelationshipCommand(command)),
      runOrderedRelationshipCommand: command =>
        transaction.transaction(runtime => runtime.runOrderedRelationshipCommand(command)),
    }),
    transaction,
  );
};
