import { createInMemoryDataGraphStorage } from '@ontahi/core/data-graph';
import {
  createTaskDefinitionFromDurableDomainOperation,
  DATA_GRAPH_RUNTIME_RESOURCE_KEY,
} from '@ontahi/core/runtime/server';
import type { TaskRunSource } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoItem, TodoList } from './graph.js';

vi.mock('server-only', () => ({}));

describe('Vercel Workflow Todo interaction integration', () => {
  beforeEach(() => {
    (globalThis as { __ontahiVercelHookResponses?: unknown[] }).__ontahiVercelHookResponses = [];
  });

  afterEach(() => {
    delete (globalThis as { __ontahiVercelHookResponses?: unknown[] }).__ontahiVercelHookResponses;
  });

  it('runs the unchanged deleteFromNamedList choice and approval execution', async () => {
    const storage = createInMemoryDataGraphStorage({
      dataset: {
        TodoList: [
          { id: 'list-one', name: 'Inbox', color: '#111111' },
          { id: 'list-two', name: 'Inbox', color: '#222222' },
        ],
        TodoItem: [
          { id: 'todo-one', list: 'list-one', title: 'Keep', completed: false },
          { id: 'todo-two', list: 'list-two', title: 'Delete', completed: false },
        ],
        Tag: [],
      },
      relationships: [],
    });
    storage.bindEntities?.([TodoList, TodoItem]);
    const ref = { taskId: 'TodoItem.deleteFromNamedList', runId: 'vercel-todo-run' };
    let source: TaskRunSource = {
      ...ref,
      status: 'queued',
      input: { listName: 'Inbox' },
      trigger: { cause: 'user_request', actor: { kind: 'user', id: 'user-1' } },
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    (globalThis as { __ontahiVercelHookResponses?: unknown[] }).__ontahiVercelHookResponses!.push(
      { interactionId: 'choose-list', optionId: 'list-two' },
      { interactionId: 'approve-delete-items', decision: 'approve' },
    );
    const { createVercelWorkflowTaskExecutor } =
      await import('@ontahi/runtime-vercel-workflows/executor');
    const deleteFromNamedList = (
      TodoItem as unknown as {
        domain: {
          deleteFromNamedList: Parameters<typeof createTaskDefinitionFromDurableDomainOperation>[0];
        };
      }
    ).domain.deleteFromNamedList;
    const executor = createVercelWorkflowTaskExecutor({
      taskRunStore: {
        loadSource: () => Effect.succeed(source),
        update: (_identity, patch) => {
          source = { ...source, ...patch };
          return Effect.succeed(source);
        },
      },
      getTaskDefinition: taskId =>
        taskId === ref.taskId
          ? createTaskDefinitionFromDurableDomainOperation(deleteFromNamedList)
          : undefined,
      createExecutionContext: () => ({
        scope: ref.taskId,
        telemetrySpanName: ref.taskId,
        resources: new Map([[DATA_GRAPH_RUNTIME_RESOURCE_KEY, storage.createRuntime()]]),
      }),
    });

    await expect(executor.runTask(ref, vi.fn())).resolves.toEqual({
      deleted: 1,
      rejected: false,
    });
    expect(storage.dataset.TodoItem).toEqual([
      expect.objectContaining({ id: 'todo-one', list: 'list-one' }),
    ]);
    expect(source).toMatchObject({
      status: 'completed',
      result: { deleted: 1, rejected: false },
      checkpoint: undefined,
    });
  });
});
