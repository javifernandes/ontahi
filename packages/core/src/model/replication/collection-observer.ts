import { cloneJson, type JsonValue } from '../../value/json.js';

export type CollectionObservationMode = 'bootstrap' | 'incremental' | 'validation' | 'repair';

export type CollectionChange<TRecord extends JsonValue> =
  | { kind: 'put'; id: string; record: TRecord }
  | { kind: 'remove'; id: string };

export type CollectionObservation<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue = JsonValue,
> = {
  changes: readonly CollectionChange<TRecord>[];
  targetFrontier: TFrontier;
  diagnostics: readonly TDiagnostic[];
  fetched: number;
  completeness: 'candidate' | 'complete';
};

export type ReplicatedCollectionObserver<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue = JsonValue,
> = {
  observe(
    acceptedFrontier: TFrontier | null,
    mode: CollectionObservationMode,
  ): Promise<CollectionObservation<TRecord, TFrontier, TDiagnostic>>;
};

export type AcceptedCollectionRecord<TRecord extends JsonValue> = {
  id: string;
  record: TRecord;
};

export type AcceptedCollectionSnapshot<TRecord extends JsonValue, TFrontier extends JsonValue> = {
  frontier: TFrontier;
  records: readonly AcceptedCollectionRecord<TRecord>[];
};

export type CollectionAcceptanceMetrics = {
  fetched: number;
  changed: number;
  reused: number;
  resulting: number;
};

export type CollectionAcceptanceDiagnostic = {
  code:
    | 'incomplete-observation'
    | 'invalid-fetched-count'
    | 'missing-accepted-frontier'
    | 'observation-failed'
    | 'stale-writer'
    | 'validation-mismatch';
  message: string;
};

export type CollectionAcceptanceResult<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue = JsonValue,
> = {
  status: 'accepted' | 'validated' | 'rejected';
  snapshot: AcceptedCollectionSnapshot<TRecord, TFrontier> | null;
  metrics: CollectionAcceptanceMetrics | null;
  diagnostics: readonly CollectionAcceptanceDiagnostic[];
  observerDiagnostics: readonly TDiagnostic[];
};

export type ReplicatedCollectionAcceptanceRunner<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue = JsonValue,
> = {
  run(
    mode: CollectionObservationMode,
  ): Promise<CollectionAcceptanceResult<TRecord, TFrontier, TDiagnostic>>;
  current(): AcceptedCollectionSnapshot<TRecord, TFrontier> | null;
};

export type ReplicatedCollectionAcceptanceRunnerOptions<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
> = {
  initialSnapshot?: AcceptedCollectionSnapshot<TRecord, TFrontier>;
};

const cloneSnapshot = <TRecord extends JsonValue, TFrontier extends JsonValue>(
  snapshot: AcceptedCollectionSnapshot<TRecord, TFrontier>,
): AcceptedCollectionSnapshot<TRecord, TFrontier> => cloneJson(snapshot);

const recordsById = <TRecord extends JsonValue>(
  records: readonly AcceptedCollectionRecord<TRecord>[],
): Map<string, TRecord> => new Map(records.map(({ id, record }) => [id, cloneJson(record)]));

const sortedRecords = <TRecord extends JsonValue>(
  records: ReadonlyMap<string, TRecord>,
): readonly AcceptedCollectionRecord<TRecord>[] =>
  [...records]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, record]) => ({ id, record: cloneJson(record) }));

const equalJson = (left: JsonValue, right: JsonValue): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const sameSnapshotRecords = <TRecord extends JsonValue>(
  left: readonly AcceptedCollectionRecord<TRecord>[],
  right: readonly AcceptedCollectionRecord<TRecord>[],
): boolean => equalJson(sortedRecords(recordsById(left)), sortedRecords(recordsById(right)));

const applyChanges = <TRecord extends JsonValue>(
  records: Map<string, TRecord>,
  changes: readonly CollectionChange<TRecord>[],
): void => {
  for (const change of changes) {
    if (change.kind === 'put') {
      records.set(change.id, cloneJson(change.record));
    } else records.delete(change.id);
  }
};

const changedRecordCount = <TRecord extends JsonValue>(
  previous: readonly AcceptedCollectionRecord<TRecord>[],
  resulting: ReadonlyMap<string, TRecord>,
): number => {
  const previousById = recordsById(previous);
  return (
    new Set([...previousById.keys(), ...resulting.keys()]).size -
    [...previousById].filter(([id, record]) => {
      const result = resulting.get(id);
      return result !== undefined && equalJson(record, result);
    }).length
  );
};

