import { createEntityRef, entity, field, graphSchema, Selection } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createFetchOperationBridgeAdapter, type BridgedOperationLike } from './index.js';

const operation: BridgedOperationLike<{ id: string }, { completed: boolean }> = {
  kind: 'domain-operation',
  authority: 'server',
  exposure: 'bridge',
  entityName: 'Todo',
  name: 'complete',
  id: 'Todo.complete',
  bridge: {},
};

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const QueryWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return QueryWrapper;
};

describe('Fetch Operation bridge adapter', () => {
  it('invokes Operations through the versioned Operation family', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: { completed: true } },
      }),
    );
    const adapter = createFetchOperationBridgeAdapter({
      runtimeTransport: { request },
      requestId: () => 'operation-invoke-1',
    });
    const { result } = renderHook(() => adapter.useBridgeAction(operation));

    let invocation: unknown;
    await act(async () => {
      invocation = await result.current({ id: 'todo-1' });
    });

    expect(invocation).toEqual({
      data: { ok: true, kind: 'success', value: { completed: true } },
    });
    expect(request).toHaveBeenCalledWith(
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'operation-invoke-1',
        kind: 'request',
        family: 'operation',
        body: {
          version: 1,
          kind: 'invoke',
          operationId: 'Todo.complete',
          input: { id: 'todo-1' },
        },
      },
      undefined,
    );
  });

  it('checks permission through the same Operation family without client-authored authority', async () => {
    const requests: RuntimeProtocolRequestEnvelope[] = [];
    const transport: RuntimeTransport = {
      request: async envelope => {
        requests.push(envelope);
        return createRuntimeProtocolResponse(envelope, {
          kind: 'permission-result',
          result: { allowed: false, reason: 'not-owner', message: 'Only the owner may complete.' },
        });
      },
    };
    const adapter = createFetchOperationBridgeAdapter({
      runtimeTransport: transport,
      requestId: () => 'operation-permission-1',
    });
    const { result } = renderHook(() => adapter.usePermission(operation, { id: 'todo-1' }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      allowed: false,
      reason: 'not-owner',
      message: 'Only the owner may complete.',
    });
    expect(requests).toEqual([
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'operation-permission-1',
        kind: 'request',
        family: 'operation',
        body: {
          version: 1,
          kind: 'check-permission',
          operationId: 'Todo.complete',
          input: { id: 'todo-1' },
        },
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain('authority');
  });

  it('turns schema Selection inputs into portable ASTs before Runtime Protocol validation', async () => {
    const Todo = entity('Todo', { id: field.id() }).locators({ refById: 'id' }).identity('refById');
    const selectionOperation = {
      kind: 'domain-operation',
      authority: 'server',
      exposure: 'bridge',
      entityName: 'Todo',
      name: 'complete',
      id: 'Todo.complete',
      bridge: {},
      input: graphSchema.object({
        todos: graphSchema.selection(Todo, { cardinality: 'many' }),
      }),
    } as unknown as BridgedOperationLike<{ todos: Selection<typeof Todo> }, null>;
    const requests: RuntimeProtocolRequestEnvelope[] = [];
    const adapter = createFetchOperationBridgeAdapter({
      runtimeTransport: {
        request: async envelope => {
          requests.push(envelope);
          return createRuntimeProtocolResponse(envelope, {
            kind: 'invocation-result',
            result: { ok: true, kind: 'success', value: null },
          });
        },
      },
    });
    const { result } = renderHook(() => adapter.useBridgeAction(selectionOperation));

    await act(async () => {
      await result.current({
        todos: Selection.references(Todo, [createEntityRef(Todo, { id: 'todo-1' })]),
      });
    });

    expect(requests[0]?.body).toEqual({
      version: 1,
      kind: 'invoke',
      operationId: 'Todo.complete',
      input: {
        todos: {
          kind: 'selection',
          entityName: 'Todo',
          expression: {
            kind: 'references',
            refs: [{ kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-1' } }],
          },
        },
      },
    });
  });
});
