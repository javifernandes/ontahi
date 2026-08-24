import { Effect } from 'effect';

import type { RelationshipCommandExecutor } from '../../data-graph/relationship-command.js';
import {
  DataGraphTransactionUnavailableError,
  isDataGraphTransactionCapability,
  type DataGraphTransactionCapability,
} from '../../data-graph/transaction.js';

import { getOperationRuntimeContext, getRequiredOperationRuntimeContext } from './context.js';
import type { LayerConcern, LayerConcernRuntime } from './layer-types.js';
import { OPERATION_CACHE_STORE_RESOURCE_KEY } from './operation/cache.js';
import { withChildUnitOfWork } from './unit-of-work.js';

export const DATA_GRAPH_RUNTIME_RESOURCE_KEY = 'dataGraph.runtime';
const DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY = 'dataGraph.transactionScope';

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

    return runtime.transaction(transactionRuntime =>
      withChildUnitOfWork(effect, {
        isolatedResources: [OPERATION_CACHE_STORE_RESOURCE_KEY],
        resources: [
          [DATA_GRAPH_RUNTIME_RESOURCE_KEY, transactionRuntime],
          [DATA_GRAPH_TRANSACTION_SCOPE_RESOURCE_KEY, true],
        ],
      }),
    );
  }) as Effect.Effect<
    TValue,
    TError | DataGraphTransactionError<TRuntime> | DataGraphTransactionUnavailableError,
    TRequirements
  >;

export const createContextualRelationshipCommandExecutor = <
  TError = unknown,
  TOptions = undefined,
>(): RelationshipCommandExecutor<TError, TOptions> => ({
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
