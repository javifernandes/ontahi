import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { TaskRunIdentity } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  toOperationProtocolRequest,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
} from '@ontahi/core/runtime/protocol';
import { createFetchRuntimeTransport } from '@ontahi/react/graph';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TodoExpressServer } from './application.js';

process.env.TODO_AUTH_MODE = 'disabled';
process.env.TODO_TASK_RUNTIME = 'langgraph';

const { createTodoExpressServer } = await import('./application.js');
const { TodoApplication } = await import('./graph.js');

describe('Todo LangGraph Runtime Protocol', () => {
  let server: Server | undefined;
  let runtimeHost: TodoExpressServer | undefined;
  let origin: string;

  beforeAll(async () => {
    if (TodoApplication.storage.kind !== 'in-memory') {
      throw new Error('Todo LangGraph protocol tests require in-memory graph storage.');
    }
    TodoApplication.storage.dataset.TodoList = [
      { id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' },
    ];
    TodoApplication.storage.dataset.TodoItem = [
      { id: 'todo-1', list: 'list-inbox', title: 'Keep me', completed: false },
    ];
    runtimeHost = createTodoExpressServer();
    const startedServer = await new Promise<Server>(resolve => {
      const started = runtimeHost!.server.listen(0, '127.0.0.1', () => resolve(started));
    });
    server = startedServer;
    origin = `http://127.0.0.1:${(startedServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await runtimeHost?.close();
  });

  it('completes a rejected interaction through Runtime Protocol without snapshot recovery', async () => {
    const exchange = createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const invocation = (await exchange({
      family: 'operation',
      body: toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'TodoItem.deleteFromNamedList',
        input: { listName: 'Inbox' },
      }),
    })) as { result: { value: TaskRunIdentity } };
    const run = invocation.result.value as TaskRunIdentity;

    await vi.waitFor(async () => {
      await expect(
        exchange({ family: 'durable.operation', body: toDurableOperationProtocolRequest(run) }),
      ).resolves.toMatchObject({
        kind: 'snapshot',
        snapshot: { interaction: { id: 'approve-delete-items' } },
      });
    });
    await exchange({
      family: 'durable.operation',
      body: toDurableOperationInteractionResponseRequest(run, {
        interactionId: 'approve-delete-items',
        decision: 'reject',
      }),
    });

    await vi.waitFor(
      async () => {
        await expect(
          exchange({ family: 'durable.operation', body: toDurableOperationProtocolRequest(run) }),
        ).resolves.toMatchObject({
          kind: 'snapshot',
          snapshot: {
            status: 'completed',
            result: { deleted: 0, rejected: true },
          },
        });
      },
      { timeout: 2_000 },
    );
  });
});
