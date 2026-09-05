import { describe, expect, it, vi } from 'vitest';

import type { RuntimeProtocolDispatcher, RuntimeProtocolDispatchResult } from './dispatcher.js';
import { createRuntimeProtocolResponse, type RuntimeProtocolRequestEnvelope } from './envelope.js';
import {
  createPollingDurableOperationObserver,
  createRuntimeProtocolServerSession,
  parseRuntimeProtocolSessionClientFrame,
  parseRuntimeProtocolSessionServerFrame,
  runtimeProtocolSessionError,
  type RuntimeProtocolSessionClientFrame,
  type RuntimeProtocolSessionGraphObserveFrame,
  type RuntimeProtocolSessionRequestFrame,
  type RuntimeProtocolSessionServerFrame,
} from './session.js';

const requestFrame = (id: string, family = 'operation'): RuntimeProtocolSessionRequestFrame => ({
  protocol: 'ontahi.runtime.session',
  version: 1,
  kind: 'request',
  request: {
    protocol: 'ontahi.runtime',
    version: 1,
    id,
    kind: 'request',
    family,
    body: { version: 1, kind: 'invoke', operationId: 'Todo.completeAll' },
  },
});

const observeFrame = (id = 'observation-1'): RuntimeProtocolSessionClientFrame => ({
  protocol: 'ontahi.runtime.session',
  version: 1,
  kind: 'durable-observe',
  id,
  run: { taskId: 'Todo.completeAll', runId: 'run-1' },
});

const graphObserveFrame = (id = 'graph-observation-1'): RuntimeProtocolSessionGraphObserveFrame => ({
  protocol: 'ontahi.runtime.session',
  version: 1,
  kind: 'graph-observe',
  id,
  request: {
    version: 1,
    kind: 'graph-read',
    mode: 'run',
    selection: {
      kind: 'selection',
      entityName: 'Todo',
      expression: { kind: 'all' },
    },
    orderBy: [],
  },
});

const nullDispatcher: RuntimeProtocolDispatcher<undefined> = input => {
  const request = input as RuntimeProtocolRequestEnvelope;
  return Promise.resolve(
    createRuntimeProtocolResponse(request, null) as RuntimeProtocolDispatchResult,
  );
};

