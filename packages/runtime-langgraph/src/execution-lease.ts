import { randomUUID } from 'node:crypto';

import type { TaskRuntimeRef } from '@ontahi/core/runtime/server';
import type {
  TaskFailure,
  TaskRunIdentity,
  TaskRunSource,
  TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

export const executionLeaseLost = (): TaskFailure => ({
  reason: 'task_worker_lease_lost',
  message: 'The LangGraph worker no longer owns this execution.',
});

const expiresAt = (runtime?: TaskRuntimeRef) =>
  Date.parse(runtime?.executionLease?.expiresAt ?? '');

export const createExecutionLease = (
  storage: TaskStorage,
  duration: number,
  threadIdOf: (ref: TaskRunIdentity) => string,
) => {
  const claim = (ref: TaskRunIdentity) =>
    Effect.gen(function* () {
      for (let attempt = 0; attempt < 8; attempt++) {
        const source = yield* storage.loadSource(ref);
        if (source.status !== 'running' || !source.checkpoint || source.checkpoint.interaction) {
          return undefined;
        }
        if (!storage.updateIfStatus) return source;
        if (expiresAt(source.runtime) > Date.now()) return undefined;
        const token = randomUUID();
        const threadId = source.runtime?.runId ?? threadIdOf(ref);
        const runtime: TaskRuntimeRef = {
          name: 'langgraph',
          runId: source.runtime?.executionLease ? `${threadIdOf(ref)}:${token}` : threadId,
          executionLease: { token, expiresAt: new Date(Date.now() + duration).toISOString() },
        };
        const claimed = yield* storage.updateIfStatus(
          ref,
          'running',
          { runtime, updatedAt: source.updatedAt },
          { runtime: source.runtime, leaseState: 'available' },
        );
        if (claimed) return { ...source, ...claimed, runtime };
      }
    });

  const owns = (expected: TaskRuntimeRef | undefined, source: TaskRunSource) =>
    !storage.updateIfStatus ||
    (expected?.executionLease !== undefined &&
      source.runtime?.executionLease?.token === expected.executionLease.token &&
      expiresAt(source.runtime) > Date.now());

  const update = (
    ref: TaskRunIdentity,
    runtime: TaskRuntimeRef | undefined,
    patch: Partial<TaskRunSource> | ((source: TaskRunSource) => Partial<TaskRunSource>),
    release = false,
  ) =>
    Effect.gen(function* () {
      if (!storage.updateIfStatus) {
        return release || typeof patch === 'function'
          ? undefined
          : yield* storage.update(ref, patch);
      }
      // A late write must fail closed even if the storage clock is ahead of this worker.
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = yield* storage.loadSource(ref);
        if (
          !owns(runtime, current) ||
          (!release && current.status !== 'running' && current.status !== 'waiting')
        )
          return undefined;
        const changes =
          typeof patch === 'function'
            ? patch(current)
            : release
              ? { ...patch, updatedAt: current.updatedAt }
              : patch;
        const snapshot = yield* storage.updateIfStatus(ref, current.status, changes, {
          runtime: current.runtime,
          leaseState: 'live',
        });
        if (snapshot) return snapshot;
      }
    });

  const renew = (ref: TaskRunIdentity, runtime: TaskRuntimeRef) =>
    update(ref, runtime, source => ({
      runtime: {
        ...source.runtime!,
        executionLease: {
          token: runtime.executionLease!.token,
          expiresAt: new Date(Date.now() + duration).toISOString(),
        },
      },
      updatedAt: source.updatedAt,
    }));

  return { claim, owns, renew, update };
};
