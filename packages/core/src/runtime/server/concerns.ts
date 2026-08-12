import { Effect } from 'effect';

import type { LayerConcern, LayerConcernRuntime } from './layer-types.js';

export const combineConcerns = <TInput>(
  layerConcerns: ReadonlyArray<LayerConcern<any, unknown>> | undefined,
  localConcerns: ReadonlyArray<LayerConcern<TInput, unknown>> | undefined,
): ReadonlyArray<LayerConcern<TInput, unknown>> | undefined => {
  if (!layerConcerns?.length && !localConcerns?.length) {
    return undefined;
  }

  return [
    ...((layerConcerns ?? []) as ReadonlyArray<LayerConcern<TInput, unknown>>),
    ...(localConcerns ?? []),
  ];
};

export const applyLayerConcerns = <TInput, TSuccess, TError>(
  runtime: LayerConcernRuntime<TInput>,
  concerns: ReadonlyArray<LayerConcern<TInput, unknown>> | undefined,
  effect: Effect.Effect<TSuccess, TError>,
): Effect.Effect<TSuccess, TError | unknown> => {
  if (!concerns?.length) {
    return effect;
  }

  return concerns.reduceRight<Effect.Effect<TSuccess, TError | unknown>>(
    (next, concern) => concern.run(runtime, next),
    effect,
  );
};