const reusedRecordCount = <TRecord extends JsonValue>(
  previous: readonly AcceptedCollectionRecord<TRecord>[],
  resulting: ReadonlyMap<string, TRecord>,
): number =>
  previous.filter(({ id, record }) => {
    const result = resulting.get(id);
    return result !== undefined && equalJson(record, result);
  }).length;

const rejection = <
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue,
>(
  snapshot: AcceptedCollectionSnapshot<TRecord, TFrontier> | null,
  code: CollectionAcceptanceDiagnostic['code'],
  message: string,
  observerDiagnostics: readonly TDiagnostic[] = [],
): CollectionAcceptanceResult<TRecord, TFrontier, TDiagnostic> => ({
  status: 'rejected',
  snapshot: snapshot ? cloneSnapshot(snapshot) : null,
  metrics: null,
  diagnostics: [{ code, message }],
  observerDiagnostics: cloneJson(observerDiagnostics),
});

export const createReplicatedCollectionAcceptanceRunner = <
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
  TDiagnostic extends JsonValue = JsonValue,
>(
  observer: ReplicatedCollectionObserver<TRecord, TFrontier, TDiagnostic>,
  options: ReplicatedCollectionAcceptanceRunnerOptions<TRecord, TFrontier> = {},
): ReplicatedCollectionAcceptanceRunner<TRecord, TFrontier, TDiagnostic> => {
  let current = options.initialSnapshot ? cloneSnapshot(options.initialSnapshot) : null;

  const run = async (
    mode: CollectionObservationMode,
  ): Promise<CollectionAcceptanceResult<TRecord, TFrontier, TDiagnostic>> => {
    const base = current ? cloneSnapshot(current) : null;

    if (mode === 'incremental' && !base) {
      return rejection(
        current,
        'missing-accepted-frontier',
        'Incremental observation requires an accepted collection frontier.',
      );
    }

    let observation: CollectionObservation<TRecord, TFrontier, TDiagnostic>;
    try {
      observation = cloneJson(await observer.observe(base?.frontier ?? null, mode));
    } catch (failure) {
      return rejection(
        current,
        'observation-failed',
        failure instanceof Error ? failure.message : 'Collection observation failed.',
      );
    }

    if (!Number.isSafeInteger(observation.fetched) || observation.fetched < 0) {
      return rejection(
        current,
        'invalid-fetched-count',
        'Observed fetched count must be a non-negative safe integer.',
        observation.diagnostics,
      );
    }

    if (mode !== 'incremental' && observation.completeness !== 'complete') {
      return rejection(
        current,
        'incomplete-observation',
        `${mode} observation must produce a complete collection candidate.`,
        observation.diagnostics,
      );
    }

    const startsFromAccepted = mode === 'incremental';
    const candidate = recordsById(startsFromAccepted && base ? base.records : []);
    applyChanges(candidate, observation.changes);
    const records = sortedRecords(candidate);
    const metrics = {
      fetched: observation.fetched,
      changed: changedRecordCount(base?.records ?? [], candidate),
      reused: base ? reusedRecordCount(base.records, candidate) : 0,
      resulting: records.length,
    };
    const candidateSnapshot = {
      frontier: cloneJson(observation.targetFrontier),
      records,
    };

    if (mode === 'validation') {
      if (!base || !sameSnapshotRecords(base.records, records)) {
        return {
          status: 'rejected',
          snapshot: base,
          metrics,
          diagnostics: [
            {
              code: 'validation-mismatch',
              message: 'Complete validation observation differs from the accepted snapshot.',
            },
          ],
          observerDiagnostics: cloneJson(observation.diagnostics),
        };
      }

      return {
        status: 'validated',
        snapshot: base,
        metrics,
        diagnostics: [],
        observerDiagnostics: cloneJson(observation.diagnostics),
      };
    }

    const acceptedFrontier = current?.frontier ?? null;
    const baseFrontier = base?.frontier ?? null;
    if (!equalJson(acceptedFrontier, baseFrontier)) {
      return rejection(
        current,
        'stale-writer',
        'Accepted collection advanced while this observation was in progress.',
        observation.diagnostics,
      );
    }

    current = cloneSnapshot(candidateSnapshot);

    return {
      status: 'accepted',
      snapshot: cloneSnapshot(current),
      metrics,
      diagnostics: [],
      observerDiagnostics: cloneJson(observation.diagnostics),
    };
  };

  return {
    run,
    current: () => (current ? cloneSnapshot(current) : null),
  };
};
