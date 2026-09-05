import {
  graphReadProtocolError,
  isGraphReadProtocolError,
  parseGraphReadRequest,
  type GraphReadProtocolError,
  type GraphReadRequestV1,
} from '../../data-graph/read-protocol.js';
import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import type { TaskRunIdentity, TaskSnapshot } from '../contracts.js';

import type { RuntimeProtocolDispatcher } from './dispatcher.js';
import {
  durableOperationProtocolError,
  parseDurableOperationProtocolRequest,
  parseDurableOperationProtocolResponse,
  toDurableOperationSnapshotResponse,
  type DurableOperationProtocolResponse,
} from './durable-operation.js';
import {
  isRuntimeProtocolError,
  parseRuntimeProtocolRequestEnvelope,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from './envelope.js';

export const RUNTIME_PROTOCOL_SESSION_NAME = 'ontahi.runtime.session' as const;
export const RUNTIME_PROTOCOL_SESSION_VERSION = 1 as const;

export type RuntimeProtocolSessionCapability =
  | 'request-response'
  | 'durable-operation-push'
  | 'graph-observation-push';

export type RuntimeProtocolSessionReadyFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'ready';
  readonly capabilities: readonly RuntimeProtocolSessionCapability[];
};

export type RuntimeProtocolSessionRequestFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'request';
  readonly request: RuntimeProtocolRequestEnvelope;
};

export type RuntimeProtocolSessionResponseFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'response';
  readonly response: RuntimeProtocolResponseEnvelope | RuntimeProtocolError;
};

export type RuntimeProtocolSessionDurableObserveFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'durable-observe';
  readonly id: string;
  readonly run: TaskRunIdentity;
};

export type RuntimeProtocolSessionDurableUnobserveFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'durable-unobserve';
  readonly id: string;
};

export type RuntimeProtocolSessionDurableObservationFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'durable-observation';
  readonly id: string;
  readonly sequence: number;
  readonly body: DurableOperationProtocolResponse;
};

export type RuntimeProtocolSessionGraphObserveFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'graph-observe';
  readonly id: string;
  readonly request: GraphReadRequestV1;
};

export type RuntimeProtocolSessionGraphUnobserveFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'graph-unobserve';
  readonly id: string;
};

export type RuntimeProtocolGraphObservationBody =
  | { readonly kind: 'graph-read-result'; readonly value: JsonValue[] }
  | GraphReadProtocolError;

export type RuntimeProtocolSessionGraphObservationFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'graph-observation';
  readonly id: string;
  readonly sequence: number;
  readonly body: RuntimeProtocolGraphObservationBody;
};

export type RuntimeProtocolSessionGraphObservationCompleteFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'graph-observation-complete';
  readonly id: string;
  readonly sequence: number;
};

export type RuntimeProtocolSessionErrorCode =
  | 'invalid_frame'
  | 'unsupported_version'
  | 'duplicate_id'
  | 'capability_unavailable'
  | 'request_failed'
  | 'observation_failed';

export type RuntimeProtocolSessionErrorFrame = {
  readonly protocol: typeof RUNTIME_PROTOCOL_SESSION_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_SESSION_VERSION;
  readonly kind: 'session-error';
  readonly id?: string;
  readonly error: {
    readonly code: RuntimeProtocolSessionErrorCode;
    readonly message: string;
  };
};

export type RuntimeProtocolSessionClientFrame =
  | RuntimeProtocolSessionRequestFrame
  | RuntimeProtocolSessionDurableObserveFrame
  | RuntimeProtocolSessionDurableUnobserveFrame
  | RuntimeProtocolSessionGraphObserveFrame
  | RuntimeProtocolSessionGraphUnobserveFrame;

export type RuntimeProtocolSessionServerFrame =
  | RuntimeProtocolSessionReadyFrame
  | RuntimeProtocolSessionResponseFrame
  | RuntimeProtocolSessionDurableObservationFrame
  | RuntimeProtocolSessionGraphObservationFrame
  | RuntimeProtocolSessionGraphObservationCompleteFrame
  | RuntimeProtocolSessionErrorFrame;

export type RuntimeProtocolSessionFrameParseResult<TFrame> =
  | { readonly success: true; readonly frame: TFrame }
  | { readonly success: false; readonly error: RuntimeProtocolSessionErrorFrame };