describe('Runtime Protocol session frames', () => {
  it('parses request, response, observation, and ready frames without changing family bodies', () => {
    const request = requestFrame('request-1');
    expect(parseRuntimeProtocolSessionClientFrame(request)).toEqual({
      success: true,
      frame: request,
    });

    const response = {
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'response',
      response: createRuntimeProtocolResponse(request.request, {
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: { completed: 2 } },
      }),
    } as const;
    expect(parseRuntimeProtocolSessionServerFrame(response)).toEqual({
      success: true,
      frame: response,
    });

    const observation = {
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'durable-observation',
      id: 'observation-1',
      sequence: 1,
      body: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          taskId: 'Todo.completeAll',
          runId: 'run-1',
          status: 'running',
          updatedAt: '2026-09-04T00:00:00.000Z',
          progress: { phase: 'updating' },
        },
      },
    } as const;
    expect(parseRuntimeProtocolSessionServerFrame(observation)).toEqual({
      success: true,
      frame: observation,
    });
    const graphObservation = {
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'graph-observation',
      id: 'graph-observation-1',
      sequence: 1,
      body: {
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Observe me' }],
      },
    } as const;
    expect(parseRuntimeProtocolSessionClientFrame(graphObserveFrame())).toEqual({
      success: true,
      frame: graphObserveFrame(),
    });
    expect(parseRuntimeProtocolSessionServerFrame(graphObservation)).toEqual({
      success: true,
      frame: graphObservation,
    });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'ready',
        capabilities: [
          'request-response',
          'durable-operation-push',
          'graph-observation-push',
        ],
      }),
    ).toMatchObject({ success: true });
  });

  it('fails closed for unknown keys, versions, kinds, and malformed snapshots', () => {
    expect(
      parseRuntimeProtocolSessionClientFrame({ ...observeFrame(), authority: 'admin' }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_frame' } },
    });
    expect(parseRuntimeProtocolSessionClientFrame({ ...observeFrame(), version: 2 })).toMatchObject(
      {
        success: false,
        error: { error: { code: 'unsupported_version' } },
      },
    );
    expect(
      parseRuntimeProtocolSessionClientFrame({
        ...graphObserveFrame(),
        request: { ...graphObserveFrame().request, mode: 'get' },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_frame' } },
    });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'graph-observation',
        id: 'graph-observation-1',
        sequence: 1,
        body: { kind: 'graph-read-result', value: 'not-an-array' },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_frame' } },
    });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-observation',
        id: 'observation-1',
        sequence: 1,
        body: { version: 1, kind: 'snapshot', snapshot: { status: 'running' } },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_frame' } },
    });
  });

  it('validates every session frame shape and preserves valid error correlation', () => {
    expect(() => runtimeProtocolSessionError('request_failed', 'failed', ' ')).toThrow(
      'session error id is invalid',
    );
    expect(parseRuntimeProtocolSessionClientFrame(null)).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionClientFrame({
        ...requestFrame('request-1'),
        unexpected: true,
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionClientFrame({
        ...requestFrame('request-1'),
        request: { invalid: true },
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionClientFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-unobserve',
        id: 'observation-1',
      }),
    ).toMatchObject({ success: true, frame: { kind: 'durable-unobserve' } });
    expect(
      parseRuntimeProtocolSessionClientFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-unobserve',
        id: '',
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionClientFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'unknown',
      }),
    ).toMatchObject({ success: false });

    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'ready',
        capabilities: ['request-response', 'request-response'],
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'response',
        response: { invalid: true },
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'session-error',
        id: 'request-1',
        error: { code: 'request_failed', message: 'failed' },
      }),
    ).toEqual({
      success: true,
      frame: {
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'session-error',
        id: 'request-1',
        error: { code: 'request_failed', message: 'failed' },
      },
    });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'session-error',
        error: { code: 'unknown', message: 'failed' },
      }),
    ).toMatchObject({ success: false });
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'unknown',
      }),
    ).toMatchObject({ success: false });
  });
});

