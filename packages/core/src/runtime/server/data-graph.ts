import { Effect } from 'effect';

import type { RelationshipCommandResult } from '../../data-graph/relationship-command-result.js';
import type { RelationshipCommandExecutor } from '../../data-graph/relationship-command.js';
import {
  DataGraphTransactionUnavailableError,
  isDataGraphTransactionCapability,
  type DataGraphTransactionCapability,
} from '../../data-graph/transaction.js';

import { getOperationRuntimeContext, getRequiredOperationRuntimeContext } from './context.js';
import { failOperation } from './failures.js';
import type { LayerConcern, LayerConcernRuntime } from './layer-types.js';
import { OPERATION_CACHE_STORE_RESOURCE_KEY } from './operation/cache.js';
import type { OperationFailure } from './operation/types.js';
import { withChildUnitOfWork } from './unit-of-work.js';

export const DATA_GRAPH_RUNTIME_RESOURCE_KEY = 'dataGraph.runtime';
export const DATA_GRAPH_RELATIONSHIP_COMMAND_EXECUTOR = Symbol(
  'ontahi.dataGraph.relationshipCommandExecutor',
);
const DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY = 'dataGraph.transactionScope';
const DATA_GRAPH_POST_COMMIT_WORK_RESOURCE_KEY = 'dataGraph.postCommitWork';

type DataGraphPostCommitWork = () => Promise<void>;

export const deferDataGraphPostCommitWork = (work: DataGraphPostCommitWork): boolean => {
  const queue = getOperationRuntimeContext()?.resources.get(
    DATA_GRAPH_POST_COMMIT_WORK_RESOURCE_KEY,
  ) as DataGraphPostCommitWork[] | undefined;
  if (!queue) return false;
  queue.push(work);
  return true;
};

export type WithDataGraphOptions<TInput, TRuntime> = {
  createRuntime: (runtime: LayerConcernRuntime<TInput>) => TRuntime;
};

export const getCurrentDataGraphRuntime = <TRuntime>(): TRuntime | undefined =>
  getOperationRuntimeContext()?.resources.get(DATA_GRAPH_RUNTIME_RESOURCE_KEY) as
    | TRuntime
    | undefined;

export const getRequiredDataGraphRuntime = <TRuntime>(): TRuntime => {
  const runtime = getRequiredOperationRuntimeContext().resources.get(
    DATA_GRAPH_RUNTIME_RESOURCE_KEY,
  );

  if (!runtime) {
    throw new Error('Data graph runtime is not configured in the current server context');
  }

  return runtime as TRuntime;
};

export const getRequiredDataGraphRuntimeEffect = <TRuntime>() =>
  Effect.sync(() => getRequiredDataGraphRuntime<TRuntime>());

type DataGraphTransactionError<TRuntime> =
  TRuntime extends DataGraphTransactionCapability<any, infer TError> ? TError : never;

export const withDataGraphTransaction = <TRuntime, TValue, TError = never, TRequirements = never>(
  effect: Effect.Effect<TValue, TError, TRequirements>,
): Effect.Effect<
  TValue,
  TError | DataGraphTransactionError<TRuntime> | DataGraphTransactionUnavailableError,
  TRequirements
> =>
  Effect.suspend(() => {
    const runtime = getRequiredDataGraphRuntime<TRuntime>();
    if (!isDataGraphTransactionCapability(runtime)) {
      return Effect.fail(new DataGraphTransactionUnavailableError());
    }

    const postCommitWork: DataGraphPostCommitWork[] = [];
    return runtime
      .transaction(transactionRuntime =>
        withChildUnitOfWork(effect, {
          isolatedResources: [OPERATION_CACHE_STORE_RESOURCE_KEY],
          resources: [
            [DATA_GRAPH_RUNTIME_RESOURCE_KEY, transactionRuntime],
            [DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY, true],
            [DATA_GRAPH_POST_COMMIT_WORK_RESOURCE_KEY, postCommitWork],
          ],
        }),
      )
      .pipe(
        Effect.flatMap(value =>
          Effect.promise(async () => {
            for (const work of postCommitWork) await work();
            return value;
          }),
        ),
      );
  }) as Effect.Effect<
    TValue,
    TError | DataGraphTransactionError<TRuntime> | DataGraphTransactionUnavailableError,
    TRequirements
  >;

export const withAtomicDataGraphExecution = <TInput>(): LayerConcern<
  TInput,
  OperationFailure<'execution_unavailable'>
> => ({
  run: <TSuccess, TNextError>(
    _runtime: LayerConcernRuntime<TInput>,
    next: Effect.Effect<TSuccess, TNextError>,
  ): Effect.Effect<TSuccess, TNextError | OperationFailure<'execution_unavailable'>> =>
    Effect.suspend(
      (): Effect.Effect<TSuccess, TNextError | OperationFailure<'execution_unavailable'>> => {
        if (
          getRequiredOperationRuntimeContext().resources.has(
            DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY,
          )
        ) {
          return next;
        }

        return withDataGraphTransaction(next).pipe(
          Effect.catchTag('DataGraphTransactionUnavailableError', () =>
            failOperation(
              'execution_unavailable',
              'This Operation requires atomic Data Graph execution, but the current runtime cannot provide it.',
            ),
          ),
        );
      },
    ),
});

export const createContextualRelationshipCommandExecutor = <
  TError = unknown,
  TOptions = undefined,
>(): RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult> => ({
  runRelationshipCommand: (command, options) =>
    Effect.suspend(() => {
      const runtime =
        getRequiredDataGraphRuntime<Partial<RelationshipCommandExecutor<TError, TOptions>>>();
      if (typeof runtime.runRelationshipCommand !== 'function') {
        throw new Error(
          'The current Data Graph runtime does not support direct Relationship Command execution.',
        );
      }
      return runtime.runRelationshipCommand(command, options);
    }),
  runManyToManyRelationshipCommand: (command, options) =>
    Effect.suspend(() => {
      const runtime =
        getRequiredDataGraphRuntime<Partial<RelationshipCommandExecutor<TError, TOptions>>>();
      if (typeof runtime.runManyToManyRelationshipCommand !== 'function') {
        throw new Error(
          'The current Data Graph runtime does not support many-to-many Relationship Command execution.',
        );
      }
      return runtime.runManyToManyRelationshipCommand(command, options);
    }),
});

export const withDataGraph = <TInput = unknown, TRuntime = unknown>({
  createRuntime,
}: WithDataGraphOptions<TInput, TRuntime>): LayerConcern<TInput> => ({
  run: (runtime, next) =>
    Effect.sync(() => {
      if (!runtime.resources.has(DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY)) {
        runtime.resources.set(DATA_GRAPH_RUNTIME_RESOURCE_KEY, createRuntime(runtime));
      }
    }).pipe(Effect.zipRight(next)),
});
