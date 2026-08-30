import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  graphCommandProtocolError,
  mutateEntity,
  toGraphCommandRequest,
  type GraphCommandDispatcher,
  type GraphReadDispatcher,
} from '../../data-graph/index.js';
import type {
  OperationInvocationDispatcher,
  OperationInvocationProtocolResponse,
} from '../operation-invocation.js';

import {
  createRuntimeProtocolDispatcher,
  createRuntimeProtocolRequest,
  parseRuntimeProtocolResponse,
  type RuntimeProtocolDispatchContext,
  type RuntimeProtocolDispatcher,
} from './index.js';

const Book = entity('Book', {
  id: field.id(),
  title: field.string(),
});

const operationBody = {
  version: 1,
  kind: 'check-permission',
  operationId: 'Book.rename',
  input: { bookId: 'book-1' },
} as const;

const graphReadBody = {
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'Book',
    expression: { kind: 'all' },
  },
  orderBy: [],
} as const;

const graphCommandBody = toGraphCommandRequest(
  mutateEntity(Book).update(createEntityRef(Book, { id: 'book-1' }), {
    title: 'Runtime Protocol',
  }),
);

const request = <const TFamily extends string, TBody>(id: string, family: TFamily, body: TBody) =>
  createRuntimeProtocolRequest({ id, family, body });

