import 'server-only';

import {
  type TaskFailure,
  type TaskRunSource,
  type TaskStorage,
  type TaskSnapshot,
  type TaskStatus,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { getRun } from 'workflow/api';
import { getWorld } from 'workflow/runtime';

const now = () => new Date().toISOString();

const terminalStatuses = new Set<TaskStatus>(['completed', 'failed', 'cancelled']);
const genericRuntimeErrorCodes = new Set(['task_failed', 'task_runtime_failed']);

const isTerminalStatus = (status: TaskStatus) => terminalStatuses.has(status);

const canEnrichFailedRuntimeError = (source: Pick<TaskRunSource, 'status' | 'error'>) =>
  source.status === 'failed' &&
  (!source.error ||
    genericRuntimeErrorCodes.has(source.error.code) ||
    source.error.message === 'Task failed.' ||
    source.error.message === 'Task runtime reported the run failed.' ||
    source.error.message === 'Unknown error');

export const shouldAttemptTaskRunReconciliation = (
  source: Pick<TaskRunSource, 'status' | 'error' | 'runtime'>,
) =>
  source.runtime?.name === 'vercel-workflow' &&
  Boolean(source.runtime.runId) &&
  (!isTerminalStatus(source.status) || canEnrichFailedRuntimeError(source));

type RuntimeTaskSnapshot = {
  status: TaskStatus;
  completedAt?: string;
  progress?: NonNullable<TaskSnapshot['progress']>;
  result?: unknown;
  error?: NonNullable<TaskSnapshot['error']>;
};

type WorkflowRuntimeError = {
  message?: string;
  code?: string;
};

type WorkflowStepSnapshot = {
  status?: string;
  error?: WorkflowRuntimeError;
  updatedAt?: Date | string;
  completedAt?: Date | string;
};

export const mapVercelWorkflowStatus = (status: string): TaskStatus => {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status;
    default:
      return 'failed';
  }
};

const getResultMessage = (result: unknown) =>
  typeof result === 'object' &&
  result !== null &&
  'message' in result &&
  typeof (result as { message: unknown }).message === 'string'
    ? (result as { message: string }).message
    : undefined;

const isWorkflowRuntimeError = (value: unknown): value is WorkflowRuntimeError =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof (value as { message: unknown }).message === 'string';

const tryParseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const extractStructuredTaskFailure = (
  message: string,
): NonNullable<TaskSnapshot['error']> | null => {
  const direct = tryParseJsonObject(message);
  const firstJsonBrace = message.indexOf('{');
  const lastJsonBrace = message.lastIndexOf('}');
  const embedded =
    direct ??
    (firstJsonBrace >= 0 && lastJsonBrace > firstJsonBrace
      ? tryParseJsonObject(message.slice(firstJsonBrace, lastJsonBrace + 1))
      : null);
  const reason = embedded?.reason;
  const failureMessage = embedded?.message;

  if (typeof reason === 'string' && typeof failureMessage === 'string') {
    return {
      code: reason,
      message: failureMessage,
    };
  }

  return null;
};

const toTaskRuntimeError = (
  error: WorkflowRuntimeError | undefined,
): NonNullable<TaskSnapshot['error']> | undefined => {
  if (!error?.message) {
    return undefined;
  }

  return (
    extractStructuredTaskFailure(error.message) ?? {
      code: error.code ?? 'task_runtime_failed',
      message: error.message,
    }
  );
};

const toDateTime = (value: Date | string | undefined) => {
  if (!value) {
    return 0;
  }

  return value instanceof Date ? value.getTime() : new Date(value).getTime();
};

const readFailedWorkflowStepError = async (
  workflowRunId: string,
): Promise<NonNullable<TaskSnapshot['error']> | undefined> => {
  const steps = (await getWorld().steps.list({
    runId: workflowRunId,
    resolveData: 'none',
  })) as { data?: WorkflowStepSnapshot[] };
  const failedSteps = (steps.data ?? [])
    .filter(step => step.status === 'failed' && isWorkflowRuntimeError(step.error))
    .sort(
      (left, right) =>
        toDateTime(right.completedAt ?? right.updatedAt) -
        toDateTime(left.completedAt ?? left.updatedAt),
    );

  return toTaskRuntimeError(failedSteps[0]?.error);
};

