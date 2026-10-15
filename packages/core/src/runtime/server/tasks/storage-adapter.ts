import { Effect } from 'effect';

import { projectTaskRunListItem, projectTaskSnapshot } from './memory-store.js';
import type {
  TaskActor,
  TaskExecutionCheckpoint,
  TaskFailure,
  TaskRunCreateInput,
  TaskRunIdentity,
  TaskRunSource,
  TaskRuntimeRef,
  TaskSnapshot,
  TaskStorage,
} from './types.js';

export type TaskStorageAdapterOperations = {
  create(input: TaskRunCreateInput): Promise<TaskRunSource>;
  update(ref: TaskRunIdentity, patch: Partial<TaskRunSource>): Promise<TaskRunSource>;
  claim(
    ref: TaskRunIdentity,
    kind: 'interaction' | 'eventWait',
    waitId: string,
    checkpoint: TaskExecutionCheckpoint,
  ): Promise<TaskRunSource | undefined>;
  cancelEvent(
    ref: TaskRunIdentity,
    waitId: string,
    status: 'cancelled' | 'failed',
    error?: NonNullable<TaskSnapshot['error']>,
  ): Promise<TaskRunSource | undefined>;
  load(ref: TaskRunIdentity): Promise<TaskRunSource>;
  listRecent(limit: number): Promise<TaskRunSource[]>;
  listRecentForActor(actor: TaskActor, limit: number): Promise<TaskRunSource[]>;
};

const operationFailure = (message: string, cause: unknown): TaskFailure => {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'reason' in cause &&
    typeof (cause as { reason: unknown }).reason === 'string'
  ) {
    return cause as TaskFailure;
  }
  return {
    reason: 'task_run_store_failed',
    message,
    cause: cause instanceof Error ? cause.message : String(cause),
  };
};

/** Builds the provider-neutral Effect facade over promise-based Task persistence operations. */
export const createTaskStorageAdapter = (operations: TaskStorageAdapterOperations): TaskStorage => {
  const attempt = <T>(message: string, work: () => Promise<T>) =>
    Effect.tryPromise({ try: work, catch: cause => operationFailure(message, cause) });
  const snapshot = (source: TaskRunSource | undefined) =>
    source === undefined ? undefined : projectTaskSnapshot(source);

  return {
    create: input => attempt('Failed to create task run.', () => operations.create(input)),
    update: (ref, patch) =>
      attempt('Failed to update task run.', async () =>
        projectTaskSnapshot(await operations.update(ref, patch)),
      ),
    claimInteraction: (ref, interactionId, checkpoint) =>
      attempt('Failed to claim task interaction.', async () =>
        snapshot(await operations.claim(ref, 'interaction', interactionId, checkpoint)),
      ),
    claimEvent: (ref, waitId, checkpoint) =>
      attempt('Failed to claim task Event wait.', async () =>
        snapshot(await operations.claim(ref, 'eventWait', waitId, checkpoint)),
      ),
    cancelEvent: (ref, waitId, status, error) =>
      attempt('Failed to cancel task Event wait.', async () =>
        snapshot(await operations.cancelEvent(ref, waitId, status, error)),
      ),
    attachRuntimeRef: (ref, runtime: TaskRuntimeRef) =>
      attempt('Failed to attach task runtime.', async () =>
        projectTaskSnapshot(await operations.update(ref, { runtime })),
      ),
    get: ref =>
      attempt('Failed to get task run.', async () =>
        projectTaskSnapshot(await operations.load(ref)),
      ),
    getSnapshot: ref =>
      attempt('Failed to get task run snapshot.', async () =>
        projectTaskSnapshot(await operations.load(ref)),
      ),
    loadSource: ref => attempt('Failed to load task run.', () => operations.load(ref)),
    listRecent: (limit = 20) =>
      attempt('Failed to list task runs.', async () =>
        (await operations.listRecent(limit)).map(projectTaskRunListItem),
      ),
    listRecentForActor: (actor, limit = 20) =>
      attempt('Failed to list task runs for actor.', async () =>
        (await operations.listRecentForActor(actor, limit)).map(projectTaskRunListItem),
      ),
  };
};

/** Applies Task patch semantics before an adapter serializes the resulting source. */
export const applyTaskRunSourcePatch = (
  current: TaskRunSource,
  patch: Partial<TaskRunSource>,
  updatedAt: string,
): TaskRunSource => ({
  ...current,
  status: patch.status ?? current.status,
  input: patch.input === undefined ? current.input : patch.input,
  trigger: patch.trigger ?? current.trigger,
  subject: patch.subject === undefined ? current.subject : patch.subject,
  runtime: patch.runtime === undefined ? current.runtime : patch.runtime,
  progress: patch.progress ? { ...current.progress, ...patch.progress } : current.progress,
  checkpoint: 'checkpoint' in patch ? patch.checkpoint : current.checkpoint,
  result: patch.result === undefined ? current.result : patch.result,
  executionMetadata:
    patch.executionMetadata === undefined ? current.executionMetadata : patch.executionMetadata,
  error: patch.error === undefined ? current.error : patch.error,
  startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
  updatedAt,
  completedAt: patch.completedAt === undefined ? current.completedAt : patch.completedAt,
});
