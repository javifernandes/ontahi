import 'server-only';

import {
  createOperationFailure,
  type TaskFailure,
  type TaskRuntimeAdapter,
  validateTaskInput,
} from '@ontahi/core/runtime/server';
import { Effect } from 'effect';
import { start } from 'workflow/api';

import type { VercelWorkflowTaskRuntimeAdapterOptions } from './contracts.js';
import { mapVercelWorkflowStatus, reconcileTaskSnapshot } from './reconciliation.js';

const now = () => new Date().toISOString();

const toTaskFailure = (reason: string, message: string, error?: unknown): TaskFailure =>
  createOperationFailure(reason, message, {
    cause: error instanceof Error ? error.message : error == null ? undefined : String(error),
  });

const defaultCreateRunId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

export const createVercelWorkflowTaskRuntimeAdapter = ({
  taskRunStore,
  resolveWorkflow,
  createRunId = defaultCreateRunId,
}: VercelWorkflowTaskRuntimeAdapterOptions): TaskRuntimeAdapter => ({
  start: (task, input, options) =>
    Effect.gen(function* () {
      const parsedInput = yield* validateTaskInput(task, input);
      const runId = options?.runId ?? createRunId();
      const source = yield* taskRunStore.create({
        taskId: task.id,
        runId,
        input: parsedInput,
        trigger: options?.trigger,
        subject: options?.subject,
      });
      const workflowRun = yield* Effect.tryPromise({
        try: async () => {
          const workflow = resolveWorkflow(task.id);

          if (!workflow) {
            throw new Error(`Task "${task.id}" does not have a Vercel workflow.`);
          }

          return start(workflow, [
            {
              taskId: task.id,
              runId,
            },
          ]);
        },
        catch: error => toTaskFailure('task_start_failed', 'Failed to start task.', error),
      }).pipe(
        Effect.tapError(error =>
          taskRunStore.update(source, {
            status: 'failed',
            completedAt: now(),
            error: {
              code: error.reason,
              message: error.message,
            },
          }),
        ),
      );
      const status = mapVercelWorkflowStatus(yield* Effect.promise(() => workflowRun.status));
      const snapshot = yield* taskRunStore.attachRuntimeRef(source, {
        name: 'vercel-workflow',
        runId: workflowRun.runId,
      });

      if (status !== snapshot.status) {
        yield* taskRunStore.update(source, { status });
      }

      return {
        taskId: task.id,
        runId,
        status,
        ...(source.subject ? { subject: source.subject } : {}),
      };
    }).pipe(
      Effect.mapError(error =>
        'reason' in error && 'message' in error
          ? error
          : toTaskFailure('task_start_failed', 'Failed to start task.', error),
      ),
    ),
  getSnapshot: ref =>
    Effect.gen(function* () {
      const source = yield* taskRunStore.loadSource(ref);
      return yield* reconcileTaskSnapshot(source, taskRunStore);
    }),
  listRecent: limit => taskRunStore.listRecent(limit),
});
