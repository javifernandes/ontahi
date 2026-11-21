import { Effect, Stream } from 'effect';

import type { InMemoryDataset } from './materialization.js';

type InMemoryDataGraphObservationHub = {
  readonly changes: () => Stream.Stream<void>;
  readonly publish: () => void;
};

const hubs = new WeakMap<InMemoryDataset, InMemoryDataGraphObservationHub>();

const createObservationHub = (): InMemoryDataGraphObservationHub => {
  const listeners = new Set<() => void>();

  return {
    changes: () =>
      Stream.asyncScoped<void>(
        emit =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const listener = () => {
                void emit.single(undefined);
              };
              listeners.add(listener);
              listener();
              return listener;
            }),
            listener => Effect.sync(() => listeners.delete(listener)),
          ),
        { bufferSize: 1, strategy: 'sliding' },
      ),
    publish: () => {
      for (const listener of listeners) listener();
    },
  };
};

export const getInMemoryDataGraphObservationHub = (
  dataset: InMemoryDataset,
): InMemoryDataGraphObservationHub => {
  const existing = hubs.get(dataset);
  if (existing) return existing;

  const hub = createObservationHub();
  hubs.set(dataset, hub);
  return hub;
};