const sessionCapabilities = new Set<RuntimeProtocolSessionCapability>([
  'request-response',
  'durable-operation-push',
  'graph-observation-push',
]);
const sessionErrorCodes = new Set<RuntimeProtocolSessionErrorCode>([
  'invalid_frame',
  'unsupported_version',
  'duplicate_id',
  'capability_unavailable',
  'request_failed',
  'observation_failed',
]);
const commonFrameKeys = new Set(['protocol', 'version', 'kind']);
const readyFrameKeys = new Set([...commonFrameKeys, 'capabilities']);
const requestFrameKeys = new Set([...commonFrameKeys, 'request']);
const responseFrameKeys = new Set([...commonFrameKeys, 'response']);
const observeFrameKeys = new Set([...commonFrameKeys, 'id', 'run']);
const unobserveFrameKeys = new Set([...commonFrameKeys, 'id']);
const observationFrameKeys = new Set([...commonFrameKeys, 'id', 'sequence', 'body']);
const observationCompleteFrameKeys = new Set([...commonFrameKeys, 'id', 'sequence']);
const graphObserveFrameKeys = new Set([...commonFrameKeys, 'id', 'request']);
const errorFrameKeys = new Set([...commonFrameKeys, 'id', 'error']);
const errorKeys = new Set(['code', 'message']);
const graphReadResultKeys = new Set(['kind', 'value']);

const hasOnlyKeys = (record: Record<string, unknown>, keys: ReadonlySet<string>) =>
  Object.keys(record).every(key => keys.has(key));

const isSessionId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

export const runtimeProtocolSessionError = (
  code: RuntimeProtocolSessionErrorCode,
  message: string,
  id?: string,
): RuntimeProtocolSessionErrorFrame => {
  if (id !== undefined && !isSessionId(id)) {
    throw new TypeError('Runtime Protocol session error id is invalid.');
  }
  return {
    protocol: RUNTIME_PROTOCOL_SESSION_NAME,
    version: RUNTIME_PROTOCOL_SESSION_VERSION,
    kind: 'session-error',
    ...(id === undefined ? {} : { id }),
    error: { code, message },
  };
};

const invalidFrame = (
  message: string,
  value?: Record<string, unknown>,
): { readonly success: false; readonly error: RuntimeProtocolSessionErrorFrame } => ({
  success: false,
  error: runtimeProtocolSessionError(
    'invalid_frame',
    message,
    value && isSessionId(value.id) ? value.id : undefined,
  ),
});

const validateSessionEnvelope = (
  value: unknown,
):
  | { readonly success: true; readonly value: Record<string, unknown> }
  | { readonly success: false; readonly error: RuntimeProtocolSessionErrorFrame } => {
  if (!isRecord(value)) return invalidFrame('Runtime Protocol session frame must be an object.');
  if (value.protocol !== RUNTIME_PROTOCOL_SESSION_NAME) {
    return invalidFrame(
      `Runtime Protocol session name must be "${RUNTIME_PROTOCOL_SESSION_NAME}".`,
      value,
    );
  }
  if (value.version !== RUNTIME_PROTOCOL_SESSION_VERSION) {
    return {
      success: false,
      error: runtimeProtocolSessionError(
        'unsupported_version',
        `Unsupported Runtime Protocol session version: ${String(value.version)}.`,
        isSessionId(value.id) ? value.id : undefined,
      ),
    };
  }
  if (!isJsonValue(value)) {
    return invalidFrame('Runtime Protocol session frame must be JSON-safe.', value);
  }
  return { success: true, value };
};

const parseRun = (value: unknown): TaskRunIdentity | undefined => {
  const parsed = parseDurableOperationProtocolRequest({ version: 1, kind: 'inspect', run: value });
  return parsed.success ? parsed.request.run : undefined;
};

