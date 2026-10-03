import {
  createEntityRef,
  defineClientDomainOperation,
  entity,
  field,
  graphSchema,
  mutateEntity,
  toGraphCommandRequest,
} from '@ontahi/core/data-graph';
import type { ModelCommandCanonicalRequest } from '@ontahi/core/runtime/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  invalidateCanonicalRequest,
  useCanonicalRequestInvalidation,
} from './canonical-request-invalidation.js';

const TodoList = entity('TodoList', { id: field.id() });
const TodoItem = entity('TodoItem', { id: field.id() });
const operation = {
  ...defineClientDomainOperation({
    authority: 'server',
    exposure: 'bridge',
    bridge: { invalidate: [['TodoList'], ['TodoItem']] },
    input: graphSchema.object({ list: graphSchema.ref(TodoList) }),
    output: graphSchema.object({ completed: field.nonNegativeInteger() }),
  }),
  id: 'TodoList.completeAll',
  entityName: 'TodoList',
  name: 'completeAll',
};
const operations = new Map([[operation.id, operation]]);
const invocation: ModelCommandCanonicalRequest = {
  kind: 'invoke',
  operationId: operation.id,
  input: { list: createEntityRef(TodoList, { id: 'later' }) },
};

describe('canonical request invalidation', () => {
  it('does not invalidate for Graph Reads', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = await invalidateCanonicalRequest(
      queryClient,
      {
        version: 2,
        kind: 'graph-read',
        selection: {
          kind: 'selection',
          entityName: 'TodoList',
          expression: { kind: 'all' },
        },
        mode: 'run',
        orderBy: [],
      },
      operations,
    );
    expect(result).toEqual({ kind: 'read', queryKeys: [] });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('derives Graph Command invalidation from its affected Entity', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const request = toGraphCommandRequest(
      mutateEntity(TodoList).update(createEntityRef(TodoList, { id: 'later' }), {}),
    );
    await expect(invalidateCanonicalRequest(queryClient, request, operations)).resolves.toEqual({
      kind: 'graph-command',
      queryKeys: [['TodoList']],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['TodoList'] });
  });

  it('invalidates both Entity roots participating in a Relationship Command', async () => {
    const queryClient = new QueryClient();
    const request: ModelCommandCanonicalRequest = {
      version: 1,
      kind: 'graph-command',
      command: {
        kind: 'relationship-command',
        action: 'link',
        relation: {
          sourceEntityName: 'TodoItem',
          fieldName: 'list',
          targetEntityName: 'TodoList',
        },
        source: createEntityRef(TodoItem, { id: 'todo' }),
        target: createEntityRef(TodoList, { id: 'later' }),
      },
    };
    await expect(invalidateCanonicalRequest(queryClient, request, operations)).resolves.toEqual({
      kind: 'graph-command',
      queryKeys: [['TodoItem'], ['TodoList']],
    });
  });

  it('uses the registered Operation bridge invalidation for model-triggered Operations', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await expect(invalidateCanonicalRequest(queryClient, invocation, operations)).resolves.toEqual({
      kind: 'operation',
      queryKeys: [['TodoList'], ['TodoItem']],
    });
    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
      ['TodoList'],
      ['TodoItem'],
    ]);
  });

  it('supports registered Operations without an input schema', async () => {
    const inputless = {
      ...defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: { invalidate: [['TodoList']] },
      }),
      id: 'TodoList.rebuild',
      entityName: 'TodoList',
      name: 'rebuild',
    };
    await expect(
      invalidateCanonicalRequest(
        new QueryClient(),
        { kind: 'invoke', operationId: inputless.id },
        new Map([[inputless.id, inputless]]),
      ),
    ).resolves.toEqual({ kind: 'operation', queryKeys: [['TodoList']] });
  });

  it('reports an unregistered Operation instead of silently leaving stale state', async () => {
    await expect(
      invalidateCanonicalRequest(
        new QueryClient(),
        { ...invocation, operationId: 'TodoList.missing' },
        operations,
      ),
    ).rejects.toThrow('No client Operation is registered for "TodoList.missing".');
  });

  it('provides the invalidator through the Graph React context', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCanonicalRequestInvalidation([operation]), { wrapper });
    await act(async () => result.current(invocation));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['TodoList'] });
  });
});
