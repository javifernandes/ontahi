import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import type { TaskRunIdentity, TaskSnapshot, TaskStatus } from '../contracts.js';

import { defineRuntimeProtocolFamily } from './registry.js';

export type DurableOperationProtocolRequestV1 = {
  readonly version: 1;
  readonly kind: 'inspect';
  readonly run: TaskRunIdentity;
};

export type DurableOperationProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'access_denied'
  | 'inspection_unavailable'
  | 'invalid_response';

export type DurableOperationProtocolError = {
  readonly kind: 'protocol-error';
  readonly error: {
    readonly code: DurableOperationProtocolErrorCode;
    readonly message: string;
  };
};

export type DurableOperationSnapshotResponse<TResult = JsonValue> = {
  readonly version: 1;
  readonly kind: 'snapshot';
  readonly snapshot: TaskSnapshot<TResult>;
};

export type DurableOperationProtocolResponse<TResult = JsonValue> =
  | DurableOperationSnapshotResponse<TResult>
  | DurableOperationProtocolError;

export type DurableOperationProtocolRequestParseResult =
  | { readonly success: true; readonly request: DurableOperationProtocolRequestV1 }
  | { readonly success: false; readonly error: DurableOperationProtocolError };

export type DurableOperationProtocolResponseParseResult =
  | { readonly success: true; readonly response: DurableOperationProtocolResponse }
  | { readonly success: false; readonly error: DurableOperationProtocolError };

const requestKeys = new Set(['version', 'kind', 'run']);
const runKeys = new Set(['taskId', 'runId']);
const responseKeys = new Set(['version', 'kind', 'snapshot']);
const snapshotKeys = new Set([
  'taskId',
  'runId',
  'status',
  'subject',
  'createdAt',
  'startedAt',
  'updatedAt',
  'completedAt',
  'progress',
  'error',
  'result',
]);
const subjectKeys = new Set(['type', 'id']);
const progressKeys = new Set(['phase', 'message', 'percent']);
const taskErrorKeys = new Set(['code', 'message']);
const protocolErrorKeys = new Set(['kind', 'error']);
const protocolErrorDetailKeys = new Set(['code', 'message']);
const taskStatuses = new Set<TaskStatus>(['queued', 'running', 'completed', 'failed', 'cancelled']);
const protocolErrorCodes = new Set<DurableOperationProtocolErrorCode>([
  'invalid_request',
  'unsupported_version',
  'access_denied',
  'inspection_unavailable',
  'invalid_response',
]);

const hasOnlyKeys = (value: Record<string, unknown>, keys: ReadonlySet<string>) =>
  Object.keys(value).every(key => keys.has(key));

const isIdentitySegment = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 512;

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isTaskRunIdentity = (value: unknown): value is TaskRunIdentity =>
  isRecord(value) &&
  hasOnlyKeys(value, runKeys) &&
  isIdentitySegment(value.taskId) &&
  isIdentitySegment(value.runId);

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isOptionalTimestamp = (value: unknown): value is string | undefined =>
  value === undefined || isTimestamp(value);

export const durableOperationProtocolError = (
  code: DurableOperationProtocolErrorCode,
  message: string,
): DurableOperationProtocolError => ({
  kind: 'protocol-error',
  error: { code, message },
});

export const isDurableOperationProtocolError = (
  value: unknown,
): value is DurableOperationProtocolError =>
  isRecord(value) &&
  hasOnlyKeys(value, protocolErrorKeys) &&
  value.kind === 'protocol-error' &&
  isRecord(value.error) &&
  hasOnlyKeys(value.error, protocolErrorDetailKeys) &&
  typeof value.error.code === 'string' &&
  protocolErrorCodes.has(value.error.code as DurableOperationProtocolErrorCode) &&
  typeof value.error.message === 'string' &&
  isJsonValue(value);

const invalidRequest = (message: string): DurableOperationProtocolRequestParseResult => ({
  success: false,
  error: durableOperationProtocolError('invalid_request', message),
});

export const parseDurableOperationProtocolRequest = (
  value: unknown,
): DurableOperationProtocolRequestParseResult => {
  if (!isRecord(value)) {
    return invalidRequest('Durable Operation protocol request must be an object.');
  }
  if (value.version !== 1) {
    return {
      success: false,
      error: durableOperationProtocolError(
        'unsupported_version',
        `Unsupported Durable Operation protocol version: ${String(value.version)}.`,
      ),
    };
  }
  if (!hasOnlyKeys(value, requestKeys)) {
    return invalidRequest('Durable Operation protocol request contains unknown keys.');
  }
  if (value.kind !== 'inspect') {
    return invalidRequest('Durable Operation protocol request kind must be "inspect".');
  }
  if (!isTaskRunIdentity(value.run)) {
    return invalidRequest(
      'Durable Operation inspect run must contain only non-empty taskId and runId strings.',
    );
  }
  return {
    success: true,
    request: {
      version: 1,
      kind: 'inspect',
      run: { taskId: value.run.taskId, runId: value.run.runId },
    },
  };
};

