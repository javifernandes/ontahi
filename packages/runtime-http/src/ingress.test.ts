import { graphSchema } from '@ontahi/core/data-graph';
import type { OperationInvocationDispatcher } from '@ontahi/core/runtime/operation-invocation';
import {
  createEventApplication,
  createInMemoryEventRuntime,
  eventDeclaration,
} from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { createHttpIngressHandler } from './ingress.js';

const ExportReady = eventDeclaration.define({
  id: 'TodoListExportReady',
  version: 1,
  description: 'A requested Todo export is ready.',
  payload: graphSchema.object({ requestId: graphSchema.string() }),
});

const provider = {
  receive: async (request: Request) => ({
    kind: 'accepted' as const,
    provider: 'fixture',
    providerKey: 'fixture-webhook',
    channel: request.headers.get('x-channel') ?? undefined,
    event: 'export.ready',
    deliveryId: 'provider-delivery-1',
    payload: await request.json(),
    status: 202,
  }),
};

describe('createHttpIngressHandler', () => {
  it('dispatches Operation and Event routes through one Request/Response handler', async () => {
    const dispatcher = vi.fn<OperationInvocationDispatcher>(async () => ({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success', value: undefined },
    }));
    const events = createEventApplication({
      declarations: [ExportReady],
      runtime: createInMemoryEventRuntime({ createId: () => 'occurrence-1' }),
    });
    const subscriber = vi.fn();
    events.api.subscribe(ExportReady, subscriber);
    const handler = createHttpIngressHandler({
      providers: { 'fixture-webhook': provider },
      operations: {
        routes: [
          {
            operationId: 'Todo.import',
            method: 'POST',
            route: '/hooks/import',
            provider: 'fixture-webhook',
          },
        ],
        dispatcher,
      },
      events: {
        routes: [
          {
            eventId: ExportReady.id,
            eventVersion: ExportReady.version,
            method: 'POST',
            route: '/hooks/export-ready',
            provider: 'fixture-webhook',
            channel: 'todo.export-ready',
          },
        ],
        events: events.api,
      },
    });

    const operationResponse = await handler.handle(
      new Request('http://localhost/hooks/import', {
        method: 'POST',
        body: JSON.stringify({ source: 'fixture' }),
      }),
    );
    const eventResponse = await handler.handle(
      new Request('http://localhost/hooks/export-ready', {
        method: 'POST',
        headers: { 'x-channel': 'todo.export-ready' },
        body: JSON.stringify({ requestId: 'request-1' }),
      }),
    );

    expect(operationResponse.status).toBe(202);
    expect(dispatcher).toHaveBeenCalledWith({
      kind: 'invoke',
      operationId: 'Todo.import',
      input: { source: 'fixture' },
    });
    expect(eventResponse.status).toBe(202);
    await expect(eventResponse.json()).resolves.toMatchObject({
      ok: true,
      occurrenceId: 'occurrence-1',
      eventId: ExportReady.id,
    });
    expect(subscriber).toHaveBeenCalledOnce();
  });

  it('returns a neutral 404 without invoking a provider for unknown paths', async () => {
    const receive = vi.fn(provider.receive);
    const handler = createHttpIngressHandler({
      providers: { fixture: { receive } },
    });

    const response = await handler.handle(new Request('http://localhost/missing'));

    expect(response.status).toBe(404);
    expect(receive).not.toHaveBeenCalled();
  });

  it('rejects ambiguous Operation and Event route paths', () => {
    expect(() =>
      createHttpIngressHandler({
        providers: {},
        operations: {
          routes: [{ operationId: 'Todo.import', method: 'POST', route: '/hooks/shared' }],
          dispatcher: vi.fn(),
        },
        events: {
          routes: [
            {
              eventId: ExportReady.id,
              eventVersion: ExportReady.version,
              method: 'POST',
              route: '/hooks/shared',
              provider: 'fixture',
            },
          ],
          events: createEventApplication({
            declarations: [ExportReady],
            runtime: createInMemoryEventRuntime(),
          }).api,
        },
      }),
    ).toThrow('cannot bind Operation and Event routes to the same path /hooks/shared');
  });
});
