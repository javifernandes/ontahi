import {
  createRuntimeProtocolResponse,
  createRuntimeTransportRouter,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from '@ontahi/core/runtime/protocol';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConsoleReadCapabilities } from './console-read-capabilities.js';

afterEach(cleanup);

const pendingTransport = () => {
  const pending: {
    envelope: RuntimeProtocolRequestEnvelope;
    resolve: (response: RuntimeProtocolResponseEnvelope) => void;
  }[] = [];
  const request = vi.fn(
    (envelope: RuntimeProtocolRequestEnvelope) =>
      new Promise<RuntimeProtocolResponseEnvelope>(resolve => {
        pending.push({ envelope, resolve });
      }),
  );
  const reply = (index: number, entityName: string, orderBy: string[]) => {
    const call = pending[index]!;
    call.resolve(
      createRuntimeProtocolResponse(call.envelope, {
        kind: 'graph-read-capabilities-result',
        entityName,
        capabilities: { orderBy },
      }),
    );
  };
  return { transport: { request }, pending, reply };
};

describe('Console capabilities discovery', () => {
  it('refreshes metadata when graph.read routing changes inside the same transport', async () => {
    const first = pendingTransport();
    const second = pendingTransport();
    const router = createRuntimeTransportRouter({
      transports: { first: first.transport, second: second.transport },
    });
    const { result } = renderHook(() => useConsoleReadCapabilities(router, 'Tag'));
    await act(async () => {
      first.reply(0, 'Tag', ['id']);
    });
    expect(result.current.orderableFields('Tag')).toEqual(['id']);
    act(() => router.routing.configure('graph.read', 'second'));
    expect(result.current.orderableFields('Tag')).toEqual([]);
    await act(async () => {
      second.reply(0, 'Tag', ['name']);
    });
    expect(result.current.orderableFields('Tag')).toEqual(['name']);
  });

  it('ignores late replies after Entity and transport changes and never executes a data read', async () => {
    const first = pendingTransport();
    const second = pendingTransport();
    const { result, rerender } = renderHook(
      ({ transport, entityName }) => useConsoleReadCapabilities(transport, entityName),
      {
        initialProps: { transport: first.transport, entityName: 'Tag' },
      },
    );
    expect(result.current.loading).toBe(true);
    rerender({ transport: first.transport, entityName: 'Other' });
    await act(async () => {
      first.reply(0, 'Tag', ['secret']);
    });
    expect(result.current.orderableFields('Tag')).toEqual([]);
    expect(result.current.loading).toBe(true);
    rerender({ transport: second.transport, entityName: 'Other' });
    await act(async () => {
      first.reply(1, 'Other', ['old']);
      second.reply(0, 'Other', ['name']);
    });
    expect(result.current.orderableFields('Other')).toEqual(['name']);
    expect(result.current.orderableFields('Tag')).toEqual([]);
    expect(
      [...first.transport.request.mock.calls, ...second.transport.request.mock.calls].map(
        ([envelope]) => envelope.body,
      ),
    ).toEqual([
      { version: 1, kind: 'graph-read-capabilities', entityName: 'Tag' },
      { version: 1, kind: 'graph-read-capabilities', entityName: 'Other' },
      { version: 1, kind: 'graph-read-capabilities', entityName: 'Other' },
    ]);
  });

  it('rejects mismatched Entity replies and retries metadata independently', async () => {
    const { transport, reply } = pendingTransport();
    const { result } = renderHook(() => useConsoleReadCapabilities(transport, 'Tag'));
    await act(async () => {
      reply(0, 'Other', ['secret']);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.orderableFields('Tag')).toEqual([]);
    act(() => result.current.refresh());
    await act(async () => {
      reply(1, 'Tag', ['name']);
    });
    await waitFor(() => expect(result.current.orderableFields('Tag')).toEqual(['name']));
    expect(result.current.error).toBeUndefined();
  });
});
