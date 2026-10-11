import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createDiagnosticRuntimeTransportRouter } from './diagnostic-runtime-transport-router.js';
import { getRuntimeTransportDiagnostics } from './instrument-runtime-transport.js';

const runtimeRequest = createRuntimeProtocolRequest({
  id: 'read-1',
  family: 'graph.read',
  body: { query: 'todos' },
});

describe('createDiagnosticRuntimeTransportRouter', () => {
  it('instruments described transports and associates diagnostics with the routed transport', async () => {
    const runtimeTransport = createDiagnosticRuntimeTransportRouter({
      diagnostics: {},
      transports: {
        http: {
          descriptor: { kind: 'fetch' },
          request: vi
            .fn()
            .mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, { rows: 1 })),
        },
      },
    });

    await runtimeTransport.request(runtimeRequest);

    expect(getRuntimeTransportDiagnostics(runtimeTransport)?.inspect().events).toMatchObject([
      { kind: 'exchange.started', transportId: 'http', transportKind: 'fetch' },
      { kind: 'exchange.settled', transportId: 'http', transportKind: 'fetch' },
    ]);
  });

  it('keeps routing available without allocating diagnostics when disabled', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, { rows: 1 }));
    const runtimeTransport = createDiagnosticRuntimeTransportRouter({
      diagnostics: false,
      transports: { http: { descriptor: { kind: 'fetch' }, request } },
    });

    await runtimeTransport.request(runtimeRequest);

    expect(request).toHaveBeenCalledOnce();
    expect(getRuntimeTransportDiagnostics(runtimeTransport)).toBeUndefined();
  });
});