export const toDurableOperationProtocolRequest = (
  run: TaskRunIdentity,
): DurableOperationProtocolRequestV1 => {
  const parsed = parseDurableOperationProtocolRequest({
    version: 1,
    kind: 'inspect',
    run: { taskId: run.taskId, runId: run.runId },
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  return parsed.request;
};

const parseSubject = (value: unknown): TaskSnapshot['subject'] | undefined => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, subjectKeys) ||
    !isIdentitySegment(value.type) ||
    !isIdentitySegment(value.id)
  ) {
    return undefined;
  }
  return { type: value.type, id: value.id };
};

const parseProgress = (value: unknown): TaskSnapshot['progress'] | undefined => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, progressKeys) ||
    !isOptionalString(value.phase) ||
    !isOptionalString(value.message) ||
    (value.percent !== undefined &&
      (typeof value.percent !== 'number' || !Number.isFinite(value.percent)))
  ) {
    return undefined;
  }
  return {
    ...(value.phase === undefined ? {} : { phase: value.phase }),
    ...(value.message === undefined ? {} : { message: value.message }),
    ...(value.percent === undefined ? {} : { percent: value.percent }),
  };
};

const parseTaskError = (value: unknown): TaskSnapshot['error'] | undefined => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, taskErrorKeys) ||
    !isIdentitySegment(value.code) ||
    typeof value.message !== 'string'
  ) {
    return undefined;
  }
  return { code: value.code, message: value.message };
};

type SnapshotParseResult =
  | { readonly success: true; readonly snapshot: TaskSnapshot<JsonValue> }
  | { readonly success: false };

const parseSnapshot = (value: unknown): SnapshotParseResult => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, snapshotKeys) ||
    !isIdentitySegment(value.taskId) ||
    !isIdentitySegment(value.runId) ||
    typeof value.status !== 'string' ||
    !taskStatuses.has(value.status as TaskStatus) ||
    !isOptionalTimestamp(value.createdAt) ||
    !isOptionalTimestamp(value.startedAt) ||
    !isTimestamp(value.updatedAt) ||
    !isOptionalTimestamp(value.completedAt) ||
    (value.result !== undefined && !isJsonValue(value.result))
  ) {
    return { success: false };
  }

  const subject = parseSubject(value.subject);
  const progress = parseProgress(value.progress);
  const error = parseTaskError(value.error);
  if (
    (value.subject !== undefined && subject === undefined) ||
    (value.progress !== undefined && progress === undefined) ||
    (value.error !== undefined && error === undefined)
  ) {
    return { success: false };
  }

  return {
    success: true,
    snapshot: {
      taskId: value.taskId,
      runId: value.runId,
      status: value.status as TaskStatus,
      ...(subject === undefined ? {} : { subject }),
      ...(value.createdAt === undefined ? {} : { createdAt: value.createdAt }),
      ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
      updatedAt: value.updatedAt,
      ...(value.completedAt === undefined ? {} : { completedAt: value.completedAt }),
      ...(progress === undefined ? {} : { progress }),
      ...(error === undefined ? {} : { error }),
      ...(value.result === undefined ? {} : { result: cloneJson(value.result) }),
    },
  };
};

const invalidResponse = (message: string): DurableOperationProtocolResponseParseResult => ({
  success: false,
  error: durableOperationProtocolError('invalid_response', message),
});

export const parseDurableOperationProtocolResponse = (
  value: unknown,
): DurableOperationProtocolResponseParseResult => {
  if (isDurableOperationProtocolError(value)) {
    return { success: true, response: cloneJson(value) };
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, responseKeys) ||
    value.version !== 1 ||
    value.kind !== 'snapshot'
  ) {
    return invalidResponse('Durable Operation protocol response is invalid.');
  }

  const snapshot = parseSnapshot(value.snapshot);
  if (!snapshot.success) {
    return invalidResponse('Durable Operation snapshot response is invalid.');
  }

  return {
    success: true,
    response: {
      version: 1,
      kind: 'snapshot',
      snapshot: snapshot.snapshot,
    },
  };
};

export const toDurableOperationSnapshotResponse = <TResult>(
  snapshot: TaskSnapshot<TResult>,
): DurableOperationSnapshotResponse<TResult> => {
  const parsed = parseSnapshot(snapshot);
  if (!parsed.success) {
    throw new TypeError('Durable Operation snapshot response is invalid.');
  }
  return {
    version: 1,
    kind: 'snapshot',
    snapshot: parsed.snapshot as TaskSnapshot<TResult>,
  };
};

export const durableOperationRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'durable.operation',
  DurableOperationProtocolRequestV1,
  DurableOperationProtocolError
>({
  name: 'durable.operation',
  parseRequest: parseDurableOperationProtocolRequest,
});