export const parseRuntimeProtocolSessionClientFrame = (
  input: unknown,
): RuntimeProtocolSessionFrameParseResult<RuntimeProtocolSessionClientFrame> => {
  const envelope = validateSessionEnvelope(input);
  if (!envelope.success) return envelope;
  const value = envelope.value;

  if (value.kind === 'request') {
    if (!hasOnlyKeys(value, requestFrameKeys)) {
      return invalidFrame('Runtime Protocol session request frame contains unknown keys.', value);
    }
    const parsed = parseRuntimeProtocolRequestEnvelope(value.request);
    if (!parsed.success) {
      return invalidFrame(parsed.error.error.message, value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'request',
        request: parsed.request,
      },
    };
  }

  if (value.kind === 'durable-observe') {
    const run = parseRun(value.run);
    if (!hasOnlyKeys(value, observeFrameKeys) || !isSessionId(value.id) || !run) {
      return invalidFrame('Runtime Protocol durable observe frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'durable-observe',
        id: value.id,
        run,
      },
    };
  }

  if (value.kind === 'durable-unobserve') {
    if (!hasOnlyKeys(value, unobserveFrameKeys) || !isSessionId(value.id)) {
      return invalidFrame('Runtime Protocol durable unobserve frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'durable-unobserve',
        id: value.id,
      },
    };
  }

  if (value.kind === 'graph-observe') {
    const request = parseGraphReadRequest(value.request);
    if (
      !hasOnlyKeys(value, graphObserveFrameKeys) ||
      !isSessionId(value.id) ||
      !request.success ||
      request.request.mode !== 'run'
    ) {
      return invalidFrame('Runtime Protocol Graph observe frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'graph-observe',
        id: value.id,
        request: request.request,
      },
    };
  }

  if (value.kind === 'graph-unobserve') {
    if (!hasOnlyKeys(value, unobserveFrameKeys) || !isSessionId(value.id)) {
      return invalidFrame('Runtime Protocol Graph unobserve frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'graph-unobserve',
        id: value.id,
      },
    };
  }

  return invalidFrame('Runtime Protocol session client frame kind is invalid.', value);
};

const isUncorrelatedRuntimeResponse = (
  value: unknown,
): value is RuntimeProtocolResponseEnvelope | RuntimeProtocolError => {
  if (isRuntimeProtocolError(value)) return true;
  if (!isRecord(value) || value.kind !== 'response') return false;
  const parsedRequest = parseRuntimeProtocolRequestEnvelope({
    ...value,
    kind: 'request',
  });
  return parsedRequest.success;
};

const parseGraphObservationBody = (
  value: unknown,
): RuntimeProtocolGraphObservationBody | undefined => {
  if (isGraphReadProtocolError(value)) return cloneJson(value);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, graphReadResultKeys) ||
    value.kind !== 'graph-read-result' ||
    !Array.isArray(value.value) ||
    !isJsonValue(value.value)
  ) {
    return undefined;
  }
  return cloneJson(value) as RuntimeProtocolGraphObservationBody;
};

export const parseRuntimeProtocolSessionServerFrame = (
  input: unknown,
): RuntimeProtocolSessionFrameParseResult<RuntimeProtocolSessionServerFrame> => {
  const envelope = validateSessionEnvelope(input);
  if (!envelope.success) return envelope;
  const value = envelope.value;

  if (value.kind === 'ready') {
    if (
      !hasOnlyKeys(value, readyFrameKeys) ||
      !Array.isArray(value.capabilities) ||
      value.capabilities.some(capability => !sessionCapabilities.has(capability)) ||
      new Set(value.capabilities).size !== value.capabilities.length
    ) {
      return invalidFrame('Runtime Protocol session ready frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'ready',
        capabilities: [...value.capabilities] as RuntimeProtocolSessionCapability[],
      },
    };
  }

  if (value.kind === 'response') {
    if (!hasOnlyKeys(value, responseFrameKeys) || !isUncorrelatedRuntimeResponse(value.response)) {
      return invalidFrame('Runtime Protocol session response frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'response',
        response: cloneJson(value.response),
      },
    };
  }

  if (value.kind === 'durable-observation') {
    const body = parseDurableOperationProtocolResponse(value.body);
    if (
      !hasOnlyKeys(value, observationFrameKeys) ||
      !isSessionId(value.id) ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) <= 0 ||
      !body.success
    ) {
      return invalidFrame('Runtime Protocol durable observation frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'durable-observation',
        id: value.id,
        sequence: value.sequence as number,
        body: body.response,
      },
    };
  }

  if (value.kind === 'graph-observation') {
    const body = parseGraphObservationBody(value.body);
    if (
      !hasOnlyKeys(value, observationFrameKeys) ||
      !isSessionId(value.id) ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) <= 0 ||
      !body
    ) {
      return invalidFrame('Runtime Protocol Graph observation frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'graph-observation',
        id: value.id,
        sequence: value.sequence as number,
        body,
      },
    };
  }

  if (value.kind === 'graph-observation-complete') {
    if (
      !hasOnlyKeys(value, observationCompleteFrameKeys) ||
      !isSessionId(value.id) ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) <= 0
    ) {
      return invalidFrame('Runtime Protocol Graph observation completion frame is invalid.', value);
    }
    return {
      success: true,
      frame: {
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'graph-observation-complete',
        id: value.id,
        sequence: value.sequence as number,
      },
    };
  }

  if (value.kind === 'session-error') {
    if (
      !hasOnlyKeys(value, errorFrameKeys) ||
      (value.id !== undefined && !isSessionId(value.id)) ||
      !isRecord(value.error) ||
      !hasOnlyKeys(value.error, errorKeys) ||
      typeof value.error.code !== 'string' ||
      !sessionErrorCodes.has(value.error.code as RuntimeProtocolSessionErrorCode) ||
      typeof value.error.message !== 'string'
    ) {
      return invalidFrame('Runtime Protocol session error frame is invalid.', value);
    }
    return {
      success: true,
      frame: cloneJson(value) as RuntimeProtocolSessionErrorFrame,
    };
  }

  return invalidFrame('Runtime Protocol session server frame kind is invalid.', value);
};