const readVercelWorkflowSnapshot = async (workflowRunId: string): Promise<RuntimeTaskSnapshot> => {
  const run = getRun<unknown>(workflowRunId);
  const status = mapVercelWorkflowStatus(await run.status);
  const completedAt = await run.completedAt;

  if (status !== 'completed') {
    const error =
      status === 'failed'
        ? await readFailedWorkflowStepError(workflowRunId).catch(() => undefined)
        : undefined;

    return {
      status,
      ...(error ? { error } : {}),
      ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
    };
  }

  const result = await run.returnValue;
  const message = getResultMessage(result);

  return {
    status,
    result,
    ...(message ? { progress: { phase: 'completed', message } } : {}),
    ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
  };
};

const toRuntimeFailurePatch = (status: TaskStatus, completedAt: string) =>
  status === 'failed'
    ? {
        status,
        completedAt,
        error: {
          code: 'task_runtime_failed',
          message: 'Task runtime reported the run failed.',
        },
      }
    : {
        status,
        completedAt,
      };

const toRuntimeTerminalPatch = (
  runtime: RuntimeTaskSnapshot,
  completedAt: string,
): Partial<TaskRunSource> =>
  runtime.status === 'failed'
    ? {
        ...toRuntimeFailurePatch(runtime.status, completedAt),
        ...(runtime.error ? { error: runtime.error } : {}),
      }
    : {
        status: runtime.status,
        completedAt,
      };

export const reconcileTaskRunSource = (
  source: TaskRunSource,
  store: Pick<TaskStorage, 'update'>,
): Effect.Effect<TaskRunSource, TaskFailure> => {
  if (!shouldAttemptTaskRunReconciliation(source)) {
    return Effect.succeed(source);
  }

  const workflowRunId = source.runtime?.runId;

  if (!workflowRunId) {
    return Effect.succeed(source);
  }

  return Effect.gen(function* () {
    const runtime = yield* Effect.tryPromise({
      try: () => readVercelWorkflowSnapshot(workflowRunId),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    if (!runtime) {
      return source;
    }

    if (runtime.status === source.status) {
      if (runtime.status !== 'failed' || !runtime.error || !canEnrichFailedRuntimeError(source)) {
        return source;
      }

      const snapshot = yield* store.update(source, {
        error: runtime.error,
        updatedAt: source.updatedAt,
      });

      return {
        ...source,
        ...snapshot,
      };
    }

    const completedAt =
      runtime.completedAt ?? (isTerminalStatus(runtime.status) ? now() : source.completedAt);
    const snapshot = yield* store.update(
      source,
      runtime.status === 'failed'
        ? toRuntimeTerminalPatch(runtime, completedAt ?? now())
        : {
            status: runtime.status,
            ...(runtime.result !== undefined ? { result: runtime.result } : {}),
            ...(runtime.progress ? { progress: runtime.progress } : {}),
            ...(completedAt ? { completedAt } : {}),
          },
    );

    return {
      ...source,
      ...snapshot,
      ...(runtime.result !== undefined ? { result: runtime.result } : {}),
    };
  });
};

export const reconcileTaskSnapshot = (
  source: TaskRunSource,
  store: Pick<TaskStorage, 'update'>,
): Effect.Effect<TaskSnapshot, TaskFailure> =>
  Effect.map(reconcileTaskRunSource(source, store), reconciled => ({
    taskId: reconciled.taskId,
    runId: reconciled.runId,
    status: reconciled.status,
    subject: reconciled.subject,
    startedAt: reconciled.startedAt,
    updatedAt: reconciled.updatedAt,
    completedAt: reconciled.completedAt,
    progress: reconciled.progress,
    error: reconciled.error,
  }));
