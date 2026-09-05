import { describe, expect, it, vi } from 'vitest';

import type { TaskSnapshot } from '../contracts.js';

import { createRuntimeProtocolRequest, createRuntimeProtocolResponse } from './envelope.js';
import {
  createRuntimeTransportRouter,
  isConfigurableRuntimeTransport,
  type RuntimeTransportRoutingSnapshot,
} from './transport-router.js';
import type {
  DurableOperationObservationCapability,
  GraphObservationCapability,
  RuntimeTransport,
} from './transport.js';

const taskSnapshot = (source: string): TaskSnapshot => ({
  taskId: 'TodoList.completeAll',
  runId: 'run-1',
  status: 'running',
  updatedAt: '2026-09-05T00:00:00.000Z',
  progress: { message: source },
});

const createTransport = ({
  durable = false,
  graph = false,
  source,
}: {
  readonly durable?: boolean;
  readonly graph?: boolean;
  readonly source: string;
}) => {
  const request = vi.fn<RuntimeTransport['request']>(async input =>
    createRuntimeProtocolResponse(input, { source }),
  );
  const observeDurable: DurableOperationObservationCapability['observe'] = async function* <
    TResult,
  >() {
    yield taskSnapshot(source) as TaskSnapshot<TResult>;
  };
  const observeGraph: GraphObservationCapability['observe'] = async function* () {
    yield {
      version: 1,
      kind: 'graph-observation',
      change: { kind: 'invalidate' },
    } as never;
  };
  return {
    request,
    ...(durable ? { durableOperation: { observe: observeDurable } } : {}),
    ...(graph ? { graph: { observe: observeGraph } } : {}),
  };
};

describe('Runtime Transport router', () => {
  it('derives registered capabilities and routes protocol work independently', async () => {
    const http = createTransport({ durable: true, source: 'http' });
    const websocket = createTransport({ durable: true, graph: true, source: 'websocket' });
    const transport = createRuntimeTransportRouter({
      transports: { http, websocket },
      routing: {
        'graph.read': 'http',
        'graph.command': 'websocket',
        operation: 'http',
        'durable.operation.observe': 'websocket',
      },
    });

    const snapshot = transport.routing.inspect();
    expect(isConfigurableRuntimeTransport(transport)).toBe(true);
    expect(isConfigurableRuntimeTransport(http)).toBe(false);
    expect(snapshot.assignments).toEqual({
      operation: 'http',
      'durable.operation': 'websocket',
      'graph.read': 'http',
      'graph.command': 'websocket',
      'durable.operation.observe': 'websocket',
      'graph.observe': 'websocket',
    });
    expect(snapshot.transports).toEqual([
      {
        id: 'http',
        capabilities: [
          'operation',
          'durable.operation',
          'graph.read',
          'graph.command',
          'durable.operation.observe',
        ],
      },
      {
        id: 'websocket',
        capabilities: [
          'operation',
          'durable.operation',
          'graph.read',
          'graph.command',
          'durable.operation.observe',
          'graph.observe',
        ],
      },
    ] satisfies RuntimeTransportRoutingSnapshot['transports']);

    await transport.request(
      createRuntimeProtocolRequest({ id: 'read-1', family: 'graph.read', body: null }),
    );
    await transport.request(
      createRuntimeProtocolRequest({ id: 'command-1', family: 'graph.command', body: null }),
    );
    const graphUpdates = [];
    for await (const update of transport.graph!.observe({} as never)) graphUpdates.push(update);

    expect(http.request.mock.calls.map(([request]) => request.family)).toEqual(['graph.read']);
    expect(websocket.request.mock.calls.map(([request]) => request.family)).toEqual([
      'graph.command',
    ]);
    expect(graphUpdates).toHaveLength(1);
    await expect(
      transport.request(
        createRuntimeProtocolRequest({ id: 'future-1', family: 'future.family', body: null }),
      ),
    ).rejects.toThrow(
      'No Runtime Transport route is configured for protocol family "future.family".',
    );
  });

  it('publishes immutable snapshots and rejects unsupported assignments', () => {
    const http = createTransport({ durable: true, source: 'http' });
    const websocket = createTransport({ durable: true, graph: true, source: 'websocket' });
    const transport = createRuntimeTransportRouter({ transports: { http, websocket } });
    const listener = vi.fn();
    const unsubscribe = transport.routing.subscribe(listener);
    const before = transport.routing.inspect();

    transport.routing.configure('graph.read', 'websocket');
    const after = transport.routing.inspect();
    transport.routing.configure('graph.read', 'websocket');
    unsubscribe();
    transport.routing.configure('graph.read', 'http');

    expect(before).not.toBe(after);
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(after.assignments)).toBe(true);
    expect(after.assignments['graph.read']).toBe('websocket');
    expect(listener).toHaveBeenCalledOnce();
    expect(() => transport.routing.configure('graph.observe', 'http')).toThrow(
      'Transport "http" does not support Runtime capability "graph.observe".',
    );
    expect(() => transport.routing.configure('graph.read', 'missing')).toThrow(
      'Runtime transport "missing" is not registered.',
    );
    expect(() => transport.routing.configure('future.family' as never, 'http')).toThrow(
      'Unknown Runtime transport capability "future.family".',
    );
  });

  it('pins an active observation to the route where it started', async () => {
    const http = createTransport({ durable: true, source: 'http' });
    const websocket = createTransport({ durable: true, graph: true, source: 'websocket' });
    const transport = createRuntimeTransportRouter({
      transports: { http, websocket },
      routing: { 'durable.operation.observe': 'websocket' },
    });

    const active = transport.durableOperation!.observe({
      taskId: 'TodoList.completeAll',
      runId: 'run-1',
    });
    transport.routing.configure('durable.operation.observe', 'http');
    const snapshots = [];
    for await (const snapshot of active) snapshots.push(snapshot);

    expect(snapshots).toEqual([taskSnapshot('websocket')]);
  });

  it('validates initial routes and requires at least one transport', () => {
    const http = createTransport({ source: 'http' });
    expect(() =>
      createRuntimeTransportRouter({
        transports: { http },
        routing: { 'durable.operation.observe': 'http' },
      }),
    ).toThrow('Transport "http" does not support Runtime capability "durable.operation.observe".');
    expect(() => createRuntimeTransportRouter({ transports: {} })).toThrow(
      'Runtime Transport router requires at least one transport.',
    );
    expect(() => createRuntimeTransportRouter({ transports: { '': http } })).toThrow(
      'Runtime Transport ids must be non-empty strings.',
    );
    expect(() =>
      createRuntimeTransportRouter({
        transports: { http },
        routing: { ['future.family' as 'graph.read']: 'http' },
      }),
    ).toThrow('Unknown Runtime transport capability "future.family".');
  });
});
