import 'server-only';

import {
  createOperationFailure,
  type TaskFailure,
  type TaskRuntime,
  validateTaskInput,
} from '@ontahi/core/runtime/server';
import {
  taskInteractionAccessDeniedFailure,
  taskInteractionMismatchFailure,
  taskInteractionNotPendingFailure,
  validateTaskInteractionResponse,
} from '@ontahi/core/runtime/server/tasks';
import { cloneJson } from '@ontahi/core/value/json';
import { Effect } from 'effect';
import { resumeHook, start } from 'workflow/api';

import type { VercelWorkflowTaskRuntimeOptions } from './contracts.js';
import { vercelInteractionHookToken } from './interactions.js';
import { mapVercelWorkflowStatus, reconcileTaskSnapshot } from './reconciliation.js';

const now = () => new Date().toISOString();

const toTaskFailure = (reason: string, message: string, error?: unknown): TaskFailure =>
  createOperationFailure(reason, message, {
    cause: error instanceof Error ? error.message : error == null ? undefined : String(error),
  });

const defaultCreateRunId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

export const createVercelWorkflowTaskRuntime = ({
  taskRunStore,
  resolveWorkflow,
  createRunId = defaultCreateRunId,
}: VercelWorkflowTaskRuntimeOptions): TaskRuntime => ({
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
  respondToInteraction: (ref, response, context) =>
    Effect.gen(function* () {
      const source = yield* taskRunStore.loadSource(ref);
      if (
        source.trigger.actor?.kind !== context.actor.kind ||
        source.trigger.actor.id !== context.actor.id
      ) {
        return yield* Effect.fail(taskInteractionAccessDeniedFailure(ref));
      }
      const checkpoint = source.checkpoint;
      if (checkpoint?.response?.interactionId === response.interactionId) {
        return yield* taskRunStore.getSnapshot(ref);
      }
      if (!checkpoint?.interaction) {
        return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
      }
      if (checkpoint.interaction.id !== response.interactionId) {
        return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
      }
      yield* validateTaskInteractionResponse(ref, checkpoint.interaction, response);
      const nextCheckpoint = {
        version: 1 as const,
        state: checkpoint.state,
        response: cloneJson(response),
      };
      const snapshot = yield* taskRunStore.claimInteraction(
        ref,
        response.interactionId,
        nextCheckpoint,
      );
      if (!snapshot) return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
      yield* Effect.tryPromise({
        try: () =>
          resumeHook(vercelInteractionHookToken(ref, response.interactionId), cloneJson(response)),
        catch: error =>
          toTaskFailure(
            'task_interaction_resume_failed',
            'Failed to resume task interaction.',
            error,
          ),
      }).pipe(
        Effect.tapError(error => {
          const completedAt = now();
          return taskRunStore
            .update(ref, {
              status: 'failed',
              completedAt,
              updatedAt: completedAt,
              error: { code: error.reason, message: error.message },
            })
            .pipe(Effect.catchAll(() => Effect.void));
        }),
      );
      return snapshot;
    }),
});
