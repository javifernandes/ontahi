import { Effect } from 'effect';

import { duplicateTaskRunFailure, missingTaskRunFailure } from './failures.js';
import { normalizeTaskTrigger, taskTriggerActorMatches } from './triggers.js';
import type {
  TaskActor,
  TaskRunListItem,
  TaskRunRef,
  TaskRunSource,
  TaskRunStore,
  TaskSnapshot,
} from './types.js';

const now = () => new Date().toISOString();

const toSnapshot = (source: TaskRunSource): TaskSnapshot => ({
  taskId: source.taskId,
  runId: source.runId,
  status: source.status,
  subject: source.subject,
  createdAt: source.createdAt,
  startedAt: source.startedAt,
  updatedAt: source.updatedAt,
  completedAt: source.completedAt,
  progress: source.progress,
  error: source.error,
});

const toListItem = (source: TaskRunSource): TaskRunListItem => ({
  ...toSnapshot(source),
  trigger: source.trigger,
  runtime: source.runtime,
});

const matchesActor = (source: TaskRunSource, actor: TaskActor) =>
  taskTriggerActorMatches(source.trigger, actor);

const getCreatedSortKey = (source: TaskRunSource) => source.createdAt ?? source.updatedAt;

const compareByCreatedAtDescending = (left: TaskRunSource, right: TaskRunSource) =>
  getCreatedSortKey(right).localeCompare(getCreatedSortKey(left));

export const createInMemoryTaskRunStore = (): TaskRunStore => {
  const runs = new Map<string, TaskRunSource>();
  const keyOf = (ref: Pick<TaskRunRef, 'taskId' | 'runId'>) => `${ref.taskId}:${ref.runId}`;

  return {
    create: input =>
      Effect.gen(function* () {
        const key = keyOf(input);

        if (runs.has(key)) {
          return yield* Effect.fail(duplicateTaskRunFailure(input));
        }

        const createdAt = now();
        const source = {
          taskId: input.taskId,
          runId: input.runId,
          status: 'queued',
          input: input.input,
          trigger: normalizeTaskTrigger(input.trigger),
          subject: input.subject,
          runtime: input.runtime,
          createdAt,
          updatedAt: createdAt,
        } satisfies TaskRunSource;

        runs.set(key, source);
        return source;
      }),
    update: (ref, patch) =>
      Effect.gen(function* () {
        const current = runs.get(keyOf(ref));

        if (!current) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
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
        return toSnapshot(next);
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
        return toSnapshot(next);
      }),
    get: ref =>
      Effect.gen(function* () {
        const source = runs.get(keyOf(ref));

        if (!source) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        return toSnapshot(source);
      }),
    getSnapshot: ref =>
      Effect.gen(function* () {
        const source = runs.get(keyOf(ref));

        if (!source) {
          return yield* Effect.fail(missingTaskRunFailure(ref));
        }

        return toSnapshot(source);
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
          .map(toListItem),
      ),
    listRecentForActor: (actor, limit = 20) =>
      Effect.sync(() =>
        Array.from(runs.values())
          .filter(source => matchesActor(source, actor))
          .sort(compareByCreatedAtDescending)
          .slice(0, limit)
          .map(toListItem),
      ),
  };
};
