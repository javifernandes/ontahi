import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import type {
  TaskInteractionResponse,
  TaskPendingInteraction,
  TaskRunIdentity,
  TaskSnapshot,
  TaskStatus,
} from '../contracts.js';

import { defineRuntimeProtocolFamily } from './registry.js';

export type DurableOperationInspectRequestV1 = {
  readonly version: 1;
  readonly kind: 'inspect';
  readonly run: TaskRunIdentity;
};

export type DurableOperationRespondRequestV1 = {
  readonly version: 1;
  readonly kind: 'respond';
  readonly run: TaskRunIdentity;
  readonly response: TaskInteractionResponse;
};

export type DurableOperationProtocolRequestV1 =
  | DurableOperationInspectRequestV1
  | DurableOperationRespondRequestV1;

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

const inspectRequestKeys = new Set(['version', 'kind', 'run']);
const respondRequestKeys = new Set(['version', 'kind', 'run', 'response']);
const runKeys = new Set(['taskId', 'runId']);
const choiceInteractionResponseKeys = new Set(['interactionId', 'optionId']);
const inputInteractionResponseKeys = new Set(['interactionId', 'value']);
const approvalInteractionResponseKeys = new Set(['interactionId', 'decision', 'reason']);
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
  'interaction',
  'error',
  'result',
]);
const subjectKeys = new Set(['type', 'id']);
const progressKeys = new Set(['phase', 'message', 'percent']);
const choiceInteractionKeys = new Set(['id', 'kind', 'prompt', 'options', 'createdAt']);
const inputInteractionKeys = new Set(['id', 'kind', 'prompt', 'input', 'createdAt']);
const inputDescriptorKeys = new Set(['type', 'values', 'nullable']);
const approvalInteractionKeys = new Set(['id', 'kind', 'prompt', 'proposal', 'createdAt']);
const interactionOptionKeys = new Set(['id', 'label']);
const approvalProposalKeys = new Set(['id', 'summary', 'requests']);
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

const isTaskInputValue = (value: unknown) =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  typeof value === 'boolean' ||
  value === null;

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isTaskRunIdentity = (value: unknown): value is TaskRunIdentity =>
  isRecord(value) &&
  hasOnlyKeys(value, runKeys) &&
  isIdentitySegment(value.taskId) &&
  isIdentitySegment(value.runId);

const isTaskInteractionResponse = (value: unknown): value is TaskInteractionResponse =>
  isRecord(value) &&
  isIdentitySegment(value.interactionId) &&
  ((hasOnlyKeys(value, choiceInteractionResponseKeys) && isIdentitySegment(value.optionId)) ||
    (hasOnlyKeys(value, inputInteractionResponseKeys) && isTaskInputValue(value.value)) ||
    (hasOnlyKeys(value, approvalInteractionResponseKeys) &&
      (value.decision === 'approve' || value.decision === 'reject') &&
      isOptionalString(value.reason)));

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
  if (!isTaskRunIdentity(value.run)) {
    return invalidRequest(
      'Durable Operation run must contain only non-empty taskId and runId strings.',
    );
  }

  const run = { taskId: value.run.taskId, runId: value.run.runId };
  if (value.kind === 'inspect') {
    if (!hasOnlyKeys(value, inspectRequestKeys)) {
      return invalidRequest('Durable Operation inspect request contains unknown keys.');
    }
    return { success: true, request: { version: 1, kind: 'inspect', run } };
  }

  if (value.kind === 'respond') {
    if (!hasOnlyKeys(value, respondRequestKeys)) {
      return invalidRequest('Durable Operation respond request contains unknown keys.');
    }
    if (!isTaskInteractionResponse(value.response)) {
      return invalidRequest(
        'Durable Operation response must contain a valid choice, input, or approval response.',
      );
    }
    return {
      success: true,
      request: {
        version: 1,
        kind: 'respond',
        run,
        response:
          'optionId' in value.response
            ? {
                interactionId: value.response.interactionId,
                optionId: value.response.optionId,
              }
            : 'value' in value.response
              ? {
                  interactionId: value.response.interactionId,
                  value: value.response.value,
                }
              : {
                  interactionId: value.response.interactionId,
                  decision: value.response.decision,
                  ...(value.response.reason === undefined ? {} : { reason: value.response.reason }),
                },
      },
    };
  }

  return invalidRequest('Durable Operation protocol request kind must be "inspect" or "respond".');
};

