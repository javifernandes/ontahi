import { Effect } from 'effect';

import { duplicateTaskRunFailure, missingTaskRunFailure } from './failures.js';
import { normalizeTaskRunsBySubjectQuery } from './subject-discovery.js';
import { normalizeTaskTrigger, taskTriggerActorMatches } from './triggers.js';
import type {
  TaskActor,
  TaskFailure,
  TaskRunIdentity,
  TaskRunCreateInput,
  TaskRunListItem,
  TaskRunSource,
  TaskSnapshot,
  TaskStorage,
} from './types.js';

const now = () => new Date().toISOString();

export const projectTaskSnapshot = (source: TaskRunSource): TaskSnapshot => ({
  taskId: source.taskId,
  runId: source.runId,
  status: source.status,
  subject: source.subject,
  createdAt: source.createdAt,
  startedAt: source.startedAt,
  updatedAt: source.updatedAt,
  completedAt: source.completedAt,
  progress: source.progress,
  interaction: source.checkpoint?.interaction,
  waitingOn: source.checkpoint?.interaction
    ? { kind: 'interaction', interaction: source.checkpoint.interaction }
    : source.checkpoint?.eventWait,
  resumedBy: source.checkpoint?.eventResume,
  error: source.error,
  result: source.result,
  ...(source.executionMetadata ? { executionMetadata: source.executionMetadata } : {}),
});

export const projectTaskRunListItem = (source: TaskRunSource): TaskRunListItem => {
  const { result: _result, ...snapshot } = projectTaskSnapshot(source);

  return {
    ...snapshot,
    trigger: source.trigger,
    runtime: source.runtime,
  };
};

const matchesActor = (source: TaskRunSource, actor: TaskActor) =>
  taskTriggerActorMatches(source.trigger, actor);

const getCreatedSortKey = (source: TaskRunSource) => source.createdAt ?? source.updatedAt;

const compareByCreatedAtDescending = (left: TaskRunSource, right: TaskRunSource) =>
  getCreatedSortKey(right).localeCompare(getCreatedSortKey(left));

