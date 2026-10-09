import { describe, expect, it, vi } from 'vitest';

import { createRuntimeProtocolResponse, runtimeProtocolError } from './envelope.js';
import {
  createRuntimeProtocolExchange,
  createRuntimeProtocolExecutionExchange,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from './transport.js';

describe('Runtime Protocol exchange', () => {
  it('creates a fresh correlated envelope and forwards transport-local request options', async () => {
    type RequestOptions = { readonly credential: string };
    const request = vi.fn<RuntimeTransport<RequestOptions>['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, { kind: 'family-result' }),
    );
    const requestIds = ['exchange-1', 'exchange-2'][Symbol.iterator]();
    const exchange = createRuntimeProtocolExchange<RequestOptions>({
      transport: { request },
      requestId: () => requestIds.next().value ?? 'unexpected',
    });
    const controller = new AbortController();
    const options: RuntimeTransportRequestOptions<RequestOptions> = {
      signal: controller.signal,
      transportOptions: { credential: 'browser-session' },
    };

    await expect(
      exchange({ family: 'graph.read', body: { version: 1, kind: 'graph-read' } }, options),
    ).resolves.toEqual({ kind: 'family-result' });
    await expect(
      exchange({ family: 'operation', body: { version: 1, kind: 'invoke' } }),
    ).resolves.toEqual({ kind: 'family-result' });

    expect(request).toHaveBeenNthCalledWith(
      1,
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'exchange-1',
        kind: 'request',
        family: 'graph.read',
        body: { version: 1, kind: 'graph-read' },
      },
      options,
    );
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      id: 'exchange-2',
      family: 'operation',
    });
  });

  it('fails closed for common errors and mismatched responses without replaying the request', async () => {
    const commonErrorRequest = vi.fn<RuntimeTransport['request']>(async envelope =>
      runtimeProtocolError('family_unavailable', 'Family unavailable.', {
        id: envelope.id,
        family: envelope.family,
      }),
    );
    const commonErrorExchange = createRuntimeProtocolExchange({
      transport: { request: commonErrorRequest },
      requestId: () => 'exchange-error',
    });

    await expect(
      commonErrorExchange({
        family: 'graph.command',
        body: { version: 1, kind: 'graph-command' },
      }),
    ).rejects.toThrow('Family unavailable.');
    expect(commonErrorRequest).toHaveBeenCalledOnce();

    const mismatchedRequest = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse({ ...envelope, id: 'another-exchange' }, { kind: 'result' }),
    );
    const mismatchedExchange = createRuntimeProtocolExchange({
      transport: { request: mismatchedRequest },
      requestId: () => 'exchange-mismatch',
    });

    await expect(
      mismatchedExchange({ family: 'operation', body: { version: 1, kind: 'invoke' } }),
    ).rejects.toThrow('Runtime Protocol response is invalid or mismatched.');
    expect(mismatchedRequest).toHaveBeenCalledOnce();
  });

  it('advertises and preserves committed mutation metadata for execution exchanges', async () => {
    const metadata = {
      committedMutations: {
        precision: 'exact' as const,
        mutations: [],
      },
    };
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, { kind: 'family-result' }, metadata),
    );
    const exchange = createRuntimeProtocolExecutionExchange({
      transport: { request },
      requestId: () => 'execution-1',
    });

    await expect(
      exchange({ family: 'operation', body: { version: 1, kind: 'invoke' } }),
    ).resolves.toEqual({ body: { kind: 'family-result' }, metadata });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      accepts: ['committed-mutations.v1'],
    });
  });

  it('accepts execution responses without metadata and surfaces protocol errors', async () => {
    const request = vi
      .fn<RuntimeTransport['request']>()
      .mockImplementationOnce(async envelope =>
        createRuntimeProtocolResponse(envelope, { kind: 'family-result' }),
      )
      .mockImplementationOnce(async envelope =>
        runtimeProtocolError('dispatch_unavailable', 'Try again.', {
          id: envelope.id,
          family: envelope.family,
        }),
      );
    const exchange = createRuntimeProtocolExecutionExchange({ transport: { request } });

    await expect(
      exchange({ family: 'operation', body: { version: 1, kind: 'invoke' } }),
    ).resolves.toEqual({ body: { kind: 'family-result' } });
    await expect(
      exchange({ family: 'operation', body: { version: 1, kind: 'invoke' } }),
    ).rejects.toThrow('Try again.');
  });
});