describe('Runtime Protocol dispatcher', () => {
  it('routes every canonical family with receiver context and correlates complete family bodies', async () => {
    const context = { authority: { subject: 'user-1' } };
    const operationResult = {
      kind: 'permission-result',
      result: { allowed: true },
    } as const;
    const readResult = {
      kind: 'graph-read-result',
      value: [{ id: 'book-1', title: 'Runtime Protocol' }],
    } as const;
    const commandResult = graphCommandProtocolError(
      'access_denied',
      'Data graph Command access denied.',
    );
    const operation = vi.fn(async () => operationResult);
    const graphRead = vi.fn(async () => readResult);
    const graphCommand = vi.fn(async () => commandResult);
    const dispatch = createRuntimeProtocolDispatcher({
      handlers: {
        operation,
        'graph.read': graphRead,
        'graph.command': graphCommand,
      },
    });

    const [operationResponse, readResponse, commandResponse] = await Promise.all([
      dispatch(request('exchange-operation', 'operation', operationBody), context),
      dispatch(request('exchange-read', 'graph.read', graphReadBody), context),
      dispatch(request('exchange-command', 'graph.command', graphCommandBody), context),
    ]);

    expect(operation).toHaveBeenCalledWith(operationBody, context);
    expect(graphRead).toHaveBeenCalledWith(graphReadBody, context);
    expect(graphCommand).toHaveBeenCalledWith(graphCommandBody, context);
    expect(operationResponse).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-operation',
      kind: 'response',
      family: 'operation',
      body: operationResult,
    });
    expect(readResponse).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-read',
      kind: 'response',
      family: 'graph.read',
      body: readResult,
    });
    expect(commandResponse).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-command',
      kind: 'response',
      family: 'graph.command',
      body: commandResult,
    });
  });

  it('rejects malformed envelopes and family bodies before any handler executes', async () => {
    const operation = vi.fn();
    const graphRead = vi.fn();
    const graphCommand = vi.fn();
    const dispatch = createRuntimeProtocolDispatcher({
      handlers: {
        operation,
        'graph.read': graphRead,
        'graph.command': graphCommand,
      },
    });

    const invalidEnvelope = await dispatch(null, { authority: null });
    const invalidBody = await dispatch(
      request('exchange-invalid', 'operation', {
        ...operationBody,
        version: 2,
      }),
      { authority: null },
    );

    expect(invalidEnvelope).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_envelope' },
    });
    expect(invalidBody).toMatchObject({
      id: 'exchange-invalid',
      family: 'operation',
      kind: 'protocol-error',
      error: {
        code: 'invalid_family_request',
        details: { familyError: { error: { code: 'unsupported_version' } } },
      },
    });
    expect(operation).not.toHaveBeenCalled();
    expect(graphRead).not.toHaveBeenCalled();
    expect(graphCommand).not.toHaveBeenCalled();
  });

  it('distinguishes an unknown family from a known family unavailable in this runtime', async () => {
    const dispatch = createRuntimeProtocolDispatcher({ handlers: {} });
    const readRequest = request('exchange-read', 'graph.read', graphReadBody);

    const unknown = await dispatch(request('exchange-unknown', 'missing.family', {}), {
      authority: null,
    });
    const unavailable = await dispatch(readRequest, { authority: null });

    expect(unknown).toMatchObject({
      id: 'exchange-unknown',
      family: 'missing.family',
      kind: 'protocol-error',
      error: { code: 'unknown_family' },
    });
    expect(unavailable).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-read',
      kind: 'protocol-error',
      family: 'graph.read',
      error: {
        code: 'family_unavailable',
        message: 'Runtime Protocol family graph.read is unavailable in this runtime.',
      },
    });
    expect(parseRuntimeProtocolResponse(unavailable, readRequest)).toEqual({
      success: true,
      response: unavailable,
    });
  });

  it('reports handler failures and returns a safe correlated protocol error', async () => {
    const privateError = new Error('database password leaked');
    const reportError = vi.fn();
    const dispatch = createRuntimeProtocolDispatcher({
      handlers: {
        operation: async () => {
          throw privateError;
        },
      },
      reportError,
    });
    const runtimeRequest = request('exchange-failed', 'operation', operationBody);

    const response = await dispatch(runtimeRequest, { authority: null });

    expect(reportError).toHaveBeenCalledWith(privateError, runtimeRequest);
    expect(response).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-failed',
      kind: 'protocol-error',
      family: 'operation',
      error: {
        code: 'dispatch_unavailable',
        message: 'Runtime Protocol family operation dispatch is temporarily unavailable.',
      },
    });
    expect(parseRuntimeProtocolResponse(response, runtimeRequest)).toEqual({
      success: true,
      response,
    });
    expect(JSON.stringify(response)).not.toContain('database password');
  });

  it('rejects and reports a non-portable handler response', async () => {
    const reportError = vi.fn();
    const dispatch = createRuntimeProtocolDispatcher({
      handlers: {
        operation: async () => ({ kind: 'result', execute: () => undefined }),
      },
      reportError,
    });
    const runtimeRequest = request('exchange-invalid-response', 'operation', operationBody);

    const response = await dispatch(runtimeRequest, { authority: null });

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.any(TypeError), runtimeRequest);
    expect(response).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-invalid-response',
      kind: 'protocol-error',
      family: 'operation',
      error: {
        code: 'invalid_response',
        message: 'Runtime Protocol family operation returned a non-portable response.',
      },
    });
  });

  it('accepts the existing family dispatcher contracts without adapters', () => {
    type Context = { authority: { subject: string } };

    const operation = vi.fn(
      async (): Promise<OperationInvocationProtocolResponse> => ({
        kind: 'permission-result',
        result: { allowed: true },
      }),
    ) as OperationInvocationDispatcher;
    const graphRead = vi.fn(async () => ({
      kind: 'graph-read-result' as const,
      value: [],
    })) as GraphReadDispatcher<Context['authority']>;
    const graphCommand = vi.fn(async () =>
      graphCommandProtocolError('access_denied', 'Denied.'),
    ) as GraphCommandDispatcher<Context['authority']>;

    const dispatch = createRuntimeProtocolDispatcher<Context>({
      handlers: {
        operation,
        'graph.read': graphRead,
        'graph.command': graphCommand,
      },
    });

    expectTypeOf(dispatch).toEqualTypeOf<RuntimeProtocolDispatcher<Context>>();
    expectTypeOf<RuntimeProtocolDispatchContext<typeof dispatch>>().toEqualTypeOf<Context>();
  });

  it('rejects unknown and malformed handler registrations eagerly', () => {
    expect(() =>
      createRuntimeProtocolDispatcher({
        handlers: { 'missing.family': vi.fn() },
      } as never),
    ).toThrow('Unknown Runtime Protocol handler family missing.family.');
    expect(() =>
      createRuntimeProtocolDispatcher({
        handlers: { operation: true },
      } as never),
    ).toThrow('Runtime Protocol handler operation must be a function.');
  });
});