export type RuntimeProtocolDurableObservationOptions<TContext> = {
  readonly context: TContext;
  readonly signal: AbortSignal;
};

export type RuntimeProtocolDurableObserver<TContext> = (
  run: TaskRunIdentity,
  options: RuntimeProtocolDurableObservationOptions<TContext>,
) => AsyncIterable<TaskSnapshot>;

export type RuntimeProtocolGraphObserver<TContext> = (
  request: GraphReadRequestV1,
  options: RuntimeProtocolDurableObservationOptions<TContext>,
) => AsyncIterable<RuntimeProtocolGraphObservationBody>;

export type CreateRuntimeProtocolServerSessionOptions<TContext> = {
  readonly dispatcher: RuntimeProtocolDispatcher<TContext>;
  readonly context: TContext;
  readonly send: (frame: RuntimeProtocolSessionServerFrame) => void | Promise<void>;
  readonly observeDurableOperation?: RuntimeProtocolDurableObserver<TContext>;
  readonly observeGraph?: RuntimeProtocolGraphObserver<TContext>;
  readonly reportError?: (error: unknown) => void;
};

export type RuntimeProtocolServerSession = {
  receive(frame: unknown): Promise<void>;
  close(): void;
};

type ActiveObservation = {
  readonly controller: AbortController;
  iterator?: AsyncIterator<unknown>;
  finalization?: Promise<void>;
};

const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled']);
const MAX_COMPLETED_REQUEST_IDS = 1_024;

