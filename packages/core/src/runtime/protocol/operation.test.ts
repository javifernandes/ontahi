import { describe, expect, expectTypeOf, it } from 'vitest';

import { entity, field } from '../../data-graph/index.js';
import {
  isOperationInvocationProtocolResponse,
  type OperationInvocationRequest,
} from '../operation-invocation.js';

import {
  createRuntimeProtocolRegistry,
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  parseOperationProtocolRequest,
  runtimeProtocolFamilies,
  toOperationProtocolRequest,
  type OperationProtocolRequestV1,
} from './index.js';

describe('Runtime Protocol Operation family', () => {
  it('authors canonical version 1 invocation and permission bodies', () => {
    expect(
      toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { bookId: 'book-1', title: 'Ontahí' },
      }),
    ).toEqual({
      version: 1,
      kind: 'invoke',
      operationId: 'Book.rename',
      input: { bookId: 'book-1', title: 'Ontahí' },
    });
    expect(
      toOperationProtocolRequest({
        kind: 'check-permission',
        operationId: 'Book.rename',
        input: { bookId: 'book-1' },
      }),
    ).toEqual({
      version: 1,
      kind: 'check-permission',
      operationId: 'Book.rename',
      input: { bookId: 'book-1' },
    });
  });

  it('omits absent input and preserves a portable invocation View', () => {
    const Trip = entity('Trip', { id: field.id(), status: field.string() });
    const view = Trip.view('TripList', { id: true }).toJSON();

    expect(
      toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'Trip.available',
        view,
      }),
    ).toEqual({
      version: 1,
      kind: 'invoke',
      operationId: 'Trip.available',
      view,
    });
  });

  it.each([
    {
      name: 'non-object body',
      body: null,
      code: 'invalid_request',
    },
    {
      name: 'unsupported version',
      body: { version: 2, kind: 'invoke', operationId: 'Book.rename', input: {} },
      code: 'unsupported_version',
    },
    {
      name: 'unknown strict key',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'Book.rename',
        input: {},
        guarantee: 'atomic',
      },
      code: 'invalid_request',
    },
    {
      name: 'non-JSON input',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { execute: () => undefined },
      },
      code: 'invalid_request',
    },
    {
      name: 'View on permission check',
      body: {
        version: 1,
        kind: 'check-permission',
        operationId: 'Book.rename',
        view: {},
      },
      code: 'invalid_request',
    },
  ])('fails closed for an $name', ({ body, code }) => {
    expect(parseOperationProtocolRequest(body)).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code } },
    });
  });

  it('rejects non-portable authored input before transport', () => {
    expect(() =>
      toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { execute: () => undefined },
      }),
    ).toThrow('Operation protocol request must be JSON-safe.');
  });

  it('registers a typed Operation request beside the Data Graph families', () => {
    const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);
    const request = createRuntimeProtocolRequest({
      id: 'exchange-1',
      family: 'operation',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { bookId: 'book-1', title: 'Ontahí' },
      },
    });
    const parsed = registry.parseRequest(JSON.parse(JSON.stringify(request)));

    expect(parsed).toEqual({ success: true, request });
    if (parsed.success && parsed.request.family === 'operation') {
      expectTypeOf(parsed.request.body).toEqualTypeOf<OperationProtocolRequestV1>();
      const dispatchable: OperationInvocationRequest = parsed.request.body;
      expect(dispatchable).toMatchObject({ kind: 'invoke', operationId: 'Book.rename' });
    }
  });

  it('keeps Durable start as invocation and its run identity distinct from exchange identity', () => {
    const request = createRuntimeProtocolRequest({
      id: 'exchange-1',
      family: 'operation',
      body: toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'Book.import',
        input: { source: 'catalogue' },
      }),
    });
    const body = {
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { taskId: 'book.import', runId: 'run-1' },
      },
    } as const;
    const response = createRuntimeProtocolResponse(request, body);

    expect(response).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-1',
      kind: 'response',
      family: 'operation',
      body,
    });
    expect(isOperationInvocationProtocolResponse(response.body)).toBe(true);
    expect(response.id).not.toBe(response.body.result.value.runId);
  });
});