export const toDurableOperationProtocolRequest = (
  run: TaskRunIdentity,
): DurableOperationInspectRequestV1 => {
  const parsed = parseDurableOperationProtocolRequest({
    version: 1,
    kind: 'inspect',
    run: { taskId: run.taskId, runId: run.runId },
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  if (parsed.request.kind !== 'inspect') throw new TypeError('Expected an inspect request.');
  return parsed.request;
};

export const toDurableOperationInteractionResponseRequest = (
  run: TaskRunIdentity,
  response: TaskInteractionResponse,
): DurableOperationRespondRequestV1 => {
  const parsed = parseDurableOperationProtocolRequest({
    version: 1,
    kind: 'respond',
    run: { taskId: run.taskId, runId: run.runId },
    response,
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  if (parsed.request.kind !== 'respond') throw new TypeError('Expected a respond request.');
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

export const parseTaskPendingInteraction = (value: unknown): TaskPendingInteraction | undefined => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !isIdentitySegment(value.id) ||
    typeof value.prompt !== 'string' ||
    !isTimestamp(value.createdAt)
  ) {
    return undefined;
  }

  if (value.kind === 'approval') {
    if (
      !hasOnlyKeys(value, approvalInteractionKeys) ||
      !isRecord(value.proposal) ||
      !hasOnlyKeys(value.proposal, approvalProposalKeys) ||
      !isIdentitySegment(value.proposal.id) ||
      typeof value.proposal.summary !== 'string' ||
      value.proposal.summary.trim().length === 0 ||
      !Array.isArray(value.proposal.requests) ||
      value.proposal.requests.length === 0 ||
      !value.proposal.requests.every(isJsonValue)
    ) {
      return undefined;
    }
    return {
      id: value.id,
      kind: 'approval',
      prompt: value.prompt,
      proposal: {
        id: value.proposal.id,
        summary: value.proposal.summary,
        requests: (value.proposal.requests as JsonValue[]).map(request => cloneJson(request)),
      },
      createdAt: value.createdAt,
    };
  }

  if (value.kind === 'input') {
    if (
      !hasOnlyKeys(value, inputInteractionKeys) ||
      !isRecord(value.input) ||
      !hasOnlyKeys(value.input, inputDescriptorKeys) ||
      !['string', 'number', 'boolean', 'enum'].includes(String(value.input.type)) ||
      (value.input.nullable !== undefined && value.input.nullable !== true) ||
      (value.input.type === 'enum' &&
        (!Array.isArray(value.input.values) ||
          value.input.values.length === 0 ||
          !value.input.values.every(isTaskInputValue) ||
          (value.input.values.includes(null) && value.input.nullable !== true) ||
          new Set(value.input.values.map(item => JSON.stringify(item))).size !==
            value.input.values.length)) ||
      (value.input.type !== 'enum' && value.input.values !== undefined)
    )
      return undefined;
    return {
      id: value.id,
      kind: 'input',
      prompt: value.prompt,
      input:
        value.input.type === 'enum'
          ? {
              type: 'enum',
              values: value.input.values as (string | number | boolean | null)[],
              ...(value.input.nullable === true ? { nullable: true } : {}),
            }
          : {
              type: value.input.type as 'string' | 'number' | 'boolean',
              ...(value.input.nullable === true ? { nullable: true } : {}),
            },
      createdAt: value.createdAt,
    };
  }

  if (
    value.kind !== 'choice' ||
    !hasOnlyKeys(value, choiceInteractionKeys) ||
    !Array.isArray(value.options) ||
    value.options.length === 0
  ) {
    return undefined;
  }

  const options = value.options.map(option => {
    if (
      !isRecord(option) ||
      !hasOnlyKeys(option, interactionOptionKeys) ||
      !isIdentitySegment(option.id) ||
      typeof option.label !== 'string'
    ) {
      return undefined;
    }
    return { id: option.id, label: option.label };
  });
  if (options.some(option => option === undefined)) return undefined;
  const parsedOptions = options as Array<{ id: string; label: string }>;
  if (new Set(parsedOptions.map(option => option.id)).size !== parsedOptions.length) {
    return undefined;
  }

  return {
    id: value.id,
    kind: 'choice',
    prompt: value.prompt,
    options: parsedOptions,
    createdAt: value.createdAt,
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
  const interaction = parseTaskPendingInteraction(value.interaction);
  const error = parseTaskError(value.error);
  if (
    (value.subject !== undefined && subject === undefined) ||
    (value.progress !== undefined && progress === undefined) ||
    (value.interaction !== undefined && interaction === undefined) ||
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
      ...(interaction === undefined ? {} : { interaction }),
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