export const createRuntimeProtocolServerSession = <TContext>({
  dispatcher,
  context,
  send: sendFrame,
  observeDurableOperation,
  observeGraph,
  reportError,
}: CreateRuntimeProtocolServerSessionOptions<TContext>): RuntimeProtocolServerSession => {
  let closed = false;
  const activeRequestIds = new Set<string>();
  const completedRequestIds = new Set<string>();
  const observations = new Map<string, ActiveObservation>();
  const send = async (frame: RuntimeProtocolSessionServerFrame) => {
    if (!closed) await sendFrame(frame);
  };
  const sendError = (code: RuntimeProtocolSessionErrorCode, message: string, id?: string) =>
    send(runtimeProtocolSessionError(code, message, id));

  const rememberCompletedRequestId = (id: string) => {
    completedRequestIds.add(id);
    if (completedRequestIds.size <= MAX_COMPLETED_REQUEST_IDS) return;
    const oldestId = completedRequestIds.values().next().value;
    if (oldestId !== undefined) completedRequestIds.delete(oldestId);
  };

  const finalizeObservation = (active: ActiveObservation) => {
    if (active.finalization) return active.finalization;
    active.controller.abort();
    active.finalization = (async () => {
      try {
        await active.iterator?.return?.();
      } catch (error) {
        reportError?.(error);
        // Observation cleanup must not escape the owning session lifecycle.
      }
    })();
    return active.finalization;
  };

  const runRequest = async (frame: RuntimeProtocolSessionRequestFrame) => {
    const { request } = frame;
    try {
      const response = await dispatcher(request, context);
      await send({
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'response',
        response,
      });
    } catch (error) {
      reportError?.(error);
      await sendError(
        'request_failed',
        'Runtime Protocol session request dispatch failed.',
        request.id,
      );
    } finally {
      activeRequestIds.delete(request.id);
      rememberCompletedRequestId(request.id);
    }
  };

  const runDurableObservation = async (
    frame: RuntimeProtocolSessionDurableObserveFrame,
    active: ActiveObservation,
  ) => {
    let sequence = 0;
    try {
      const iterable = observeDurableOperation!(frame.run, {
        context,
        signal: active.controller.signal,
      });
      const iterator = iterable[Symbol.asyncIterator]();
      active.iterator = iterator as AsyncIterator<unknown>;

      while (!active.controller.signal.aborted) {
        const next = await iterator.next();
        if (next.done || active.controller.signal.aborted) break;
        const parsedBody = parseDurableOperationProtocolResponse(
          toDurableOperationSnapshotResponse(next.value),
        );
        if (!parsedBody.success || parsedBody.response.kind === 'protocol-error') {
          throw new Error('Durable Operation observer produced an invalid snapshot.');
        }
        const body = parsedBody.response;
        if (body.snapshot.taskId !== frame.run.taskId || body.snapshot.runId !== frame.run.runId) {
          throw new Error('Durable Operation snapshot identity does not match the observed run.');
        }
        sequence += 1;
        await send({
          protocol: RUNTIME_PROTOCOL_SESSION_NAME,
          version: RUNTIME_PROTOCOL_SESSION_VERSION,
          kind: 'durable-observation',
          id: frame.id,
          sequence,
          body,
        });
        if (terminalTaskStatuses.has(body.snapshot.status)) break;
      }
    } catch (error) {
      if (!active.controller.signal.aborted) {
        reportError?.(error);
        await send({
          protocol: RUNTIME_PROTOCOL_SESSION_NAME,
          version: RUNTIME_PROTOCOL_SESSION_VERSION,
          kind: 'durable-observation',
          id: frame.id,
          sequence: sequence + 1,
          body: durableOperationProtocolError(
            'inspection_unavailable',
            'Durable Operation observation is unavailable.',
          ),
        });
      }
    } finally {
      if (observations.get(frame.id) === active) observations.delete(frame.id);
      await finalizeObservation(active);
    }
  };

  const runGraphObservation = async (
    frame: RuntimeProtocolSessionGraphObserveFrame,
    active: ActiveObservation,
  ) => {
    let sequence = 0;
    try {
      const iterable = observeGraph!(frame.request, {
        context,
        signal: active.controller.signal,
      });
      const iterator = iterable[Symbol.asyncIterator]();
      active.iterator = iterator as AsyncIterator<unknown>;

      while (!active.controller.signal.aborted) {
        const next = await iterator.next();
        if (next.done) {
          if (!active.controller.signal.aborted) {
            await send({
              protocol: RUNTIME_PROTOCOL_SESSION_NAME,
              version: RUNTIME_PROTOCOL_SESSION_VERSION,
              kind: 'graph-observation-complete',
              id: frame.id,
              sequence: sequence + 1,
            });
          }
          break;
        }
        if (active.controller.signal.aborted) break;
        const body = parseGraphObservationBody(next.value);
        if (!body) throw new Error('Graph observer produced an invalid result.');
        sequence += 1;
        await send({
          protocol: RUNTIME_PROTOCOL_SESSION_NAME,
          version: RUNTIME_PROTOCOL_SESSION_VERSION,
          kind: 'graph-observation',
          id: frame.id,
          sequence,
          body,
        });
        if (body.kind === 'protocol-error') break;
      }
    } catch (error) {
      if (!active.controller.signal.aborted) {
        reportError?.(error);
        await send({
          protocol: RUNTIME_PROTOCOL_SESSION_NAME,
          version: RUNTIME_PROTOCOL_SESSION_VERSION,
          kind: 'graph-observation',
          id: frame.id,
          sequence: sequence + 1,
          body: graphReadProtocolError(
            'execution_unavailable',
            'Data graph observation is temporarily unavailable.',
          ),
        });
      }
    } finally {
      if (observations.get(frame.id) === active) observations.delete(frame.id);
      await finalizeObservation(active);
    }
  };

  const receive = async (input: unknown) => {
    if (closed) return;
    const parsed = parseRuntimeProtocolSessionClientFrame(input);
    if (!parsed.success) {
      await send(parsed.error);
      return;
    }

    const frame = parsed.frame;
    if (frame.kind === 'request') {
      if (activeRequestIds.has(frame.request.id) || completedRequestIds.has(frame.request.id)) {
        await sendError(
          'duplicate_id',
          `Runtime Protocol request id ${frame.request.id} was already used in this session.`,
          frame.request.id,
        );
        return;
      }
      activeRequestIds.add(frame.request.id);
      void runRequest(frame);
      return;
    }

    if (frame.kind === 'durable-unobserve' || frame.kind === 'graph-unobserve') {
      const active = observations.get(frame.id);
      if (!active) return;
      observations.delete(frame.id);
      await finalizeObservation(active);
      return;
    }

    const observerAvailable =
      frame.kind === 'durable-observe' ? observeDurableOperation !== undefined : observeGraph !== undefined;
    if (!observerAvailable) {
      await sendError(
        'capability_unavailable',
        frame.kind === 'durable-observe'
          ? 'Durable Operation push observation is unavailable in this session.'
          : 'Data graph push observation is unavailable in this session.',
        frame.id,
      );
      return;
    }
    if (observations.has(frame.id)) {
      await sendError(
        'duplicate_id',
        `Observation id ${frame.id} is already active in this session.`,
        frame.id,
      );
      return;
    }

    const active = { controller: new AbortController() } satisfies ActiveObservation;
    observations.set(frame.id, active);
    if (frame.kind === 'durable-observe') void runDurableObservation(frame, active);
    else void runGraphObservation(frame, active);
  };

  void send({
    protocol: RUNTIME_PROTOCOL_SESSION_NAME,
    version: RUNTIME_PROTOCOL_SESSION_VERSION,
    kind: 'ready',
    capabilities: [
      'request-response',
      ...(observeDurableOperation ? (['durable-operation-push'] as const) : []),
      ...(observeGraph ? (['graph-observation-push'] as const) : []),
    ],
  }).catch(error => reportError?.(error));

  return {
    receive,
    close: () => {
      if (closed) return;
      closed = true;
      for (const active of observations.values()) {
        void finalizeObservation(active);
      }
      observations.clear();
    },
  };
};

