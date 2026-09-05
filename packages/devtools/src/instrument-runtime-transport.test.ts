import type { TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  runtimeProtocolError,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from './diagnostics.js';
import { instrumentRuntimeTransport } from './instrument-runtime-transport.js';

const request = (id: string) =>
  createRuntimeProtocolRequest({ id, family: 'graph.read', body: { query: 'todos' } });

describe('instrumentRuntimeTransport', () => {
  it('records one self-contained exchange without changing its result', async () => {
    let time = 10;
    const diagnostics = createOntahiDiagnostics({ capacity: 2, now: () => time++ });
    const runtimeRequest = request('request-1');
    const response = createRuntimeProtocolResponse(runtimeRequest, { rows: 2 });
    const close = vi.fn();
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: { request: vi.fn().mockResolvedValue(response), close },
    });

    await expect(transport.request(runtimeRequest)).resolves.toBe(response);
    expect(transport.close).toBe(close);
    expect(diagnostics.inspect().events).toEqual([
      {
        kind: 'exchange.started',
        at: 10,
        exchangeId: 'request-1',
        requestId: 'request-1',
        family: 'graph.read',
        transportId: 'http',
        transportKind: 'fetch',
        startedAt: 10,
      },
      {
        kind: 'exchange.settled',
        at: 11,
        exchangeId: 'request-1',
        requestId: 'request-1',
        family: 'graph.read',
        transportId: 'http',
        transportKind: 'fetch',
        startedAt: 10,
        durationMs: 1,
        outcome: 'success',
      },
    ]);
  });

  it('keeps terminal identity when capacity eviction removes the start event', async () => {
    const diagnostics = createOntahiDiagnostics({ capacity: 1 });
    const runtimeRequest = request('request-evicted');
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: {
        request: vi.fn().mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, null)),
      },
    });

    await transport.request(runtimeRequest);

    expect(diagnostics.inspect().events).toMatchObject([
      {
        kind: 'exchange.settled',
        exchangeId: 'request-evicted',
        family: 'graph.read',
        transportId: 'http',
        outcome: 'success',
      },
    ]);
  });

  it('classifies protocol, transport, and abort outcomes', async () => {
    const protocolDiagnostics = createOntahiDiagnostics();
    const runtimeRequest = request('request-protocol');
    const protocolTransport = instrumentRuntimeTransport({
      diagnostics: protocolDiagnostics,
      id: 'websocket',
      kind: 'websocket',
      transport: {
        request: vi
          .fn()
          .mockResolvedValue(
            runtimeProtocolError('family_unavailable', 'Unavailable', runtimeRequest),
          ),
      },
    });
    await protocolTransport.request(runtimeRequest);
    expect(protocolDiagnostics.inspect().events.slice(-1)[0]).toMatchObject({
      kind: 'exchange.settled',
      outcome: 'protocol-error',
      transportId: 'websocket',
    });

    const failedDiagnostics = createOntahiDiagnostics();
    const failedTransport = instrumentRuntimeTransport({
      diagnostics: failedDiagnostics,
      id: 'http',
      kind: 'fetch',
      transport: { request: vi.fn().mockRejectedValue(new Error('offline')) },
    });
    await expect(failedTransport.request(request('request-failed'))).rejects.toThrow('offline');
    expect(failedDiagnostics.inspect().events.slice(-1)[0]).toMatchObject({
      kind: 'exchange.settled',
      outcome: 'transport-error',
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      failedTransport.request(request('request-aborted'), { signal: controller.signal }),
    ).rejects.toThrow('offline');
    expect(failedDiagnostics.inspect().events.slice(-1)[0]).toMatchObject({
      kind: 'exchange.settled',
      outcome: 'aborted',
    });
  });

  it('redacts captured envelopes before subscriber delivery', async () => {
    const listener = vi.fn();
    const diagnostics = createOntahiDiagnostics({
      capturePayloads: true,
      redact: value =>
        typeof value === 'object' && value !== null && 'token' in value
          ? { ...value, token: '[redacted]' }
          : value,
    });
    diagnostics.subscribe(listener);
    const runtimeRequest = createRuntimeProtocolRequest({
      id: 'request-secret',
      family: 'operation',
      body: { token: 'secret', name: 'createTodo' },
    });
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: {
        request: vi
          .fn()
          .mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, { ok: true })),
      },
    });

    await transport.request(runtimeRequest);

    expect(listener).toHaveBeenCalled();
    expect(diagnostics.inspect().events[0]).toMatchObject({
      request: { body: { token: '[redacted]', name: 'createTodo' } },
    });
  });

  it('groups Durable snapshots under one observation and preserves iterator values', async () => {
    const snapshots: TaskSnapshot[] = [
      {
        taskId: 'task-1',
        runId: 'run-1',
        status: 'running',
        updatedAt: '2026-01-01T00:00:00.000Z',
        progress: { percent: 50 },
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        status: 'completed',
        updatedAt: '2026-01-01T00:00:01.000Z',
        result: { secret: 'not captured' },
      },
    ];
    const base: RuntimeTransport = {
      request: vi.fn(),
      durableOperation: {
        observe: async function* <TResult>() {
          for (const snapshot of snapshots) yield snapshot as TaskSnapshot<TResult>;
        },
      },
    };
    const diagnostics = createOntahiDiagnostics({
      createId: () => 'observation-1',
    });
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'websocket',
      kind: 'websocket',
      transport: base,
    });
    const received: TaskSnapshot[] = [];

    for await (const snapshot of transport.durableOperation!.observe({
      taskId: 'task-1',
      runId: 'run-1',
    })) {
      received.push(snapshot);
    }

    expect(received).toEqual(snapshots);
    expect(diagnostics.inspect().events).toMatchObject([
      { kind: 'observation.started', observationId: 'observation-1' },
      { kind: 'observation.snapshot', sequence: 1, snapshot: { status: 'running' } },
      {
        kind: 'observation.snapshot',
        sequence: 2,
        snapshot: { status: 'completed' },
      },
      { kind: 'observation.settled', outcome: 'completed' },
    ]);
    expect(diagnostics.inspect().events[2]).not.toHaveProperty('snapshot.result');
  });
});
