import { mayAffectGraphRead, type GraphReadRequest } from '../../data-graph/index.js';

import type { CommittedMutationCommit } from './unit-of-work.js';

export const MAX_GRAPH_OBSERVATION_REFRESH_CAUSES = 16;

export type GraphObservationRefreshCause = {
  readonly kind: 'committed-mutations';
  readonly commitIds: readonly string[];
  readonly overflow: boolean;
};

export type ActiveGraphObservationSubscription = {
  /** Resolves the bounded causes for a possibly relevant refresh, or undefined after teardown. */
  readonly wait: (signal: AbortSignal) => Promise<GraphObservationRefreshCause | undefined>;
  readonly close: () => void;
};

export type ActiveGraphObservationRegistry = {
  readonly register: (read: GraphReadRequest) => ActiveGraphObservationSubscription;
  readonly publish: (commit: CommittedMutationCommit) => void;
};

type Waiter = {
  readonly resolve: (cause: GraphObservationRefreshCause | undefined) => void;
  readonly detachAbort: () => void;
};

type ActiveObservation = {
  readonly read: GraphReadRequest;
  pendingCommitIds: string[];
  pendingOverflow: boolean;
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
      const observation: ActiveObservation = {
        read,
        pendingCommitIds: [],
        pendingOverflow: false,
        closed: false,
      };
      observations.add(observation);

      const close = () => {
        if (observation.closed) return;
        observation.closed = true;
        observations.delete(observation);
        observation.waiter?.detachAbort();
        observation.waiter?.resolve(undefined);
        observation.waiter = undefined;
      };

      return {
        close,
        wait: signal => {
          if (observation.closed || signal.aborted) return Promise.resolve(undefined);
          if (observation.pendingCommitIds.length > 0) {
            const cause: GraphObservationRefreshCause = {
              kind: 'committed-mutations',
              commitIds: observation.pendingCommitIds,
              overflow: observation.pendingOverflow,
            };
            observation.pendingCommitIds = [];
            observation.pendingOverflow = false;
            return Promise.resolve(cause);
          }
          if (observation.waiter) {
            throw new Error('An active Graph observation cannot wait concurrently.');
          }

          return new Promise<GraphObservationRefreshCause | undefined>(resolve => {
            const settle = (cause: GraphObservationRefreshCause | undefined) => {
              observation.waiter?.detachAbort();
              observation.waiter = undefined;
              resolve(cause);
            };
            const onAbort = () => settle(undefined);
            signal.addEventListener('abort', onAbort, { once: true });
            observation.waiter = {
              resolve: settle,
              detachAbort: () => signal.removeEventListener('abort', onAbort),
            };
          });
        },
      };
    },
    publish: commit => {
      if (commit.mutations.mutations.length === 0) return;
      observations.forEach(observation => {
        if (
          observation.closed ||
          !commit.mutations.mutations.some(mutation =>
            mayAffectGraphRead(mutation, observation.read),
          )
        ) {
          return;
        }

        const waiter = observation.waiter;
        if (waiter) {
          waiter.resolve({
            kind: 'committed-mutations',
            commitIds: [commit.id],
            overflow: false,
          });
          return;
        }
        if (observation.pendingCommitIds.includes(commit.id)) return;
        if (observation.pendingCommitIds.length < MAX_GRAPH_OBSERVATION_REFRESH_CAUSES) {
          observation.pendingCommitIds.push(commit.id);
        } else {
          observation.pendingOverflow = true;
        }
      });
    },
  };
};