export const createInMemoryTaskStorage = (): TaskStorage => {
  const runs = new Map<string, TaskRunSource>();
  const keyOf = (ref: TaskRunIdentity) => JSON.stringify([ref.taskId, ref.runId]);

  const admissions = new Map<string, TaskRunIdentity>();
  const insert = (input: TaskRunCreateInput, key: string): TaskRunSource => {
    const createdAt = now();
    const source: TaskRunSource = {
      taskId: input.taskId,
      runId: input.runId,
      status: 'queued',
      ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
      input: input.input,
      trigger: normalizeTaskTrigger(input.trigger),
      subject: input.subject,
      runtime: input.runtime,
      ...(input.enqueueTrace ? { enqueueTrace: input.enqueueTrace } : {}),
      createdAt,
      updatedAt: createdAt,
    };
    runs.set(key, source);
    return source;
  };

  const update = (
    ref: TaskRunIdentity,
    patch: Partial<TaskRunSource>,
    status?: TaskRunSource['status'],
    expected?: { runtime: TaskRunSource['runtime']; leaseState?: 'live' | 'available' },
  ) =>
    Effect.gen(function* () {
      const current = runs.get(keyOf(ref));

      if (!current) {
        return yield* Effect.fail(missingTaskRunFailure(ref));
      }

      if (status && current.status !== status) return undefined;

      if (
        expected &&
        (current.runtime?.name !== expected.runtime?.name ||
          current.runtime?.runId !== expected.runtime?.runId ||
          current.runtime?.submissionPending !== expected.runtime?.submissionPending ||
          current.runtime?.executionLease?.token !== expected.runtime?.executionLease?.token ||
          current.runtime?.executionLease?.expiresAt !==
            expected.runtime?.executionLease?.expiresAt)
      )
        return undefined;

      if (expected?.leaseState) {
        const live = Date.parse(current.runtime?.executionLease?.expiresAt ?? '') > Date.now();
        if (live !== (expected.leaseState === 'live')) return undefined;
      }

      const next = {
        ...current,
        ...patch,
        taskId: current.taskId,
        runId: current.runId,
        input: patch.input === undefined ? current.input : patch.input,
        trigger: patch.trigger ?? current.trigger,
        subject: patch.subject === undefined ? current.subject : patch.subject,
        runtime: patch.runtime === undefined ? current.runtime : patch.runtime,
        progress: patch.progress ? { ...current.progress, ...patch.progress } : current.progress,
        updatedAt: patch.updatedAt ?? now(),
      } satisfies TaskRunSource;

      runs.set(keyOf(ref), next);
      return projectTaskSnapshot(next);
    });

  return {
    beginExecution: ref =>
      Effect.gen(function* () {
        const key = keyOf(ref);
        const source = runs.get(key);
        if (!source) return yield* Effect.fail(missingTaskRunFailure(ref));
        const executionOrdinal = (source.executionOrdinal ?? 0) + 1;
        runs.set(key, { ...source, executionOrdinal });
        return executionOrdinal;
      }),
    create: input =>
      Effect.suspend(() => {
        const key = keyOf(input);
        return runs.has(key)
          ? Effect.fail(duplicateTaskRunFailure(input))
          : Effect.succeed(insert(input, key));
      }),
    admit: (input, admission) =>
      Effect.suspend<{ source: TaskRunSource; created: boolean }, TaskFailure, never>(() => {
        const key = JSON.stringify([input.taskId, admission.policy, admission.key]);
        const previous = admissions.get(key);
        const source = previous && runs.get(keyOf(previous));
        if (
          source &&
          (source.status === 'queued' ||
            source.status === 'running' ||
            source.status === 'waiting' ||
            ((source.status === 'failed' || source.status === 'cancelled') &&
              source.error?.code === 'task_effect_outcome_ambiguous') ||
            (admission.policy === 'skip-if-completed' && source.status === 'completed'))
        ) {
          return Effect.succeed({ source, created: false });
        }
        const proposed = keyOf(input);
        if (runs.has(proposed)) return Effect.fail(duplicateTaskRunFailure(input));
        const created = insert(input, proposed);
        admissions.set(key, created);
        return Effect.succeed({ source: created, created: true });
      }),
    update: (ref, patch) => update(ref, patch).pipe(Effect.map(snapshot => snapshot!)),
    updateIfStatus: (ref, status, patch, expected) => update(ref, patch, status, expected),
    claimInteraction: (ref, interactionId, checkpoint) =>
      Effect.gen(function* () {
        const key = keyOf(ref);
        const current = runs.get(key);

        if (!current) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }
        if (current.status !== 'waiting' || current.checkpoint?.interaction?.id !== interactionId)
          return undefined;

        const next = {
          ...current,
          status: 'running',
          checkpoint,
          updatedAt: now(),
        } satisfies TaskRunSource;
        runs.set(key, next);
        return projectTaskSnapshot(next);
      }),
    claimEvent: (ref, waitId, checkpoint) =>
      Effect.gen(function* () {
        const key = keyOf(ref);
        const current = runs.get(key);

        if (!current) return yield* Effect.fail(missingTaskRunFailure(ref));
        if (current.status !== 'waiting' || current.checkpoint?.eventWait?.id !== waitId) {
          return undefined;
        }

        const next = {
          ...current,
          status: 'running',
          checkpoint,
          updatedAt: now(),
        } satisfies TaskRunSource;
        runs.set(key, next);
        return projectTaskSnapshot(next);
      }),
    cancelEvent: (ref, waitId, status, error) =>
      Effect.gen(function* () {
        const key = keyOf(ref);
        const current = runs.get(key);
        if (!current) return yield* Effect.fail(missingTaskRunFailure(ref));
        if (current.status !== 'waiting' || current.checkpoint?.eventWait?.id !== waitId) {
          return undefined;
        }
        const next = {
          ...current,
          status,
          completedAt: now(),
          checkpoint: undefined,
          error,
          updatedAt: now(),
        } satisfies TaskRunSource;
        runs.set(key, next);
        return projectTaskSnapshot(next);
      }),
    attachRuntimeRef: (ref, runtime) =>
      Effect.gen(function* () {
        const key = keyOf(ref);
        const current = runs.get(key);

        if (!current) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        const next = {
          ...current,
          runtime,
          updatedAt: now(),
        } satisfies TaskRunSource;

        runs.set(key, next);
        return projectTaskSnapshot(next);
      }),
    get: ref =>
      Effect.gen(function* () {
        const source = runs.get(keyOf(ref));

        if (!source) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        return projectTaskSnapshot(source);
      }),
    getSnapshot: ref =>
      Effect.gen(function* () {
        const source = runs.get(keyOf(ref));

        if (!source) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        return projectTaskSnapshot(source);
      }),
    loadSource: ref =>
      Effect.gen(function* () {
        const source = runs.get(keyOf(ref));

        if (!source) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        return source;
      }),
    listRecent: (limit = 20) =>
      Effect.sync(() =>
        Array.from(runs.values())
          .sort(compareByCreatedAtDescending)
          .slice(0, limit)
          .map(projectTaskRunListItem),
      ),
    listRecentForActor: (actor, limit = 20) =>
      Effect.sync(() =>
        Array.from(runs.values())
          .filter(source => matchesActor(source, actor))
          .sort(compareByCreatedAtDescending)
          .slice(0, limit)
          .map(projectTaskRunListItem),
      ),
    listBySubject: query =>
      Effect.sync(() => {
        const normalized = normalizeTaskRunsBySubjectQuery(query);
        const statuses = normalized.statuses ? new Set(normalized.statuses) : undefined;
        return Array.from(runs.values())
          .filter(
            source =>
              source.subject?.type === normalized.subject.type &&
              source.subject.id === normalized.subject.id &&
              (!statuses || statuses.has(source.status)),
          )
          .sort(compareByCreatedAtDescending)
          .slice(0, normalized.limit)
          .map(projectTaskRunListItem);
      }),
  };
};
