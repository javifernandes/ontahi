import {
  type AnyEntityDefinition,
  type DataGraphExecutionRuntime,
  type DataGraphTransactionCapability,
  type EntityMutationCommandExecutionRuntime,
  type GraphCommandSpec,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type OrderedRelationshipCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
} from '@ontahi/core/data-graph';
import { createSqlReadRuntime } from '@ontahi/sql';
import { Effect } from 'effect';
import type { Pool, QueryResultRow } from 'pg';

import {
  executePostgresCommand,
  executePostgresEntityMutationCommand,
  executePostgresManyToManyCommand,
  executePostgresOrderedRelationshipCommandEffect,
  executePostgresRelationshipCommand,
} from './command-runtime.js';
import { postgresDialect } from './dialect.js';
import { createPostgresMappingRegistry, type PostgresEntityMapping } from './mapping.js';
import { requiresPostgresRelationshipCommandSerialization } from './relation-count-constraint.js';
import { PostgresDataGraphError } from './runtime-error.js';
import {
  createPostgresTransactionCapability,
  type PostgresTransactionClient,
} from './transaction.js';

export { PostgresDataGraphError, type PostgresDataGraphErrorReason } from './runtime-error.js';

const mappingFor = (
  registry: Map<AnyEntityDefinition, PostgresEntityMapping>,
  entity: AnyEntityDefinition,
) => {
  const mapping = registry.get(entity);
  if (!mapping) throw new Error(`Missing PostgreSQL mapping for ${entity.name}.`);
  return mapping;
};

type PostgresDataGraphRuntime = DataGraphExecutionRuntime<
  PostgresDataGraphError,
  undefined,
  undefined,
  PostgresDataGraphError
> &
  ManyToManyRelationshipCommandExecutionRuntime<PostgresDataGraphError> &
  OrderedRelationshipCommandExecutionRuntime<PostgresDataGraphError> &
  RelationshipCommandExecutionRuntime<PostgresDataGraphError> &
  EntityMutationCommandExecutionRuntime<PostgresDataGraphError>;

export type PostgresTransactionDataGraphRuntime = PostgresDataGraphRuntime &
  DataGraphTransactionCapability<PostgresDataGraphRuntime, PostgresDataGraphError>;

type PostgresRuntimeInput = {
  pool: Pick<Pool, 'query'>;
  mappings: readonly PostgresEntityMapping[];
};

type PostgresTransactionPool = Pick<Pool, 'connect' | 'query'>;

type CreatePostgresDataGraphRuntime = {
  (
    input: Omit<PostgresRuntimeInput, 'pool'> & { pool: PostgresTransactionPool },
  ): PostgresTransactionDataGraphRuntime;
  (input: PostgresRuntimeInput): PostgresDataGraphRuntime;
};

const createPostgresBaseDataGraphRuntime = (
  input: PostgresRuntimeInput,
  execution: {
    transactionScoped?: boolean;
    transactionCapability?: DataGraphTransactionCapability<
      PostgresDataGraphRuntime,
      PostgresDataGraphError
    >;
  } = {},
): PostgresDataGraphRuntime => {
  const registry = createPostgresMappingRegistry(input.mappings);
  const executeQuery = <TRow extends QueryResultRow>(sql: { text: string; values: unknown[] }) =>
    input.pool.query<TRow>(sql.text, sql.values);

  return {
    ...createSqlReadRuntime({
      mappings: input.mappings,
      dialect: postgresDialect,
      executeQuery,
      Error: PostgresDataGraphError,
    }),
    runCommand: <TResult>(command: GraphCommandSpec<any, any, TResult>) =>
      executePostgresCommand({
        command,
        executeQuery,
        mapping: mappingFor(registry, command.root),
      }),
    runEntityMutationCommand: command => {
      const mapping = input.mappings.find(
        candidate => candidate.entity.name === command.entityName,
      );
      return mapping
        ? executePostgresEntityMutationCommand({ command, executeQuery, mapping })
        : Effect.fail(
            new PostgresDataGraphError(
              `PostgreSQL Entity Mutation Command references unmapped Entity ${command.entityName}.`,
              'invalid_command',
            ),
          );
    },
    runManyToManyRelationshipCommand: command =>
      executePostgresManyToManyCommand({ command, executeQuery, mappings: input.mappings }),
    runOrderedRelationshipCommand: command =>
      Effect.suspend(() => {
        if (!execution.transactionScoped && execution.transactionCapability) {
          return execution.transactionCapability.transaction(runtime =>
            runtime.runOrderedRelationshipCommand(command),
          );
        }
        return executePostgresOrderedRelationshipCommandEffect({
          command,
          executeQuery,
          mappings: input.mappings,
          authoritySerialized: execution.transactionScoped,
        });
      }),
    runRelationshipCommand: command =>
      Effect.suspend(() => {
        const source = input.mappings.find(
          mapping => mapping.entity.name === command.relation.sourceEntityName,
        );
        const target = input.mappings.find(
          mapping => mapping.entity.name === command.relation.targetEntityName,
        );
        const requiresSerialization =
          source &&
          target &&
          requiresPostgresRelationshipCommandSerialization(command, source, target);
        if (requiresSerialization && !execution.transactionScoped) {
          if (execution.transactionCapability) {
            return execution.transactionCapability.transaction(runtime =>
              runtime.runRelationshipCommand(command),
            );
          }
        }
        return executePostgresRelationshipCommand({
          command,
          executeQuery,
          mappings: input.mappings,
          authoritySerialized: execution.transactionScoped,
        });
      }),
  };
};

export const createPostgresDataGraphRuntime = ((input: PostgresRuntimeInput) => {
  const pool = input.pool as Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>;

  if (typeof pool.connect !== 'function') return createPostgresBaseDataGraphRuntime(input);

  const transactionCapability = createPostgresTransactionCapability(
    pool as PostgresTransactionPool,
    client =>
      createPostgresBaseDataGraphRuntime(
        {
          pool: client as PostgresTransactionClient & Pick<Pool, 'query'>,
          mappings: input.mappings,
        },
        { transactionScoped: true },
      ),
  );
  return Object.assign(
    createPostgresBaseDataGraphRuntime(input, { transactionCapability }),
    transactionCapability,
  );
}) as CreatePostgresDataGraphRuntime;
