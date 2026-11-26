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
import { getRun, resumeHook, start } from 'workflow/api';

import type { VercelTaskWorkflowInput, VercelWorkflowTaskRuntimeOptions } from './contracts.js';
import { vercelInteractionHookToken } from './interactions.js';
import { isActiveVercelTask, updateVercelTask } from './lifecycle.js';
import { mapVercelWorkflowStatus, reconcileTaskSnapshot } from './reconciliation.js';

const now = () => new Date().toISOString();

const toTaskFailure = (reason: string, message: string, error?: unknown): TaskFailure =>
  createOperationFailure(reason, message, {
    cause: error instanceof Error ? error.message : error == null ? undefined : String(error),
  });

const cancelWorkflow = (runId: string) =>
  Effect.tryPromise({
    try: async () => {
      const run = getRun(runId);
      if (isActiveVercelTask({ status: mapVercelWorkflowStatus(await run.status) })) {
        await run.cancel();
      }
    },
    catch: error =>
      toTaskFailure(
        'task_provider_cancellation_failed',
        'Vercel Workflow cancellation could not be confirmed.',
        error,
      ),
  });

const defaultCreateRunId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

export const createVercelWorkflowTaskRuntime = ({
  taskRunStore,
  resolveWorkflow,
  createRunId = defaultCreateRunId,
}: VercelWorkflowTaskRuntimeOptions): TaskRuntime => ({
  supportsAtomicAdmission: taskRunStore.admit !== undefined,
  ...(taskRunStore.observeSnapshots && {
    observe: (ref: VercelTaskWorkflowInput) => taskRunStore.observeSnapshots!(ref),
  }),
  ...(taskRunStore.updateIfStatus && {
    cancel: (ref: VercelTaskWorkflowInput) =>
      Effect.gen(function* () {
        const snapshot = yield* updateVercelTask(
          taskRunStore,
          ref,
          source =>
            source.runtime?.name === 'vercel-workflow' &&
            isActiveVercelTask(source) &&
            !source.checkpoint?.eventWait,
          source => ({
            status: 'cancelled',
            completedAt: now(),
            ...(source.status !== 'queued' || source.runtime?.runId
              ? {
                  error: {
                    code: 'task_effect_outcome_ambiguous',
                    message: 'Workflow cancelled before confirming its external effects.',
                  },
                }
              : {}),
          }),
        );
        const source = yield* taskRunStore.loadSource(ref);
        if (source.status === 'waiting' && source.checkpoint?.eventWait) {
          return yield* Effect.fail(
            toTaskFailure(
              'task_event_wait_cancel_required',
              'Use Event-wait cancellation while this Task is waiting for an Event.',
            ),
          );
        }
        if (
          source.status === 'cancelled' &&
          source.runtime?.name === 'vercel-workflow' &&
          source.runtime.runId
        ) {
          yield* cancelWorkflow(source.runtime.runId);
        }
        return snapshot;
      }),
  }),
  start: (task, input, options) =>
    Effect.gen(function* () {
      const parsedInput = yield* validateTaskInput(task, input);
      const runId = options?.runId ?? createRunId();
      const createInput = {
        taskId: task.id,
        runId,
        input: parsedInput,
        trigger: options?.trigger,
        subject: options?.subject,
        ...(taskRunStore.updateIfStatus || taskRunStore.observeSnapshots
          ? { runtime: { name: 'vercel-workflow' } }
          : {}),
      };
      const admission = options?.admission;
      if (admission && !taskRunStore.admit) {
        return yield* Effect.fail(
          toTaskFailure(
            'task_admission_unavailable',
            'Task storage does not support atomic admission.',
          ),
        );
      }
      const stored = admission
        ? yield* taskRunStore.admit!(createInput, admission)
        : { created: true, source: yield* taskRunStore.create(createInput) };
      const { source } = stored;
      if (!stored.created) {
        return {
          taskId: source.taskId,
          runId: source.runId,
          status: source.status,
          ...(source.subject ? { subject: source.subject } : {}),
          admission:
            source.error?.code === 'task_effect_outcome_ambiguous'
              ? ('reconciliation-required' as const)
              : source.status === 'completed'
                ? ('already-completed' as const)
                : ('reused' as const),
        };
      }
      let submitted = false;
      const workflowRun = yield* Effect.tryPromise({
        try: async () => {
          const workflow = resolveWorkflow(task.id);

          if (!workflow) {
            throw new Error(`Task "${task.id}" does not have a Vercel workflow.`);
          }

          submitted = true;
          return start(workflow, [
            {
              taskId: task.id,
              runId,
            },
          ]);
        },
        catch: error =>
          admission && submitted
            ? toTaskFailure(
                'task_effect_outcome_ambiguous',
                'Vercel Workflow start could not be confirmed.',
                error,
              )
            : toTaskFailure('task_start_failed', 'Failed to start task.', error),
      }).pipe(
        Effect.tapError(error => {
          const patch = {
            status: 'failed' as const,
            completedAt: now(),
            error: { code: error.reason, message: error.message },
          };
          return taskRunStore.updateIfStatus
            ? updateVercelTask(
                taskRunStore,
                source,
                candidate => candidate.status === 'queued',
                () => patch,
              )
            : taskRunStore.update(source, patch);
        }),
      );
      const runtime = { name: 'vercel-workflow', runId: workflowRun.runId };
      const snapshot = taskRunStore.updateIfStatus
        ? (yield* updateVercelTask(
            taskRunStore,
            source,
            () => true,
            () => ({ runtime }),
          ))!
        : yield* taskRunStore.attachRuntimeRef(source, runtime);
      if (snapshot.status === 'cancelled') yield* cancelWorkflow(workflowRun.runId);
      const status =
        snapshot.status === 'queued'
          ? mapVercelWorkflowStatus(yield* Effect.promise(() => workflowRun.status))
          : snapshot.status;

      if (snapshot.status === 'queued' && status !== 'queued') {
        if (taskRunStore.updateIfStatus) {
          yield* updateVercelTask(
            taskRunStore,
            source,
            candidate => candidate.status === 'queued',
            () => ({ status }),
          );
        } else yield* taskRunStore.update(source, { status });
      }

      return {
        taskId: task.id,
        runId,
        status: snapshot.status === 'queued' ? status : snapshot.status,
        ...(admission ? { admission: 'created' as const } : {}),
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
  cancelEventWait: ref =>
    Effect.gen(function* () {
      const source = yield* taskRunStore.loadSource(ref);
      const wait = source.checkpoint?.eventWait;
      if (!wait || source.status !== 'waiting') {
        return yield* Effect.fail({
          reason: 'task_event_wait_not_pending',
          message: 'Task run has no pending Event wait.',
          ...ref,
        } satisfies TaskFailure);
      }
      const snapshot = yield* taskRunStore.cancelEvent(ref, wait.id, 'cancelled');
      if (!snapshot) {
        return yield* Effect.fail({
          reason: 'task_event_wait_not_pending',
          message: 'Task run has no pending Event wait.',
          ...ref,
        } satisfies TaskFailure);
      }
      return snapshot;
    }),
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
          const patch = {
            status: 'failed' as const,
            completedAt,
            updatedAt: completedAt,
            error: { code: error.reason, message: error.message },
          };
          return (
            taskRunStore.updateIfStatus
              ? updateVercelTask(taskRunStore, ref, isActiveVercelTask, () => patch)
              : taskRunStore.update(ref, patch)
          ).pipe(Effect.catchAll(() => Effect.void));
        }),
      );
      return snapshot;
    }),
});
