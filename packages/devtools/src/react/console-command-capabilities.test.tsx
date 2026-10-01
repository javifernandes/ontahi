import { isJsonValue } from '@ontahi/core';
import type { EntityMutationAffordanceDescriptor } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  createRuntimeTransportRouter,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from '@ontahi/core/runtime/protocol';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConsoleCommandCapabilities } from './console-command-capabilities.js';

afterEach(cleanup);

const updateAffordance: EntityMutationAffordanceDescriptor = {
  kind: 'entity-mutation-affordance',
  entityName: 'Document',
  action: 'update',
  target: {
    exact: {
      reference: { kind: 'entity-ref', entityName: 'Document' },
      locator: {
        kind: 'object',
        role: 'object',
        unknownKeys: 'strict',
        fields: { id: { kind: 'scalar', type: 'id' } },
      },
    },
  },
  values: {
    kind: 'object',
    role: 'object',
    unknownKeys: 'strict',
    fields: { title: { kind: 'scalar', type: 'string' } },
  },
};

const pendingTransport = () => {
  const pending: {
    envelope: RuntimeProtocolRequestEnvelope;
    resolve: (response: RuntimeProtocolResponseEnvelope) => void;
  }[] = [];
  const request = vi.fn(
    (envelope: RuntimeProtocolRequestEnvelope) =>
      new Promise<RuntimeProtocolResponseEnvelope>(resolve => pending.push({ envelope, resolve })),
  );
  const reply = (
    index: number,
    entityName: string,
    affordances: readonly EntityMutationAffordanceDescriptor[] = [],
  ) => {
    const call = pending[index]!;
    const body = {
      kind: 'graph-command-capabilities-result',
      entityName,
      capabilities: {
        entityMutations: affordances.map(affordance => affordance.action),
        entityMutationAffordances: affordances,
      },
    } as const;
    if (!isJsonValue(body)) throw new Error('Expected portable Command capabilities.');
    call.resolve(createRuntimeProtocolResponse(call.envelope, body));
  };
  return { transport: { request }, reply };
};

describe('Console Command capability discovery', () => {
  it('publishes validated affordances and invalidates them across authority and Entity changes', async () => {
    const { transport, reply } = pendingTransport();
    const { result, rerender } = renderHook(
      ({ identityKey, entityNames }) =>
        useConsoleCommandCapabilities(transport, identityKey, entityNames),
      { initialProps: { identityKey: 'alice', entityNames: ['Document'] } },
    );
    await act(async () => reply(0, 'Document', [updateAffordance]));
    expect(result.current('Document')?.affordances).toEqual([updateAffordance]);

    rerender({ identityKey: 'bob', entityNames: ['Other'] });
    expect(result.current('Document')).toBeUndefined();
    await act(async () => reply(1, 'Other'));
    expect(result.current('Other')?.actions).toEqual([]);
  });

  it('drops metadata when graph.command routing changes on the same transport', async () => {
    const first = pendingTransport();
    const second = pendingTransport();
    const router = createRuntimeTransportRouter({
      transports: { first: first.transport, second: second.transport },
    });
    const { result } = renderHook(() =>
      useConsoleCommandCapabilities(router, 'alice', ['Document']),
    );
    await act(async () => first.reply(0, 'Document', [updateAffordance]));
    expect(result.current('Document')?.affordances).toEqual([updateAffordance]);

    act(() => router.routing.configure('graph.command', 'second'));
    expect(result.current('Document')).toBeUndefined();
    await act(async () => second.reply(0, 'Document'));
    expect(result.current('Document')?.actions).toEqual([]);
  });

  it('ignores late capability metadata after replacing the transport', async () => {
    const first = pendingTransport();
    const second = pendingTransport();
    const { result, rerender } = renderHook(
      ({ transport }) => useConsoleCommandCapabilities(transport, 'alice', ['Document']),
      { initialProps: { transport: first.transport } },
    );
    rerender({ transport: second.transport });
    expect(result.current('Document')).toBeUndefined();
    await act(async () => {
      first.reply(0, 'Document', [updateAffordance]);
      second.reply(0, 'Document');
    });
    expect(result.current('Document')?.actions).toEqual([]);
  });

  it('rejects an affordance for a different Entity', async () => {
    const { transport, reply } = pendingTransport();
    const { result } = renderHook(() =>
      useConsoleCommandCapabilities(transport, 'alice', ['Other']),
    );
    await act(async () => reply(0, 'Other', [updateAffordance]));
    expect(result.current('Other')?.actions).toBeUndefined();
    expect(result.current('Other')?.error).toBe(
      'This server returned mismatched Graph Command capabilities.',
    );
  });
});