describe('Runtime Protocol server session', () => {
  it('multiplexes concurrent exchanges and preserves exact request correlation', async () => {
    const pending = new Map<string, (value: object) => void>();
    const observedContexts: unknown[] = [];
    const dispatcher: RuntimeProtocolDispatcher<{ principal: string }> = (input, context) => {
      const request = input as RuntimeProtocolRequestEnvelope;
      return new Promise<RuntimeProtocolDispatchResult>(resolve => {
        observedContexts.push(context);
        pending.set(request.id, body =>
          resolve(createRuntimeProtocolResponse(request, body) as RuntimeProtocolDispatchResult),
        );
      });
    };
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher,
      context: { principal: 'receiver-owned' },
      send: frame => {
        sent.push(frame);
      },
    });

    await Promise.all([
      session.receive(requestFrame('request-1')),
      session.receive(requestFrame('request-2', 'graph.read')),
    ]);
    pending.get('request-2')?.({ kind: 'graph-read-result', value: [] });
    pending.get('request-1')?.({ kind: 'invocation-result', result: { ok: true } });

    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[0]).toMatchObject({
      kind: 'ready',
      capabilities: ['request-response'],
    });
    expect(
      sent.slice(1).map(frame => (frame.kind === 'response' ? frame.response.id : '')),
    ).toEqual(['request-2', 'request-1']);
    expect(observedContexts).toEqual([
      { principal: 'receiver-owned' },
      { principal: 'receiver-owned' },
    ]);
  });

  it('bounds completed request identity retention without evicting active requests', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    let resolveActive!: (result: RuntimeProtocolDispatchResult) => void;
    const dispatcher: RuntimeProtocolDispatcher<undefined> = input => {
      const request = input as RuntimeProtocolRequestEnvelope;
      if (request.id !== 'active-request') return nullDispatcher(input, undefined);
      return new Promise(resolve => {
        resolveActive = resolve;
      });
    };
    const session = createRuntimeProtocolServerSession({
      dispatcher,
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
    });
    const completedWindow = 1_024;

    await session.receive(requestFrame('active-request'));
    await Promise.all(
      Array.from({ length: completedWindow + 1 }, (_, index) =>
        session.receive(requestFrame(`request-${index}`)),
      ),
    );
    await vi.waitFor(() => expect(sent).toHaveLength(completedWindow + 2));

    await session.receive(requestFrame('active-request'));
    expect(sent.at(-1)).toMatchObject({
      kind: 'session-error',
      id: 'active-request',
      error: { code: 'duplicate_id' },
    });

    await session.receive(requestFrame('request-0'));
    await vi.waitFor(() => expect(sent).toHaveLength(completedWindow + 4));

    expect(sent.at(-1)).toMatchObject({ kind: 'response', response: { id: 'request-0' } });
    resolveActive(
      createRuntimeProtocolResponse(
        requestFrame('active-request').request,
        null,
      ) as RuntimeProtocolDispatchResult,
    );
    await vi.waitFor(() => expect(sent).toHaveLength(completedWindow + 5));
  });

  it('pushes sequenced snapshots, ends at terminal state, and rejects duplicate identities', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher: input => nullDispatcher(input, undefined),
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
      observeDurableOperation: () =>
        (async function* () {
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
            progress: { phase: 'updating' },
          };
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'completed' as const,
            updatedAt: '2026-09-04T00:00:01.000Z',
            completedAt: '2026-09-04T00:00:01.000Z',
            result: { completed: 2 },
          };
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'failed' as const,
            updatedAt: '2026-09-04T00:00:02.000Z',
          };
        })(),
    });

    await session.receive(observeFrame());
    await session.receive(observeFrame());

    await vi.waitFor(() => expect(sent).toHaveLength(4));
    expect(sent[0]).toMatchObject({
      kind: 'ready',
      capabilities: ['request-response', 'durable-operation-push'],
    });
    expect(sent.find(frame => frame.kind === 'session-error')).toMatchObject({
      kind: 'session-error',
      id: 'observation-1',
      error: { code: 'duplicate_id' },
    });
    const observations = sent.filter(frame => frame.kind === 'durable-observation');
    expect(observations[0]).toMatchObject({
      kind: 'durable-observation',
      sequence: 1,
      body: { snapshot: { status: 'running', progress: { phase: 'updating' } } },
    });
    expect(observations[1]).toMatchObject({
      kind: 'durable-observation',
      sequence: 2,
      body: { snapshot: { status: 'completed', result: { completed: 2 } } },
    });
  });

  it('pushes sequenced Graph result snapshots with receiver-owned context', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const observed: unknown[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher: input => nullDispatcher(input, undefined),
      context: { principal: 'receiver-owned' },
      send: frame => {
        sent.push(frame);
      },
      observeGraph: (request, options) =>
        (async function* () {
          observed.push({ request, context: options.context });
          yield { kind: 'graph-read-result' as const, value: [{ id: 'todo-1' }] };
          yield {
            kind: 'graph-read-result' as const,
            value: [
              { id: 'todo-1' },
              { id: 'todo-2' },
            ],
          };
        })(),
    });

    await session.receive(graphObserveFrame());

    await vi.waitFor(() =>
      expect(sent.filter(frame => frame.kind === 'graph-observation')).toHaveLength(2),
    );
    expect(sent[0]).toMatchObject({
      kind: 'ready',
      capabilities: ['request-response', 'graph-observation-push'],
    });
    expect(sent.filter(frame => frame.kind === 'graph-observation')).toMatchObject([
      {
        id: 'graph-observation-1',
        sequence: 1,
        body: { kind: 'graph-read-result', value: [{ id: 'todo-1' }] },
      },
      {
        id: 'graph-observation-1',
        sequence: 2,
        body: { kind: 'graph-read-result', value: [{ id: 'todo-1' }, { id: 'todo-2' }] },
      },
    ]);
    expect(observed).toEqual([
      {
        request: graphObserveFrame().request,
        context: { principal: 'receiver-owned' },
      },
    ]);
  });

  it('aborts and releases a Graph observation when the client unsubscribes', async () => {
    let observedSignal: AbortSignal | undefined;
    let releaseWait: (() => void) | undefined;
    const released = new Promise<void>(resolve => {
      releaseWait = resolve;
    });
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: () => undefined,
      observeGraph: (_request, { signal }) =>
        (async function* () {
          observedSignal = signal;
          try {
            yield { kind: 'graph-read-result' as const, value: [] };
            if (!signal.aborted) {
              await new Promise<void>(resolve =>
                signal.addEventListener('abort', () => resolve(), { once: true }),
              );
            }
          } finally {
            releaseWait?.();
          }
        })(),
    });

    await session.receive(graphObserveFrame());
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    await session.receive({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'graph-unobserve',
      id: 'graph-observation-1',
    });

    await released;
    expect(observedSignal?.aborted).toBe(true);
  });

  it('finalizes an observation iterator exactly once after a terminal snapshot', async () => {
    const iteratorReturn = vi.fn(() => Promise.resolve({ done: true as const, value: undefined }));
    let emitted = false;
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: () => undefined,
      observeDurableOperation: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => {
            if (emitted) return Promise.resolve({ done: true, value: undefined });
            emitted = true;
            return Promise.resolve({
              done: false,
              value: {
                taskId: 'Todo.completeAll',
                runId: 'run-1',
                status: 'completed' as const,
                updatedAt: '2026-09-04T00:00:01.000Z',
                completedAt: '2026-09-04T00:00:01.000Z',
                result: { completed: 2 },
              },
            });
          },
          return: iteratorReturn,
        }),
      }),
    });

    await session.receive(observeFrame());

    await vi.waitFor(() => expect(iteratorReturn).toHaveBeenCalledTimes(1));
    session.close();
    expect(iteratorReturn).toHaveBeenCalledTimes(1);
  });

  it('reports an asynchronous ready-frame send failure', async () => {
    const failure = new Error('ready send failed');
    const reportError = vi.fn();

    createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: () => Promise.reject(failure),
      reportError,
    });

    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure));
  });

  it('reports an observation iterator finalization failure without leaking it', async () => {
    const failure = new Error('iterator cleanup failed');
    const reportError = vi.fn();
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: () => undefined,
      reportError,
      observeDurableOperation: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () =>
            Promise.resolve({
              done: false as const,
              value: {
                taskId: 'Todo.completeAll',
                runId: 'run-1',
                status: 'completed' as const,
                updatedAt: '2026-09-04T00:00:01.000Z',
                completedAt: '2026-09-04T00:00:01.000Z',
              },
            }),
          return: () => Promise.reject(failure),
        }),
      }),
    });

    await session.receive(observeFrame());

    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure));
  });

  it('aborts and releases an active observation when the client unsubscribes', async () => {
    let observedSignal: AbortSignal | undefined;
    let releaseWait: (() => void) | undefined;
    const released = new Promise<void>(resolve => {
      releaseWait = resolve;
    });
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: () => undefined,
      observeDurableOperation: (_run, { signal }) =>
        (async function* () {
          observedSignal = signal;
          try {
            yield {
              taskId: 'Todo.completeAll',
              runId: 'run-1',
              status: 'running' as const,
              updatedAt: '2026-09-04T00:00:00.000Z',
            };
            if (!signal.aborted) {
              await new Promise<void>(resolve =>
                signal.addEventListener('abort', () => resolve(), { once: true }),
              );
            }
          } finally {
            releaseWait?.();
          }
        })(),
    });

    await session.receive(observeFrame());
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    await session.receive({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'durable-unobserve',
      id: 'observation-1',
    });

    await released;
    expect(observedSignal?.aborted).toBe(true);
  });

  it('reports malformed frames and unavailable push without closing request exchange', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
    });

    await session.receive('not-a-frame');
    await session.receive(observeFrame());
    await session.receive(requestFrame('request-after-errors'));

    await vi.waitFor(() => expect(sent).toHaveLength(4));
    expect(sent.slice(1)).toMatchObject([
      { kind: 'session-error', error: { code: 'invalid_frame' } },
      {
        kind: 'session-error',
        id: 'observation-1',
        error: { code: 'capability_unavailable' },
      },
      { kind: 'response', response: { id: 'request-after-errors' } },
    ]);
  });

  it('reports dispatcher failures and rejects reused request ids', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const reported: unknown[] = [];
    const failure = new Error('dispatcher exploded');
    const session = createRuntimeProtocolServerSession({
      dispatcher: () => Promise.reject(failure),
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
      reportError: error => reported.push(error),
    });

    await session.receive(requestFrame('request-1'));
    await session.receive(requestFrame('request-1'));
    await vi.waitFor(() => expect(sent).toHaveLength(3));

    expect(reported).toEqual([failure]);
    expect(
      sent.filter(frame => frame.kind === 'session-error').map(frame => frame.error.code),
    ).toEqual(expect.arrayContaining(['duplicate_id', 'request_failed']));
  });

  it('turns invalid observer output into a correlated protocol error', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const reported: unknown[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
      observeDurableOperation: () =>
        (async function* () {
          yield {
            taskId: 'Todo.completeAll',
            runId: 'another-run',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
          };
        })(),
      reportError: error => reported.push(error),
    });

    await session.receive(observeFrame());
    await vi.waitFor(() =>
      expect(sent.find(frame => frame.kind === 'durable-observation')).toBeDefined(),
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(Error);
    expect(sent.find(frame => frame.kind === 'durable-observation')).toMatchObject({
      kind: 'durable-observation',
      id: 'observation-1',
      sequence: 1,
      body: { kind: 'protocol-error', error: { code: 'inspection_unavailable' } },
    });
  });

  it('closes all active observation resources once and ignores later input', async () => {
    let observedSignal: AbortSignal | undefined;
    const sent: RuntimeProtocolSessionServerFrame[] = [];
    const session = createRuntimeProtocolServerSession({
      dispatcher: nullDispatcher,
      context: undefined,
      send: frame => {
        sent.push(frame);
      },
      observeDurableOperation: (_run, { signal }) =>
        (async function* () {
          observedSignal = signal;
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
          };
          await new Promise<void>(resolve =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          );
        })(),
    });

    await session.receive(observeFrame());
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    session.close();
    session.close();
    await session.receive(requestFrame('ignored-after-close'));

    expect(observedSignal?.aborted).toBe(true);
    expect(sent).toHaveLength(2);
  });
});