export type CreatePollingDurableOperationObserverOptions<TContext> = {
  readonly inspect: (run: TaskRunIdentity, context: TContext) => Promise<TaskSnapshot>;
  readonly pollIntervalMs?: number;
};

const waitForNextInspection = (intervalMs: number, signal: AbortSignal): Promise<boolean> => {
  if (signal.aborted) return Promise.resolve(false);
  if (intervalMs === 0) return Promise.resolve(true);

  return new Promise(resolve => {
    let settled = false;
    const finish = (shouldContinue: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      resolve(shouldContinue);
    };
    const abort = () => finish(false);
    const timeout = setTimeout(() => finish(true), intervalMs);
    signal.addEventListener('abort', abort, { once: true });
  });
};

export const createPollingDurableOperationObserver = <TContext>({
  inspect,
  pollIntervalMs = 250,
}: CreatePollingDurableOperationObserverOptions<TContext>): RuntimeProtocolDurableObserver<TContext> => {
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError(
      'Durable Operation server poll interval must be a non-negative finite number.',
    );
  }

  return async function* (run, { context, signal }) {
    let previousSnapshot: JsonValue | undefined;
    while (!signal.aborted) {
      const snapshot = await inspect(run, context);
      const portableSnapshot = toDurableOperationSnapshotResponse(snapshot).snapshot;
      const changed = JSON.stringify(previousSnapshot) !== JSON.stringify(portableSnapshot);
      if (changed) {
        previousSnapshot = cloneJson(portableSnapshot) as JsonValue;
        yield snapshot;
      }
      if (terminalTaskStatuses.has(snapshot.status)) return;
      if (!(await waitForNextInspection(pollIntervalMs, signal))) return;
    }
  };
};
