import { createEntityRef } from '@ontahi/core/data-graph';
import { createTaskDefinitionFromDurableDomainOperation } from '@ontahi/core/runtime/server';
import type { TaskRunSource } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { TodoList, TodoListExportReady } from './graph.js';

vi.mock('server-only', () => ({}));

describe('Vercel Workflow Todo Event-wait integration', () => {
  it('runs the unchanged TodoList.export execution from a retained Event occurrence', async () => {
    const ref = { taskId: 'TodoList.export', runId: 'vercel-export-run' };
    const requestId = 'request-1';
    let source: TaskRunSource = {
      ...ref,
      status: 'queued',
      input: { list: createEntityRef('TodoList', { id: 'list-inbox' }), requestId },
      trigger: { cause: 'user_request', actor: { kind: 'user', id: 'user-1' } },
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    const occurrence = {
      kind: 'event-occurrence' as const,
      occurrenceId: 'occurrence-export-ready',
      eventId: TodoListExportReady.id,
      eventVersion: TodoListExportReady.version,
      occurredAt: '2026-06-03T00:01:00.000Z',
      payload: { requestId, url: 'https://example.test/todo-export.zip' },
      correlation: { requestId },
    };
    const claim = {
      claimId: 'claim-export-ready',
      consumerId: `task-runtime:${ref.taskId}:${ref.runId}`,
      leaseExpiresAt: '2026-06-03T00:02:00.000Z',
      delivery: {
        kind: 'event-delivery' as const,
        deliveryId: 'delivery-export-ready',
        subscriptionId: `task:${ref.taskId}:${ref.runId}:event-wait:todo-list-export:${requestId}`,
        attempt: 1,
        occurrence,
      },
    };
    const register = vi.fn(() => Promise.resolve());
    const acknowledge = vi.fn(() => Promise.resolve());
    const { createVercelWorkflowTaskExecutor } =
      await import('@ontahi/runtime-vercel-workflows/executor');
    const exportOperation = (
      TodoList as unknown as {
        domain: {
          export: Parameters<typeof createTaskDefinitionFromDurableDomainOperation>[0];
        };
      }
    ).domain.export;
    const executor = createVercelWorkflowTaskExecutor({
      taskRunStore: {
        loadSource: () => Effect.succeed(source),
        update: (_identity, patch) => {
          source = { ...source, ...patch };
          return Effect.succeed(source);
        },
        claimEvent: (_identity, _waitId, checkpoint) => {
          source = { ...source, status: 'running', checkpoint };
          return Effect.succeed(source);
        },
        cancelEvent: () => Effect.succeed(undefined),
      },
      getTaskDefinition: taskId =>
        taskId === ref.taskId
          ? createTaskDefinitionFromDurableDomainOperation(exportOperation)
          : undefined,
      events: {
        declarations: [TodoListExportReady],
        runtime: {
          capabilities: {
            liveSubscription: false,
            retention: true,
            replay: false,
            durableAcceptance: true,
            durableDelivery: true,
            deliveryInspection: false,
            acknowledgement: true,
            ordering: 'subscription',
            deduplication: false,
            atomicPublication: false,
            overflowBehavior: 'spill',
          },
          accept: vi.fn(),
          subscribe: vi.fn(),
          durableDelivery: {
            register,
            claim: () => Promise.resolve(claim),
            acknowledge,
            release: () => Promise.resolve(),
            retryAfter: () => Promise.resolve(),
            fail: () => Promise.resolve(),
            cancel: () => Promise.resolve(),
          },
        },
      },
    });

    await expect(executor.runTask(ref, vi.fn())).resolves.toEqual({
      url: 'https://example.test/todo-export.zip',
    });
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: TodoListExportReady.id,
        correlation: { requestId },
      }),
    );
    expect(acknowledge).toHaveBeenCalledWith(claim);
    expect(source).toMatchObject({
      status: 'completed',
      result: { url: 'https://example.test/todo-export.zip' },
      checkpoint: undefined,
    });
  });
});