describe('polling Durable Operation server observer', () => {
  it('emits only changed snapshots and stops after terminal state', async () => {
    const snapshots = [
      {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'running' as const,
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
      {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'running' as const,
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
      {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'completed' as const,
        updatedAt: '2026-09-04T00:00:01.000Z',
        completedAt: '2026-09-04T00:00:01.000Z',
        result: { completed: 2 },
      },
    ];
    const inspect = vi.fn(async () => snapshots.shift()!);
    const observe = createPollingDurableOperationObserver({ inspect, pollIntervalMs: 0 });
    const received = [];

    for await (const snapshot of observe(
      { taskId: 'Todo.completeAll', runId: 'run-1' },
      { context: undefined, signal: new AbortController().signal },
    )) {
      received.push(snapshot);
    }

    expect(received.map(snapshot => snapshot.status)).toEqual(['running', 'completed']);
    expect(inspect).toHaveBeenCalledTimes(3);
  });

  it('waits between inspections and validates the interval', async () => {
    expect(() =>
      createPollingDurableOperationObserver({
        inspect: async () => ({
          taskId: 'Todo.completeAll',
          runId: 'run-1',
          status: 'running',
          updatedAt: '2026-09-04T00:00:00.000Z',
        }),
        pollIntervalMs: -1,
      }),
    ).toThrow('poll interval must be a non-negative finite number');

    const snapshots = [
      {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'running' as const,
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
      {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'completed' as const,
        updatedAt: '2026-09-04T00:00:01.000Z',
        completedAt: '2026-09-04T00:00:01.000Z',
      },
    ];
    const observe = createPollingDurableOperationObserver({
      inspect: async () => snapshots.shift()!,
      pollIntervalMs: 1,
    });
    const received = [];

    for await (const snapshot of observe(
      { taskId: 'Todo.completeAll', runId: 'run-1' },
      { context: undefined, signal: new AbortController().signal },
    )) {
      received.push(snapshot.status);
    }

    expect(received).toEqual(['running', 'completed']);
  });
});
