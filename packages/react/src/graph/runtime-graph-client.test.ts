import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeGraphClient } from './runtime-graph-client.js';

describe('Runtime Graph client', () => {
  it('assembles graph and operation capabilities around one Runtime Transport', () => {
    const runtimeTransport = { request: vi.fn() } as unknown as RuntimeTransport;
    const requestId = () => 'request-1';

    const client = createRuntimeGraphClient({
      runtimeTransport,
      requestId,
      reflectedEntityData: false,
      reflectedRelatedEntityData: false,
    });

    expect(client.runtimeTransport).toBe(runtimeTransport);
    expect(client.graph).toBeDefined();
    expect(client.graphExecutor.run).toBeTypeOf('function');
    expect(client.operationBridgeAdapters).toHaveLength(1);
    expect(client.reflectedOperationInvoker?.invokeOperation).toBeTypeOf('function');
    expect(client.reflectedEntityDataReader).toBeUndefined();
    expect(client.reflectedRelatedEntityDataReader).toBeUndefined();
  });

  it('includes the optional reflected readers by default', () => {
    const runtimeTransport = { request: vi.fn() } as unknown as RuntimeTransport;

    const client = createRuntimeGraphClient({ runtimeTransport });

    expect(client.reflectedEntityDataReader?.readEntityData).toBeTypeOf('function');
    expect(client.reflectedRelatedEntityDataReader?.readRelatedEntityData).toBeTypeOf('function');
  });
});
