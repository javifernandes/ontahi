import { entity, field, graphSchema } from '@ontahi/core/data-graph';
import { describe, expect, it, vi } from 'vitest';

import { createReflectedOperationInvoker, type ReactGraphExecutor } from './index.js';

const ReadingProgress = entity('ReadingProgress', {
  userId: field.id(),
  bookId: field.id(),
})
  .locators({
    refByUserAndBook: ['userId', 'bookId'],
  })
  .identity('refByUserAndBook');

const resetReadingProgress = {
  id: 'ReadingProgress.resetReadingProgress',
  kind: 'graph-operation' as const,
  authority: 'client-safe' as const,
  exposure: 'browser-direct' as const,
  input: graphSchema.object({
    progress: graphSchema.selection(ReadingProgress, { cardinality: 'one' }),
  }),
  output: graphSchema.void(),
  run: ({
    progress,
  }: {
    progress: import('@ontahi/core/data-graph').Selection<typeof ReadingProgress>;
  }) => progress.delete(),
};

const operationDescriptor = {
  id: resetReadingProgress.id,
  entityName: 'ReadingProgress',
  name: 'resetReadingProgress',
  kind: 'graph' as const,
  authority: 'client-safe',
  exposure: 'browser-direct',
};

const createExecutor = () =>
  ({
    get: vi.fn(),
    run: vi.fn(),
    count: vi.fn(),
    runCommand: vi.fn().mockResolvedValue(undefined),
  }) satisfies ReactGraphExecutor;

describe('reflected graph operation invoker', () => {
  it('hydrates selection inputs and runs browser graph commands locally', async () => {
    const graphExecutor = createExecutor();
    const invoker = createReflectedOperationInvoker({
      graphExecutor,
      graphOperations: [resetReadingProgress],
    });

    expect(invoker.canInvokeOperation?.(operationDescriptor)).toBe(true);
    expect(invoker.getOperationExecutionAffordance?.(operationDescriptor)).toEqual({
      status: 'local',
      runtime: 'browser-data-graph',
    });
    await expect(
      invoker.invokeOperation({
        operation: operationDescriptor,
        operationId: operationDescriptor.id,
        input: {
          progress: {
            kind: 'selection',
            entityName: 'ReadingProgress',
            expression: {
              kind: 'references',
              refs: [
                {
                  kind: 'entity-ref',
                  entityName: 'ReadingProgress',
                  locator: { userId: 'user-1', bookId: 'book-1' },
                },
              ],
            },
          },
        },
      }),
    ).resolves.toEqual({ ok: true, kind: 'success', value: undefined });

    expect(graphExecutor.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'delete',
        root: ReadingProgress,
        cardinality: 'one',
      }),
    );
  });

  it('delegates operations outside the browser graph registry to its fallback', async () => {
    const fallbackResult = { ok: true, kind: 'success', value: 'bridged' } as const;
    const fallback = {
      canInvokeOperation: vi.fn().mockReturnValue(true),
      getOperationExecutionAffordance: vi.fn().mockReturnValue({
        status: 'bridge',
        authority: 'server',
        bridge: 'fetch',
      }),
      invokeOperation: vi.fn().mockResolvedValue(fallbackResult),
    };
    const invoker = createReflectedOperationInvoker({
      graphExecutor: createExecutor(),
      graphOperations: [resetReadingProgress],
      fallback,
    });
    const bridgedOperation = {
      id: 'Book.list',
      entityName: 'Book',
      name: 'list',
      kind: 'domain' as const,
      exposure: 'bridge',
    };

    await expect(
      invoker.invokeOperation({
        operation: bridgedOperation,
        operationId: bridgedOperation.id,
        input: {},
      }),
    ).resolves.toEqual(fallbackResult);
    expect(fallback.invokeOperation).toHaveBeenCalledOnce();
    expect(invoker.getOperationExecutionAffordance?.(bridgedOperation)).toEqual({
      status: 'bridge',
      authority: 'server',
      bridge: 'fetch',
    });
  });

  it('falls back to a bridge when a registered local operation lacks a required capability', async () => {
    const graphExecutor = createExecutor();
    const fallback = {
      getOperationExecutionAffordance: vi.fn().mockReturnValue({
        status: 'bridge',
        authority: 'server',
        bridge: 'fetch',
      }),
      invokeOperation: vi.fn().mockResolvedValue({ ok: true, kind: 'success', value: 'bridged' }),
    };
    const invoker = createReflectedOperationInvoker({
      graphExecutor,
      graphOperations: [resetReadingProgress],
      fallback,
    });
    const atomicOperation = {
      ...operationDescriptor,
      exposure: 'bridge',
      execution: { atomicity: 'required' as const },
    };

    expect(invoker.getOperationExecutionAffordance?.(atomicOperation)).toEqual({
      status: 'bridge',
      authority: 'server',
      bridge: 'fetch',
    });
    await expect(
      invoker.invokeOperation({
        operation: atomicOperation,
        operationId: atomicOperation.id,
        input: {},
      }),
    ).resolves.toEqual({ ok: true, kind: 'success', value: 'bridged' });
    expect(fallback.invokeOperation).toHaveBeenCalledOnce();
    expect(graphExecutor.runCommand).not.toHaveBeenCalled();
  });

  it('reports unavailable and rejects invocation when local atomicity has no fallback', async () => {
    const graphExecutor = createExecutor();
    const invoker = createReflectedOperationInvoker({
      graphExecutor,
      graphOperations: [resetReadingProgress],
    });
    const operation = {
      ...operationDescriptor,
      authority: 'server',
      exposure: 'browser-direct',
      execution: { atomicity: 'required' as const },
    };

    expect(invoker.getOperationExecutionAffordance?.(operation)).toEqual({
      status: 'unavailable',
      missingCapabilities: [{ kind: 'data-graph.atomicity' }],
    });
    await expect(
      invoker.invokeOperation({ operation, operationId: operation.id, input: {} }),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'rejected',
      executed: false,
      reason: 'execution_unavailable',
    });
    expect(graphExecutor.runCommand).not.toHaveBeenCalled();
  });
});
