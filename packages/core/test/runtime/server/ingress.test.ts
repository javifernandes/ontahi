import { describe, expect, it } from 'vitest';

import {
  createGraphHttpIngressOperationDispatcher,
  createGraphHttpIngressRoute,
  createGraphHttpIngressRouter,
} from '../../../src/runtime/server/ingress.js';

describe('createGraphHttpIngressRoute', () => {
  it('returns accepted provider outcomes as JSON responses', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          event: 'push',
          deliveryId: 'delivery-1',
          status: 202,
          details: {
            accepted: true,
          },
        }),
      },
    });

    const response = await route(new Request('http://localhost/api/ingress/fixture'));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      provider: 'fixture',
      event: 'push',
      deliveryId: 'delivery-1',
      accepted: true,
    });
  });

  it('returns rejected provider outcomes as JSON errors', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'rejected',
          status: 401,
          error: 'Invalid signature',
        }),
      },
    });

    const response = await route(new Request('http://localhost/api/ingress/fixture'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid signature',
    });
  });

  it('dispatches accepted outcomes to matching graph ingress routes', async () => {
    const dispatched: unknown[] = [];
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          providerKey: 'fixture-webhook',
          channel: 'source-control.push',
          event: 'push',
          deliveryId: 'delivery-1',
          payload: { branch: 'main' },
          status: 202,
        }),
      },
      route: '/api/ingress/fixture',
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      dispatch: async input => {
        dispatched.push(input);
      },
    });

    const response = await route(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(202);
    expect(dispatched).toEqual([
      {
        operationId: 'Book.syncFromFixturePush',
        payload: { branch: 'main' },
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      },
    ]);
  });

  it('returns a JSON failure when a matched ingress operation fails', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          providerKey: 'fixture-webhook',
          channel: 'source-control.push',
          event: 'push',
          deliveryId: 'delivery-1',
        }),
      },
      route: '/api/ingress/fixture',
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      dispatch: async () => {
        throw new Error('Sync failed');
      },
    });

    const response = await route(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Sync failed',
    });
  });
});

describe('createGraphHttpIngressRouter', () => {
  it('returns 404 before provider parsing when no route matches the request', async () => {
    const router = createGraphHttpIngressRouter({
      routes: [],
      providers: {
        fixture: {
          receive: async () => {
            throw new Error('provider should not be called');
          },
        },
      },
      dispatch: async () => {
        throw new Error('dispatch should not be called');
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/missing', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'No HTTP ingress route matches this request.',
    });
  });

  it('returns a configuration error when the matched provider is not registered', async () => {
    const router = createGraphHttpIngressRouter({
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      providers: {},
      dispatch: async () => {
        throw new Error('dispatch should not be called');
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'HTTP ingress provider "fixture-webhook" is not registered.',
    });
  });

  it('uses the matched route provider and dispatches the matching graph operation', async () => {
    const dispatched: unknown[] = [];
    const router = createGraphHttpIngressRouter({
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      providers: {
        'fixture-webhook': {
          receive: async () => ({
            kind: 'accepted',
            provider: 'fixture',
            providerKey: 'fixture-webhook',
            channel: 'source-control.push',
            event: 'push',
            deliveryId: 'delivery-1',
            payload: { branch: 'main' },
          }),
        },
      },
      dispatch: async input => {
        dispatched.push(input);
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(dispatched).toEqual([
      {
        operationId: 'Book.syncFromFixturePush',
        payload: { branch: 'main' },
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      },
    ]);
  });
});

describe('createGraphHttpIngressOperationDispatcher', () => {
  it('invokes operations through the canonical dispatcher', async () => {
    const invocationCalls: unknown[] = [];
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async request => {
        invocationCalls.push(request);
        return {
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: undefined },
        };
      },
    });

    await dispatch({
      operationId: 'Book.syncFromFixturePush',
      payload: { branch: 'main' },
      route: {
        operationId: 'Book.syncFromFixturePush',
        method: 'POST',
        route: '/api/ingress/fixture',
      },
    });

    expect(invocationCalls).toEqual([
      {
        kind: 'invoke',
        operationId: 'Book.syncFromFixturePush',
        input: { branch: 'main' },
      },
    ]);
  });

  it('fails when the dispatcher rejects the operation id', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async request => ({
        kind: 'invocation-result',
        result: {
          ok: false,
          kind: 'rejected',
          executed: false,
          reason: 'unknown_operation',
          message: `Unknown operation "${request.operationId}".`,
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.missing',
        payload: {},
        route: {
          operationId: 'Book.missing',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Unknown operation "Book.missing".');
  });

  it('fails when operation invocation returns a failed result', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async () => ({
        kind: 'invocation-result',
        result: {
          ok: false,
          kind: 'failed',
          executed: true,
          failure: { reason: 'sync_failed' },
          message: 'Sync failed',
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.syncFromFixturePush',
        payload: {},
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Sync failed');
  });

  it('fails when the operation invocation transport is unavailable', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async () => ({
        kind: 'protocol-error',
        error: {
          code: 'invocation_unavailable',
          message: 'Runtime unavailable',
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.syncFromFixturePush',
        payload: {},
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Runtime unavailable');
  });
});
