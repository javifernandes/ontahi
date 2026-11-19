import { cloneJson, type JsonValue } from '../../value/json.js';

export type DerivationId = string;
export type MaterializerVersion = string;
export type SourceFrontier = string;
export type AcceptedFrontier = string;

export type ReplicatedVersionedModelAcceptance = {
  derivationId: DerivationId;
  materializerVersion: MaterializerVersion;
  sourceFrontier: SourceFrontier;
  acceptedFrontier: AcceptedFrontier;
};

export type ReplicatedVersionedModelSnapshot<TState extends JsonValue = JsonValue> = {
  acceptance: ReplicatedVersionedModelAcceptance;
  state: TState;
};

export type ReplicatedVersionedModelRebuild<TState extends JsonValue = JsonValue> = {
  outcome: 'completed';
  mode: 'rebuild';
  materializerVersion: MaterializerVersion;
  sourceFrontier: SourceFrontier;
  acceptedFrontier: AcceptedFrontier;
  state: TState;
};

export type ReplicatedVersionedModelIncrement<TState extends JsonValue = JsonValue> = {
  outcome: 'completed';
  mode: 'incremental';
  materializerVersion: MaterializerVersion;
  baseSourceFrontier: SourceFrontier;
  sourceFrontier: SourceFrontier;
  acceptedFrontier: AcceptedFrontier;
  state: TState;
};

export type ReplicatedVersionedModelFailure = {
  outcome: 'failed';
  mode: 'rebuild' | 'incremental';
  materializerVersion: MaterializerVersion;
  baseSourceFrontier?: SourceFrontier;
  sourceFrontier: SourceFrontier;
  failure: unknown;
};

export type ReplicatedVersionedModelRebuildRequest = {
  outcome: 'rebuild-required';
  reason: 'unknown-dependency';
};

export type ReplicatedVersionedModelAttempt<TState extends JsonValue = JsonValue> =
  | ReplicatedVersionedModelRebuild<TState>
  | ReplicatedVersionedModelIncrement<TState>
  | ReplicatedVersionedModelFailure
  | ReplicatedVersionedModelRebuildRequest;

export type ReplicatedVersionedModelAccepted<TState extends JsonValue = JsonValue> = {
  status: 'accepted';
  replayed: boolean;
  snapshot: ReplicatedVersionedModelSnapshot<TState>;
};

export type ReplicatedVersionedModelRebuildRequired = {
  status: 'rebuild-required';
  reason:
    | 'missing-accepted-frontier'
    | 'source-frontier-gap'
    | 'materializer-version-changed'
    | 'unknown-dependency';
  accepted: ReplicatedVersionedModelAcceptance | null;
};

export type ReplicatedVersionedModelRejected =
  | {
      status: 'rejected';
      reason: 'materialization-failed';
      failure: unknown;
      accepted: ReplicatedVersionedModelAcceptance | null;
    }
  | {
      status: 'rejected';
      reason: 'frontier-conflict';
      accepted: ReplicatedVersionedModelAcceptance;
      attempted: ReplicatedVersionedModelAcceptance;
    };

export type ReplicatedVersionedModelResult<TState extends JsonValue = JsonValue> =
  | ReplicatedVersionedModelAccepted<TState>
  | ReplicatedVersionedModelRebuildRequired
  | ReplicatedVersionedModelRejected;

export type ReplicatedVersionedModelKernel<TState extends JsonValue = JsonValue> = {
  apply(attempt: ReplicatedVersionedModelAttempt<TState>): ReplicatedVersionedModelResult<TState>;
  current(): ReplicatedVersionedModelSnapshot<TState> | null;
};

const cloneAcceptance = (
  acceptance: ReplicatedVersionedModelAcceptance,
): ReplicatedVersionedModelAcceptance => ({ ...acceptance });

const cloneSnapshot = <TState extends JsonValue>(
  snapshot: ReplicatedVersionedModelSnapshot<TState>,
): ReplicatedVersionedModelSnapshot<TState> => ({
  acceptance: cloneAcceptance(snapshot.acceptance),
  state: cloneJson(snapshot.state),
});

const acceptanceFor = <TState extends JsonValue>(
  derivationId: DerivationId,
  attempt: ReplicatedVersionedModelRebuild<TState> | ReplicatedVersionedModelIncrement<TState>,
): ReplicatedVersionedModelAcceptance => ({
  derivationId,
  materializerVersion: attempt.materializerVersion,
  sourceFrontier: attempt.sourceFrontier,
  acceptedFrontier: attempt.acceptedFrontier,
});

export const createReplicatedVersionedModelKernel = <TState extends JsonValue>(options: {
  derivationId: DerivationId;
}): ReplicatedVersionedModelKernel<TState> => {
  const derivationId = options.derivationId;
  let current: ReplicatedVersionedModelSnapshot<TState> | null = null;

  const accepted = (): ReplicatedVersionedModelAcceptance | null =>
    current ? cloneAcceptance(current.acceptance) : null;

  const apply = (
    attempt: ReplicatedVersionedModelAttempt<TState>,
  ): ReplicatedVersionedModelResult<TState> => {
    if (attempt.outcome === 'rebuild-required') {
      return {
        status: 'rebuild-required',
        reason: attempt.reason,
        accepted: accepted(),
      };
    }

    if (attempt.outcome === 'failed') {
      return {
        status: 'rejected',
        reason: 'materialization-failed',
        failure: attempt.failure,
        accepted: accepted(),
      };
    }

    const attempted = acceptanceFor(derivationId, attempt);

    if (!current) {
      if (attempt.mode === 'incremental') {
        return {
          status: 'rebuild-required',
          reason: 'missing-accepted-frontier',
          accepted: null,
        };
      }
    } else {
      const currentAcceptance = current.acceptance;

      if (
        attempt.materializerVersion === currentAcceptance.materializerVersion &&
        attempt.sourceFrontier === currentAcceptance.sourceFrontier
      ) {
        if (attempt.acceptedFrontier !== currentAcceptance.acceptedFrontier) {
          return {
            status: 'rejected',
            reason: 'frontier-conflict',
            accepted: cloneAcceptance(currentAcceptance),
            attempted,
          };
        }

        return {
          status: 'accepted',
          replayed: true,
          snapshot: cloneSnapshot(current),
        };
      }

      if (attempt.mode === 'incremental') {
        if (attempt.materializerVersion !== currentAcceptance.materializerVersion) {
          return {
            status: 'rebuild-required',
            reason: 'materializer-version-changed',
            accepted: cloneAcceptance(currentAcceptance),
          };
        }

        if (attempt.baseSourceFrontier !== currentAcceptance.sourceFrontier) {
          return {
            status: 'rebuild-required',
            reason: 'source-frontier-gap',
            accepted: cloneAcceptance(currentAcceptance),
          };
        }
      }
    }

    current = {
      acceptance: attempted,
      state: cloneJson(attempt.state),
    };

    return {
      status: 'accepted',
      replayed: false,
      snapshot: cloneSnapshot(current),
    };
  };

  return {
    apply,
    current: () => (current ? cloneSnapshot(current) : null),
  };
};
