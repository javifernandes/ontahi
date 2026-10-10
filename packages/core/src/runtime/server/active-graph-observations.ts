import {
  mayAffectGraphRead,
  type CommittedMutationSet,
  type GraphReadRequest,
} from '../../data-graph/index.js';

export type ActiveGraphObservationSubscription = {
  /** Resolves true for a possibly relevant commit and false after teardown or abort. */
  readonly wait: (signal: AbortSignal) => Promise<boolean>;
  readonly close: () => void;
};

export type ActiveGraphObservationRegistry = {
  readonly register: (read: GraphReadRequest) => ActiveGraphObservationSubscription;
  readonly publish: (mutations: CommittedMutationSet) => void;
};

type Waiter = {
  readonly resolve: (changed: boolean) => void;
  readonly detachAbort: () => void;
};

type ActiveObservation = {
  readonly read: GraphReadRequest;
  pending: boolean;
  closed: boolean;
  waiter?: Waiter;
};

/**
 * Process-local, deliberately lossy delivery for semantic observation refreshes.
 * Each observation retains at most one pending signal; Graph Reads are the durable truth.
 */
export const createActiveGraphObservationRegistry = (): ActiveGraphObservationRegistry => {
  const observations = new Set<ActiveObservation>();

  return {
    register: read => {
      const observation: ActiveObservation = { read, pending: false, closed: false };
      observations.add(observation);

      const close = () => {
        if (observation.closed) return;
        observation.closed = true;
        observations.delete(observation);
        observation.waiter?.detachAbort();
        observation.waiter?.resolve(false);
        observation.waiter = undefined;
      };

      return {
        close,
        wait: signal => {
          if (observation.closed || signal.aborted) return Promise.resolve(false);
          if (observation.pending) {
            observation.pending = false;
            return Promise.resolve(true);
          }
          if (observation.waiter) {
            throw new Error('An active Graph observation cannot wait concurrently.');
          }

          return new Promise<boolean>(resolve => {
            const settle = (changed: boolean) => {
              observation.waiter?.detachAbort();
              observation.waiter = undefined;
              resolve(changed);
            };
            const onAbort = () => settle(false);
            signal.addEventListener('abort', onAbort, { once: true });
            observation.waiter = {
              resolve: settle,
              detachAbort: () => signal.removeEventListener('abort', onAbort),
            };
          });
        },
      };
    },
    publish: mutations => {
      if (mutations.mutations.length === 0) return;
      observations.forEach(observation => {
        if (
          observation.closed ||
          !mutations.mutations.some(mutation => mayAffectGraphRead(mutation, observation.read))
        ) {
          return;
        }

        const waiter = observation.waiter;
        if (waiter) {
          waiter.resolve(true);
          return;
        }
        observation.pending = true;
      });
    },
  };
};
