import { isRecord } from '../value/object.js';

export type OperationValidationIssue = {
  path?: string;
  message: string;
  code?: string;
};

export type OperationSuccess<TOutput = unknown> = {
  ok: true;
  kind: 'success';
  value: TOutput;
};

export type OperationInputInvalid = {
  ok: false;
  kind: 'input_invalid';
  executed: false;
  message: string;
  issues: OperationValidationIssue[];
};

export type OperationRejected = {
  ok: false;
  kind: 'rejected';
  executed: false;
  reason: string;
  message: string;
  details?: Record<string, unknown>;
};

export type OperationFailed<TFailure = unknown> = {
  ok: false;
  kind: 'failed';
  executed: true;
  failure: TFailure;
  message: string;
};

export type OperationErrored = {
  ok: false;
  kind: 'errored';
  executed: 'unknown';
  message: string;
  errorType?: string;
};

export type OperationInvocationResult<TOutput = unknown, TFailure = unknown> =
  | OperationSuccess<TOutput>
  | OperationInputInvalid
  | OperationRejected
  | OperationFailed<TFailure>
  | OperationErrored;

const omitSuccess = (value: Record<string, unknown>) => {
  const { success: _success, ...rest } = value;

  return rest;
};

export const readOperationSuccessValue = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return result;
  }

  if (result.success !== true) {
    return result;
  }

  if ('data' in result) {
    return result.data;
  }

  const payload = omitSuccess(result);

  return Object.keys(payload).length > 0 ? payload : undefined;
};

export const operationInputInvalid = (
  message: string,
  issues: OperationValidationIssue[],
): OperationInputInvalid => ({
  ok: false,
  kind: 'input_invalid',
  executed: false,
  message,
  issues,
});

export const toOperationValidationIssues = (error: unknown): OperationValidationIssue[] => {
  if (!isRecord(error) || !Array.isArray(error.issues)) {
    return [{ message: 'Input does not match the operation schema.' }];
  }

  return error.issues.map(issue => {
    if (!isRecord(issue)) {
      return { message: 'Input does not match the operation schema.' };
    }

    const path = Array.isArray(issue.path) ? issue.path.map(String).join('.') : undefined;

    return {
      ...(path ? { path } : {}),
      message: typeof issue.message === 'string' ? issue.message : 'Invalid input.',
      ...(typeof issue.code === 'string' ? { code: issue.code } : {}),
    };
  });
};

export const operationRejected = (
  reason: string,
  message: string,
  details?: Record<string, unknown>,
): OperationRejected => ({
  ok: false,
  kind: 'rejected',
  executed: false,
  reason,
  message,
  ...(details ? { details } : {}),
});

export const toOperationInvocationResult = <TOutput = unknown, TFailure = unknown>(
  result: unknown,
): OperationInvocationResult<TOutput, TFailure> => {
  if (!isRecord(result) || typeof result.success !== 'boolean') {
    return {
      ok: true,
      kind: 'success',
      value: result as TOutput,
    };
  }

  if (result.success) {
    return {
      ok: true,
      kind: 'success',
      value: readOperationSuccessValue(result) as TOutput,
    };
  }

  const message =
    typeof result.message === 'string'
      ? result.message
      : typeof result.error === 'string'
        ? result.error
        : 'Operation failed.';

  return {
    ok: false,
    kind: 'failed',
    executed: true,
    message,
    failure: result as TFailure,
  };
};

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskSubject = {
  type: string;
  id: string;
};

export type TaskActor = {
  kind: 'user' | 'integration' | 'service' | 'system';
  id?: string;
};

export type TaskTrigger = {
  cause: 'user_request' | 'schedule' | 'external_event' | 'internal_task' | 'system';
  actor?: TaskActor;
  ingress?: {
    kind: 'server_action' | 'http' | 'websocket' | 'cron' | 'queue' | 'workflow' | 'cli';
    requestId?: string;
    deliveryId?: string;
    connectionId?: string;
    scheduleId?: string;
    parentRunId?: string;
  };
  source?: {
    provider?: string;
    event?: string;
  };
};

export type TaskRuntimeRef = {
  name: string;
  runId?: string;
};

export type TaskRunRef = {
  taskId: string;
  runId: string;
  status: TaskStatus;
  subject?: TaskSubject;
};

export type TaskRunIdentity = Pick<TaskRunRef, 'taskId' | 'runId'>;

export type TaskSnapshot<TResult = unknown> = {
  taskId: string;
  runId: string;
  status: TaskStatus;
  subject?: TaskSubject;
  createdAt?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  progress?: {
    phase?: string;
    message?: string;
    percent?: number;
  };
  error?: {
    code: string;
    message: string;
  };
  result?: TResult;
};

export type TaskRunSource = TaskSnapshot & {
  input: unknown;
  trigger: TaskTrigger;
  runtime?: TaskRuntimeRef;
  result?: unknown;
};

export type TaskRunListItem = TaskSnapshot & {
  trigger: TaskTrigger;
  runtime?: TaskRuntimeRef;
};
