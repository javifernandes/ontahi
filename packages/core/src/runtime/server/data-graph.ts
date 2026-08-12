import { Effect } from 'effect';

import { getOperationRuntimeContext, getRequiredOperationRuntimeContext } from './context.js';
import type { LayerConcern, LayerConcernRuntime } from './layer-types.js';

export const DATA_GRAPH_RUNTIME_RESOURCE_KEY = 'dataGraph.runtime';

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

export const withDataGraph = <TInput = unknown, TRuntime = unknown>({
  createRuntime,
}: WithDataGraphOptions<TInput, TRuntime>): LayerConcern<TInput> => ({
  run: (runtime, next) =>
    Effect.sync(() => {
      runtime.resources.set(DATA_GRAPH_RUNTIME_RESOURCE_KEY, createRuntime(runtime));
    }).pipe(Effect.zipRight(next)),
});
