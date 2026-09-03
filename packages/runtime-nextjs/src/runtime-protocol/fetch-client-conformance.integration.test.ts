import { createEntityRef, entity, field, mutateEntity, query } from '@ontahi/core/data-graph';
import { createRuntimeProtocolDispatcher } from '@ontahi/core/runtime/protocol';
import { createFetchGraphClient } from '@ontahi/react/graph';
import { createExpressRuntimeProtocolHandler } from '@ontahi/runtime-express/runtime-protocol';
import { createNextRuntimeProtocolRouteHandler } from '@ontahi/runtime-nextjs/runtime-protocol';
import { describe, expect, it } from 'vitest';

const Todo = entity('HostProofTodo', { id: field.id(), title: field.string() });
const TodoRow = Todo.view('HostProofTodoRow', { id: true, title: true });
const todoRef = createEntityRef(Todo, { id: 'todo-1' });
const read = query(Todo).as(TodoRow);
const command = mutateEntity(Todo).update(todoRef, { title: 'Unified' });
const delta = {
  created: [],
  updated: [
    {
      entityName: 'HostProofTodo',
      ref: todoRef,
      values: { id: 'todo-1', title: 'server-principal' },
    },
  ],
  deleted: [],
};

type ReceiverContext = { readonly principal: string };

const dispatcher = createRuntimeProtocolDispatcher<ReceiverContext>({
  handlers: {
    operation: (request, context) =>
      request.kind === 'check-permission'
        ? {
            kind: 'permission-result',
            result: { allowed: context.principal === 'server-principal' },
          }
        : {
            kind: 'invocation-result',
            result: {
              ok: true,
              kind: 'success',
              value: { actor: context.principal },
            },
          },
    'graph.read': (_request, context) => ({
      kind: 'graph-read-result',
      value: [{ id: 'todo-1', title: context.principal }],
    }),
    'graph.command': (_request, context) => ({
      kind: 'graph-command-result',
      value: {
        ...delta,
        updated: [{ ...delta.updated[0]!, values: { id: 'todo-1', title: context.principal } }],
      },
    }),
    'durable.operation': (_request, context) => ({
      version: 1,
      kind: 'snapshot',
      snapshot: {
        taskId: 'HostProofTodo.completeAll',
        runId: 'run-1',
        status: 'completed',
        updatedAt: '2026-09-03T00:00:00.000Z',
        result: { actor: context.principal },
      },
    }),
  },
});

const requestUrl = (input: Parameters<typeof fetch>[0]) =>
  new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    'http://ontahi.test',
  );

const createNextFetch = (): typeof fetch => {
  const handler = createNextRuntimeProtocolRouteHandler({
    dispatcher,
    context: request => ({
      principal:
        request.headers.get('authorization') === 'Bearer browser-session'
          ? 'server-principal'
          : 'anonymous',
    }),
  });

  return async (input, init) =>
    handler(
      new Request(requestUrl(input), {
        ...init,
        headers: init?.headers,
      }),
    );
};

const createExpressFetch = (): typeof fetch => {
  const handler = createExpressRuntimeProtocolHandler({
    dispatcher,
    context: request => ({
      principal:
        request.headers.authorization === 'Bearer browser-session'
          ? 'server-principal'
          : 'anonymous',
    }),
  });

  return async (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const headers = new Headers(init?.headers);
      const request = {
        body: JSON.parse(String(init?.body)),
        headers: Object.fromEntries(headers.entries()),
        method: init?.method,
        url: requestUrl(input).pathname,
      } as unknown as Parameters<typeof handler>[0];
      let status = 200;
      const response = {
        status: (nextStatus: number) => {
          status = nextStatus;
          return response;
        },
        json: (body: unknown) => {
          resolve(Response.json(body, { status }));
          return response;
        },
      } as unknown as Parameters<typeof handler>[1];

      void handler(request, response, reject);
    });
};

const proveRuntimeProtocolHost = async (fetchRequest: typeof fetch) => {
  const requestIds = ['read-1', 'command-1', 'operation-1', 'inspect-1'][Symbol.iterator]();
  const client = createFetchGraphClient({
    runtimeTransport: {
      fetch: fetchRequest,
      requestId: () => requestIds.next().value ?? 'unexpected',
      requestInit: () => ({ headers: { authorization: 'Bearer browser-session' } }),
    },
  });

  await expect(client.graphExecutor.run(read, undefined)).resolves.toEqual([
    { id: 'todo-1', title: 'server-principal' },
  ]);
  await expect(client.graphExecutor.runEntityMutationCommand!(command)).resolves.toEqual(delta);
  await expect(
    client.reflectedOperationInvoker?.invokeOperation({
      operationId: 'HostProofTodo.complete',
      input: { id: 'todo-1' },
    }),
  ).resolves.toMatchObject({ ok: true, value: { actor: 'server-principal' } });

  const inspection = await client.runtimeTransport?.durableOperation
    ?.observe({ taskId: 'HostProofTodo.completeAll', runId: 'run-1' })
    [Symbol.asyncIterator]()
    .next();
  expect(inspection?.value).toMatchObject({
    status: 'completed',
    result: { actor: 'server-principal' },
  });
};

describe('Fetch Runtime Protocol host conformance', () => {
  it('runs all request/response families against the Express projection', async () => {
    await proveRuntimeProtocolHost(createExpressFetch());
  });

  it('runs all request/response families against the Next.js projection', async () => {
    await proveRuntimeProtocolHost(createNextFetch());
  });
});
