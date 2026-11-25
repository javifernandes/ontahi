import { readdir, readFile } from 'node:fs/promises';

import { createEntityRef, createInMemoryDataGraphStorage } from '@ontahi/core';
import {
  createTaskDefinitionFromDurableDomainOperation,
  inProcessTasks,
  ontahi,
} from '@ontahi/core/runtime/server';
import { createPostgresEventRuntime } from '@ontahi/postgres/events';
import { createPostgresTaskStorage, createPostgresTaskWorker } from '@ontahi/postgres/tasks';
import { ontahiExpress } from '@ontahi/runtime-express';
import { Chunk, Deferred, Effect, Stream } from 'effect';
import express from 'express';
import { Pool } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import { expect, it, vi } from 'vitest';

import {
  Tag,
  TodoItem,
  TodoList,
  TodoListCompleted,
  TodoListCreated,
  TodoListExportReady,
} from './todo.js';

vi.mock('server-only', () => ({}));

it('starts TodoList.export through Express and resumes it once in a new PostgreSQL worker', async () => {
  const container = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_PASSWORD: 'fixture', POSTGRES_DB: 'todo_export_test' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  const pool = new Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'todo_export_test',
    user: 'postgres',
    password: 'fixture',
  });
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    const files = (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      await pool.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    const declarations = [TodoListExportReady] as const;
    const storage = createPostgresTaskStorage({ pool });
    const app = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: { TodoList: [{ id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' }] },
      }),
      tasks: inProcessTasks({ storage, deferExplicitExecution: true }),
      eventRuntime: createPostgresEventRuntime({ pool }),
      events: [TodoListCreated, TodoListCompleted, ...declarations],
      capabilities: { runtime: { model: { provider: undefined } } },
      entities: [TodoList, TodoItem, Tag],
    });
    const operation = app.graph
      .listDurableDomainOperations()
      .find(entry => entry.id === 'TodoList.export');
    const task = createTaskDefinitionFromDurableDomainOperation(
      operation as Parameters<typeof createTaskDefinitionFromDurableDomainOperation>[0],
    );
    const execution = task.execution!;
    const step = execution.steps['wait-for-export']!;
    const continuations = vi.fn();
    const observedTask = {
      ...task,
      execution: {
        ...execution,
        steps: {
          ...execution.steps,
          'wait-for-export': {
            run: (args: Parameters<typeof step.run>[0]) => {
              if (args.event) continuations(args.event.occurrenceId);
              return step.run(args);
            },
          },
        },
      },
    };
    const createWorker = () =>
      createPostgresTaskWorker({ pool, tasks: [observedTask], events: { declarations } });

    vi.spyOn(app.graph, 'listHttpIngress').mockReturnValue([
      {
        operationId: 'TodoList.export',
        entityName: 'TodoList',
        operationName: 'export',
        kind: 'http',
        method: 'POST',
        route: '/request-export',
        provider: 'fixture',
      },
    ]);
    const server = express();
    server.use(
      ontahiExpress(app, {
        legacyRuntimeEndpoints: false,
        ingress: {
          providers: {
            fixture: {
              receive: async request => {
                if (request.headers.get('authorization') !== 'Bearer fixture') {
                  return { kind: 'rejected', status: 401, error: 'Invalid fixture credentials' };
                }
                const payload = (await request.json()) as { requestId: string };
                return {
                  kind: 'accepted',
                  provider: 'fixture',
                  event: 'export',
                  deliveryId: request.headers.get('x-delivery-id'),
                  correlation: { requestId: payload.requestId },
                  payload,
                };
              },
            },
          },
          eventRoutes: [
            {
              eventId: TodoListExportReady.id,
              eventVersion: TodoListExportReady.version,
              method: 'POST',
              route: '/export-ready',
              provider: 'fixture',
            },
          ],
        },
      }),
    );
    const listener = await new Promise<ReturnType<typeof server.listen>>(resolve => {
      const listening = server.listen(0, '127.0.0.1', () => resolve(listening));
    });
    try {
      const address = listener.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
      const send = (path: string, body: unknown, deliveryId: string, authenticated = true) =>
        fetch(`http://127.0.0.1:${address.port}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-delivery-id': deliveryId,
            ...(authenticated ? { authorization: 'Bearer fixture' } : {}),
          },
          body: JSON.stringify(body),
        });

      const requestId = 'export-request-1';
      const input = { list: createEntityRef('TodoList', { id: 'list-inbox' }), requestId };
      expect((await send('/request-export', input, 'start-1', false)).status).toBe(401);
      expect(await Effect.runPromise(storage.listRecent())).toEqual([]);
      expect((await send('/request-export', input, 'start-1')).status).toBe(200);
      const [queued] = await Effect.runPromise(storage.listRecent());
      const ref = { taskId: queued!.taskId, runId: queued!.runId };
      expect(queued?.status).toBe('queued');
      const subscribed = await Effect.runPromise(Deferred.make<void>());
      const observeController = new AbortController();
      const observation = Effect.runPromise(
        app.app.task.observe(ref).pipe(
          Stream.tap(() => Deferred.succeed(subscribed, undefined)),
          Stream.takeUntil(snapshot => snapshot.status === 'completed'),
          Stream.runCollect,
          Effect.timeout('5 seconds'),
        ),
        { signal: observeController.signal },
      );
      try {
        await Effect.runPromise(Deferred.await(subscribed).pipe(Effect.timeout('5 seconds')));
        expect(await createWorker().runOnce()).toEqual(ref);
        await expect(app.getTaskSnapshot(ref)).resolves.toMatchObject({
          status: 'waiting',
          waitingOn: { eventId: TodoListExportReady.id },
        });

        const output = { requestId, url: 'https://example.test/todo-export.zip' };
        const occurrences: string[] = [];
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await send('/export-ready', output, 'ready-1');
          expect(response.ok).toBe(true);
          const { occurrenceId } = (await response.json()) as { occurrenceId: string };
          expect(occurrenceId).toBeTruthy();
          occurrences.push(occurrenceId);
        }
        expect(new Set(occurrences).size).toBe(2);
        const results = await Promise.all([createWorker().runOnce(), createWorker().runOnce()]);
        expect(results.filter(Boolean)).toEqual([ref]);
        expect(continuations).toHaveBeenCalledExactlyOnceWith(occurrences[0]);
        await expect(app.getTaskSnapshot(ref)).resolves.toMatchObject({
          ...ref,
          status: 'completed',
          result: { url: output.url },
        });
        expect(Chunk.toReadonlyArray(await observation).map(snapshot => snapshot.status)).toEqual([
          'queued',
          'running',
          'waiting',
          'running',
          'completed',
        ]);
      } finally {
        observeController.abort();
        await observation.catch(() => {});
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        listener.close(error => (error ? reject(error) : resolve())),
      );
    }
  } finally {
    await pool.end();
    await container.stop();
  }
}, 120_000);
