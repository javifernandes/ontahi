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
  current(): Promise<AcceptedCollectionSnapshot<TRecord, TFrontier> | null>;
};

export type ReplicatedCollectionAcceptanceRunnerOptions<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
> = {
  collectionId?: string;
  activeStorage?: Partial<ReplicatedCollectionStorageCapability>;
  storage?: ReplicatedCollectionStorage<TRecord, TFrontier>;
};

export type ReplicatedCollectionStoredSnapshot<
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
> = {
  revision: string;
  snapshot: AcceptedCollectionSnapshot<TRecord, TFrontier>;
};

export type ReplicatedCollectionStorage<
  TRecord extends JsonValue = JsonValue,
  TFrontier extends JsonValue = JsonValue,
> = {
  load(
    collectionId: string,
  ): Promise<ReplicatedCollectionStoredSnapshot<TRecord, TFrontier> | null>;
  accept(input: {
    collectionId: string;
    expectedRevision: string | null;
    snapshot: AcceptedCollectionSnapshot<TRecord, TFrontier>;
  }): Promise<
    | ReplicatedCollectionStoredSnapshot<TRecord, TFrontier>
    | {
        status: 'conflict';
        current: ReplicatedCollectionStoredSnapshot<TRecord, TFrontier> | null;
      }
  >;
};

export type ReplicatedCollectionStorageCapability = {
  replicatedCollectionStorage: ReplicatedCollectionStorage;
};

export const resolveReplicatedCollectionStorage = <
  TRecord extends JsonValue,
  TFrontier extends JsonValue,
>(
  activeStorage: Partial<ReplicatedCollectionStorageCapability>,
  customStorage?: ReplicatedCollectionStorage<TRecord, TFrontier>,
): ReplicatedCollectionStorage<TRecord, TFrontier> => {
  const storage = customStorage ?? activeStorage.replicatedCollectionStorage;
  if (!storage) {
    throw new Error(
      'The active Entity storage does not provide replicated collection persistence. Pass a custom storage adapter explicitly.',
    );
  }
  return storage as ReplicatedCollectionStorage<TRecord, TFrontier>;
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

const equalJson = (left: JsonValue, right: JsonValue): boolean => {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalJson(value, right[index]))
    );
  }
  const leftEntries = Object.entries(left);
  const rightObject = right as Readonly<Record<string, JsonValue>>;
  return (
    leftEntries.length === Object.keys(rightObject).length &&
    leftEntries.every(
      ([key, value]) =>
        Object.prototype.hasOwnProperty.call(rightObject, key) &&
        equalJson(value, rightObject[key]),
    )
  );
};

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
  options: ReplicatedCollectionAcceptanceRunnerOptions<TRecord, TFrontier>,
): ReplicatedCollectionAcceptanceRunner<TRecord, TFrontier, TDiagnostic> => {
  const collectionId = options.collectionId ?? 'default';
  const storage = resolveReplicatedCollectionStorage(options.activeStorage ?? {}, options.storage);

  const run = async (
    mode: CollectionObservationMode,
  ): Promise<CollectionAcceptanceResult<TRecord, TFrontier, TDiagnostic>> => {
    const storedBase = await storage.load(collectionId);
    const base = storedBase ? cloneSnapshot(storedBase.snapshot) : null;

    if (mode === 'incremental' && !base) {
      return rejection(
        base,
        'missing-accepted-frontier',
        'Incremental observation requires an accepted collection frontier.',
      );
    }

    let observation: CollectionObservation<TRecord, TFrontier, TDiagnostic>;
    try {
      observation = cloneJson(await observer.observe(cloneJson(base?.frontier ?? null), mode));
    } catch (failure) {
      return rejection(
        base,
        'observation-failed',
        failure instanceof Error ? failure.message : 'Collection observation failed.',
      );
    }

    if (!Number.isSafeInteger(observation.fetched) || observation.fetched < 0) {
      return rejection(
        base,
        'invalid-fetched-count',
        'Observed fetched count must be a non-negative safe integer.',
        observation.diagnostics,
      );
    }

    if (mode !== 'incremental' && observation.completeness !== 'complete') {
      return rejection(
        base,
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

    const acceptance = await storage.accept({
      collectionId,
      expectedRevision: storedBase?.revision ?? null,
      snapshot: candidateSnapshot,
    });

    if ('status' in acceptance) {
      return rejection(
        acceptance.current?.snapshot ?? null,
        'stale-writer',
        'Accepted collection advanced while this observation was in progress.',
        observation.diagnostics,
      );
    }

    return {
      status: 'accepted',
      snapshot: cloneSnapshot(acceptance.snapshot),
      metrics,
      diagnostics: [],
      observerDiagnostics: cloneJson(observation.diagnostics),
    };
  };

  return {
    run,
    current: async () => (await storage.load(collectionId))?.snapshot ?? null,
  };
};

export const createInMemoryReplicatedCollectionStorage = <
  TRecord extends JsonValue = JsonValue,
  TFrontier extends JsonValue = JsonValue,
>(
  initial: Readonly<
    Record<string, AcceptedCollectionSnapshot<TRecord, TFrontier> | undefined>
  > = {},
): ReplicatedCollectionStorage<TRecord, TFrontier> => {
  const snapshots = new Map<string, ReplicatedCollectionStoredSnapshot<TRecord, TFrontier>>();
  let nextRevision = 1;

  for (const [collectionId, snapshot] of Object.entries(initial)) {
    if (snapshot) {
      snapshots.set(collectionId, {
        revision: String(nextRevision++),
        snapshot: cloneSnapshot(snapshot),
      });
    }
  }

  return {
    load: async collectionId => {
      const stored = snapshots.get(collectionId);
      return stored ? cloneJson(stored) : null;
    },
    accept: async ({ collectionId, expectedRevision, snapshot }) => {
      const current = snapshots.get(collectionId) ?? null;
      if ((current?.revision ?? null) !== expectedRevision) {
        return { status: 'conflict', current: current ? cloneJson(current) : null };
      }

      const accepted = {
        revision: String(nextRevision++),
        snapshot: cloneSnapshot(snapshot),
      };
      snapshots.set(collectionId, accepted);
      return cloneJson(accepted);
    },
  };
};
