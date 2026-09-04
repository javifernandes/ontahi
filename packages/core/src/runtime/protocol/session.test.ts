import { describe, expect, it, vi } from 'vitest';

import type { RuntimeProtocolDispatcher, RuntimeProtocolDispatchResult } from './dispatcher.js';
import { createRuntimeProtocolResponse, type RuntimeProtocolRequestEnvelope } from './envelope.js';
import {
  createPollingDurableOperationObserver,
  createRuntimeProtocolServerSession,
  parseRuntimeProtocolSessionClientFrame,
  parseRuntimeProtocolSessionServerFrame,
  type RuntimeProtocolSessionClientFrame,
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
    expect(
      parseRuntimeProtocolSessionServerFrame({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'ready',
        capabilities: ['request-response', 'durable-operation-push'],
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

  it('pushes sequenced snapshots, ends at terminal state, and rejects duplicate identities', async () => {
    const sent: RuntimeProtocolSessionServerFrame[] = [];
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
});
