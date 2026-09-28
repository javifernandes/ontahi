import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { field, value } from '../../data-graph/index.js';

import {
  architecture,
  createInMemoryTaskStorage,
  createInProcessTaskExecutor,
  createInProcessTaskRuntime,
  createSystemTaskTrigger,
  createTaskDefinitionFromDurableDomainOperation,
  createUserTaskTrigger,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  defineTask,
  defineTaskStep,
  getTaskSnapshot,
  inProcessTasks,
  normalizeTaskTrigger,
  respondToTaskInteraction,
  startTask,
  taskTriggerActorMatches,
  withInvocationContext,
  type TaskTrigger,
} from './index.js';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(innerResolve => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

describe('tasks', () => {
  it('projects a complete durable operation lifecycle into a task definition', () => {
    const InputSchema = value('ImportInput', { source: field.string() });
    const ProgressSchema = value('ImportProgress', { percent: field.number() });
    const OutputSchema = value('ImportOutput', { imported: field.boolean() });
    const step = defineTaskStep({
      id: 'import-source',
      input: InputSchema,
      output: OutputSchema,
      run: () => Effect.succeed({ imported: true }),
    });
    const operations = defineDomainOperationsForEntity('Book', {
      importBook: defineDomainOperation({
        layer: 'test.books',
        exposure: 'server-only',
        input: InputSchema,
        durable: {
          runtime: 'in-process',
          progress: ProgressSchema,
          finalOutput: OutputSchema,
          steps: [step],
        },
        run: () => Effect.succeed({ imported: true }),
      }),
    });

    const task = createTaskDefinitionFromDurableDomainOperation(operations.importBook);

    expect(task.id).toBe('Book.importBook');
    expect(task.input).toBe(InputSchema);
    expect(task.progress).toBe(ProgressSchema);
    expect(task.output).toBe(OutputSchema);
    expect(task.steps).toEqual({
      'import-source': step,
    });
  });

  it('creates and normalizes task triggers', () => {
    expect(normalizeTaskTrigger(undefined)).toEqual({
      cause: 'system',
    });
    expect(
      createSystemTaskTrigger({ source: { provider: 'bookops', event: 'cron.tick' } }),
    ).toEqual({
      cause: 'system',
      source: {
        provider: 'bookops',
        event: 'cron.tick',
      },
    });

    const trigger = createUserTaskTrigger({
      userId: 'user-1',
      ingress: {
        kind: 'server_action',
        requestId: 'request-1',
      },
      source: {
        provider: 'bookops',
        event: 'demo.say-hello.start',
      },
    });

    expect(trigger).toEqual({
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
      ingress: {
        kind: 'server_action',
        requestId: 'request-1',
      },
      source: {
        provider: 'bookops',
        event: 'demo.say-hello.start',
      },
    });
    expect(taskTriggerActorMatches(trigger, { kind: 'user', id: 'user-1' })).toBe(true);
    expect(taskTriggerActorMatches(trigger, { kind: 'user', id: 'user-2' })).toBe(false);
    expect(taskTriggerActorMatches(trigger, { kind: 'user' })).toBe(true);
    expect(taskTriggerActorMatches(trigger, { kind: 'system' })).toBe(false);
  });

  it('starts tasks through the configured architecture facade', async () => {
    const sleep = createDeferred();
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: () => sleep.promise,
    });
    const { app } = architecture({
      task: {
        runtime: adapter,
      },
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          yield* context.progress({ message: 'Waiting 20 seconds' });
          yield* context.sleep(20_000);
          yield* context.progress({ message: 'Hi there' });
          return { message: 'Hi there' };
        }),
    });

    const run = await Effect.runPromise(app.task.start(task, {}, { runId: 'run-1' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'running',
        progress: {
          message: 'Waiting 20 seconds',
        },
      });
    });

    sleep.resolve();

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        progress: {
          message: 'Hi there',
        },
      });
    });
  });

  it('composes task execution and storage as separate architecture capabilities', async () => {
    const storage = createInMemoryTaskStorage();
    const { app } = architecture({
      task: {
        executor: createInProcessTaskExecutor({
          createRunId: () => 'composed-run',
        }),
        storage,
      },
    });
    const task = defineTask({
      id: 'demo.composed',
      run: () => Effect.succeed({ composed: true }),
    });

    const run = await Effect.runPromise(app.task.start(task, {}));

    expect(run.runId).toBe('composed-run');
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { composed: true },
      });
    });
  });

  it('provides an in-process execution and in-memory storage preset', async () => {
    const { app } = architecture({
      task: inProcessTasks({
        createRunId: () => 'preset-run',
      }),
    });
    const task = defineTask({
      id: 'demo.preset',
      run: () => Effect.succeed({ preset: true }),
    });

    const run = await Effect.runPromise(app.task.start(task, {}));

    expect(run.runId).toBe('preset-run');
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { preset: true },
      });
    });
  });

  it('validates and stores parsed task input before starting a run', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const { app } = architecture({
      task: {
        runtime: adapter,
      },
    });
    const task = defineTask({
      id: 'demo.validated-input',
      input: value('ValidatedTaskInput', {
        name: field.nonEmptyString({ trim: true }),
      }),
      run: input =>
        Effect.succeed({
          message: `Hi ${input.name}`,
        }),
    });

    const run = await Effect.runPromise(
      app.task.start(task, { name: ' Ada ' }, { runId: 'run-validated-input' }),
    );

    await expect(Effect.runPromise(store.loadSource(run))).resolves.toMatchObject({
      input: {
        name: 'Ada',
      },
    });
    await expect(
      Effect.runPromise(Effect.flip(app.task.start(task, { name: '' }))),
    ).resolves.toMatchObject({
      reason: 'invalid_task_input',
      message: expect.any(String),
    });
  });

  it('validates step input before running the step', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const { app } = architecture({
      task: {
        runtime: adapter,
      },
    });
    const countedStep = defineTaskStep<{ count: number }, { count: number }>({
      id: 'counted-step',
      input: value('CountedStepInput', {
        count: field.positiveInteger(),
      }),
      run: input =>
        Effect.succeed({
          count: input.count,
        }),
    });
    const task = defineTask({
      id: 'demo.validated-step',
      steps: [countedStep],
      run: (_input: {}, context) => context.step(countedStep, { count: 0 }),
    });

    const run = await Effect.runPromise(app.task.start(task, {}, { runId: 'run-validated-step' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_step_input',
        },
      });
    });
  });

  it('validates progress snapshots before storing them', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.validated-progress',
      progress: value('DemoTaskProgress', {
        percent: field.number({ min: 0, max: 100 }),
      }),
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          yield* context.progress({ percent: 101 });
          return { completed: true };
        }),
    });

    const run = await Effect.runPromise(adapter.start(task, {}, { runId: 'run-progress' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(adapter.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_progress',
        },
      });
    });
  });

  it('validates step output before returning it to the task', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const countedStep = defineTaskStep({
      id: 'counted-step',
      output: value('CountedStepOutput', {
        count: field.positiveInteger(),
      }),
      run: () => Effect.succeed({ count: 0 }),
    });
    const task = defineTask({
      id: 'demo.validated-step-output',
      steps: [countedStep],
      run: (_input: {}, context) => context.step(countedStep, {}),
    });

    const run = await Effect.runPromise(adapter.start(task, {}, { runId: 'run-step-output' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(adapter.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_step_output',
        },
      });
    });
  });

  it('validates final task output before completing the run', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.validated-output',
      output: value('DemoTaskOutput', {
        count: field.positiveInteger(),
      }),
      run: () => Effect.succeed({ count: 0 }),
    });

    const run = await Effect.runPromise(adapter.start(task, {}, { runId: 'run-output' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(adapter.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_output',
        },
      });
    });
  });

  it('binds task methods onto an entity-facing API', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const { app } = architecture({
      task: {
        runtime: adapter,
      },
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    });
    const Demo = app.task.defineForEntity({ name: 'Demo' }, { sayHello: task });

    const run = await Effect.runPromise(Demo.sayHello({}, { runId: 'run-entity' }));

    expect(run).toEqual({
      taskId: 'demo.say-hello',
      runId: 'run-entity',
      status: 'queued',
    });
    expect(Demo.tasks.sayHello).toBe(Demo.sayHello);
    expect(Demo.taskDefinitions.sayHello).toBe(task);
  });

  it('binds configured tasks declared on graph entities', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const graph = {
      defineEntity: <TEntity extends object, TConfig>(entity: TEntity, _config?: TConfig) => entity,
    };
    const { app } = architecture({
      graph,
      task: {
        runtime: adapter,
      },
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    });
    const Demo = app.graph.defineEntity(
      { name: 'Demo' },
      {
        tasks: {
          sayHello: task,
        },
      },
    ) as unknown as {
      sayHello: (input: {}, options?: { runId?: string }) => Effect.Effect<any, any>;
    };

    const run = await Effect.runPromise(Demo.sayHello({}, { runId: 'run-graph' }));

    expect(run).toMatchObject({
      taskId: 'demo.say-hello',
      runId: 'run-graph',
    });
  });

  it('fails clearly when task execution is not configured', async () => {
    const { app } = architecture({});
    const task = defineTask({
      id: 'demo.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    });

    await expect(Effect.runPromise(Effect.flip(app.task.start(task, {})))).resolves.toMatchObject({
      reason: 'task_runtime_missing',
      message: 'Task execution requires both an executor and storage.',
    });
  });

  it('creates, reads, and patches in-memory task snapshots without changing identity', async () => {
    const store = createInMemoryTaskStorage();

    const created = await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'run-store',
      }),
    );

    expect(created).toMatchObject({
      taskId: 'demo.say-hello',
      runId: 'run-store',
      status: 'queued',
    });
    expect(created.updatedAt).toEqual(expect.any(String));

    await Effect.runPromise(
      store.update(created, {
        status: 'running',
        progress: {
          phase: 'preparing',
          percent: 25,
        },
      }),
    );
    const updated = await Effect.runPromise(
      store.update(created, {
        taskId: 'other-task',
        runId: 'other-run',
        progress: {
          message: 'Still preparing',
        },
      }),
    );

    expect(updated).toMatchObject({
      taskId: 'demo.say-hello',
      runId: 'run-store',
      status: 'running',
      progress: {
        phase: 'preparing',
        message: 'Still preparing',
        percent: 25,
      },
    });
    await expect(Effect.runPromise(store.get(created))).resolves.toEqual(updated);
  });

  it('separates public task snapshots from engine task run sources', async () => {
    const store = createInMemoryTaskStorage();
    const trigger = {
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
      ingress: {
        kind: 'server_action',
        requestId: 'request-1',
      },
      source: {
        provider: 'bookops',
        event: 'demo.say-hello.start',
      },
    } satisfies TaskTrigger;
    const ref = {
      taskId: 'demo.say-hello',
      runId: 'run-source',
    };

    const created = await Effect.runPromise(
      store.create({
        ...ref,
        input: {
          name: 'Ada',
        },
        trigger,
        subject: {
          type: 'book',
          id: 'book-1',
        },
        runtime: {
          name: 'in-process',
          runId: 'runtime-run-1',
        },
      }),
    );
    const snapshot = await Effect.runPromise(store.getSnapshot(ref));

    expect(created).toMatchObject({
      ...ref,
      status: 'queued',
      input: {
        name: 'Ada',
      },
      trigger,
      subject: {
        type: 'book',
        id: 'book-1',
      },
      runtime: {
        name: 'in-process',
        runId: 'runtime-run-1',
      },
    });
    expect(snapshot).toMatchObject({
      ...ref,
      status: 'queued',
      subject: {
        type: 'book',
        id: 'book-1',
      },
    });
    expect(snapshot).not.toHaveProperty('input');
    expect(snapshot).not.toHaveProperty('trigger');
    expect(snapshot).not.toHaveProperty('runtime');

    await Effect.runPromise(
      store.attachRuntimeRef(ref, {
        name: 'vercel-workflow',
        runId: 'wrun_1',
      }),
    );
    await Effect.runPromise(
      store.update(ref, {
        status: 'completed',
        result: {
          message: 'Hi there',
        },
      }),
    );

    await expect(Effect.runPromise(store.loadSource(ref))).resolves.toMatchObject({
      ...ref,
      status: 'completed',
      input: {
        name: 'Ada',
      },
      trigger,
      runtime: {
        name: 'vercel-workflow',
        runId: 'wrun_1',
      },
      result: {
        message: 'Hi there',
      },
    });
  });

  it('lists recent in-memory task runs as summaries without task inputs', async () => {
    const store = createInMemoryTaskStorage();

    await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'older',
        input: {
          secret: 'do-not-list',
        },
        trigger: {
          cause: 'user_request',
          actor: {
            kind: 'user',
            id: 'user-1',
          },
        },
      }),
    );
    await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'newer',
        trigger: {
          cause: 'schedule',
          ingress: {
            kind: 'cron',
            scheduleId: 'daily',
          },
        },
      }),
    );
    await Effect.runPromise(
      store.update(
        {
          taskId: 'demo.say-hello',
          runId: 'newer',
        },
        {
          status: 'completed',
          createdAt: '2026-06-03T00:00:01.000Z',
          result: {
            message: 'Hi there',
          },
          updatedAt: '2026-06-03T02:00:01.000Z',
        },
      ),
    );
    await Effect.runPromise(
      store.update(
        {
          taskId: 'demo.say-hello',
          runId: 'older',
        },
        {
          status: 'running',
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T03:00:00.000Z',
        },
      ),
    );

    const recent = await Effect.runPromise(store.listRecent(1));

    expect(recent).toEqual([
      expect.objectContaining({
        taskId: 'demo.say-hello',
        runId: 'newer',
        status: 'completed',
        trigger: {
          cause: 'schedule',
          ingress: {
            kind: 'cron',
            scheduleId: 'daily',
          },
        },
      }),
    ]);
    expect(recent[0]).not.toHaveProperty('input');
    expect(recent[0]).not.toHaveProperty('result');
  });

  it('lists recent in-memory task runs scoped to an actor', async () => {
    const store = createInMemoryTaskStorage();

    await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'mine',
        trigger: {
          cause: 'user_request',
          actor: {
            kind: 'user',
            id: 'user-1',
          },
        },
      }),
    );
    await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'theirs',
        trigger: {
          cause: 'user_request',
          actor: {
            kind: 'user',
            id: 'user-2',
          },
        },
      }),
    );

    const recent = await Effect.runPromise(
      store.listRecentForActor({
        kind: 'user',
        id: 'user-1',
      }),
    );

    expect(recent.map(run => run.runId)).toEqual(['mine']);
  });

  it('returns task failures when updating unknown in-memory runs', async () => {
    const store = createInMemoryTaskStorage();

    await expect(
      Effect.runPromise(
        Effect.flip(
          store.update(
            {
              taskId: 'demo.say-hello',
              runId: 'missing',
            },
            {
              status: 'running',
            },
          ),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_run_not_found',
      message: 'Task run not found.',
    });
  });

  it('runs a task through the in-process adapter and updates snapshots', async () => {
    const sleep = createDeferred();
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: () => sleep.promise,
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          yield* context.progress({
            phase: 'waiting',
            message: 'Waiting 20 seconds',
          });
          yield* context.sleep(20_000);
          yield* context.progress({
            phase: 'completed',
            message: 'Hi there',
          });
          return { message: 'Hi there' };
        }),
    });

    const run = await Effect.runPromise(startTask(adapter, task, {}, { runId: 'run-1' }));

    expect(run).toEqual({
      taskId: 'demo.say-hello',
      runId: 'run-1',
      status: 'queued',
    });

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'running',
        progress: {
          phase: 'waiting',
          message: 'Waiting 20 seconds',
        },
      });
    });

    sleep.resolve();

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'completed',
        progress: {
          phase: 'completed',
          message: 'Hi there',
        },
      });
    });
  });

  it('suspends and resumes a durable operation through choice and approval interactions', async () => {
    const OutputSchema = value('ReviewOutput', {
      success: field.boolean(),
      approved: field.boolean(),
    });
    const operations = defineDomainOperationsForEntity('Document', {
      review: defineDomainOperation({
        layer: 'test.documents',
        exposure: 'server-only',
        durable: {
          runtime: 'in-process',
          finalOutput: OutputSchema,
        },
        run: (_input, context) =>
          Effect.gen(function* () {
            yield* context!.interact.choice({
              id: 'choose-reviewer',
              prompt: 'Who should review this document?',
              options: [
                { id: 'legal', label: 'Legal', value: 'legal' },
                { id: 'editorial', label: 'Editorial', value: 'editorial' },
              ],
            });
            yield* context!.sleep(0);
            const decision = yield* context!.interact.approval({
              id: 'approve-document',
              prompt: 'Apply the proposed document update?',
              proposal: {
                id: 'document-update-v1',
                summary: 'Publish the reviewed document.',
                requests: [{ version: 1, kind: 'graph-command', command: { action: 'update' } }],
              },
            });
            yield* context!.sleep(0);

            return { success: true as const, approved: decision.decision === 'approve' };
          }),
      }),
    });
    const task = createTaskDefinitionFromDurableDomainOperation(operations.review);
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      sleep: async () => {},
    });
    const { app } = architecture({ task: { runtime: adapter } });
    const responseContext = { actor: { kind: 'user' as const, id: 'user-1' } };
    const run = await Effect.runPromise(
      startTask(
        adapter,
        task,
        {},
        {
          runId: 'review-run',
          trigger: createUserTaskTrigger({ userId: 'user-1' }),
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'choose-reviewer',
          kind: 'choice',
          prompt: 'Who should review this document?',
          options: [
            { id: 'legal', label: 'Legal' },
            { id: 'editorial', label: 'Editorial' },
          ],
        },
      });
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            { interactionId: 'choose-reviewer', optionId: 'legal' },
            { actor: { kind: 'user', id: 'user-2' } },
          ),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_interaction_access_denied',
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            {
              interactionId: 'another-interaction',
              optionId: 'legal',
            },
            responseContext,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_interaction_mismatch',
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            {
              interactionId: 'choose-reviewer',
              optionId: 'missing',
            },
            responseContext,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'invalid_task_interaction_response',
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            { interactionId: 'choose-reviewer', decision: 'approve' },
            responseContext,
          ),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'invalid_task_interaction_response' });

    const resumed = await Effect.runPromise(
      app.task.respondToInteraction(
        run,
        {
          interactionId: 'choose-reviewer',
          optionId: 'legal',
        },
        responseContext,
      ),
    );
    expect(resumed.interaction).toBeUndefined();

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-document',
          kind: 'approval',
          prompt: 'Apply the proposed document update?',
          proposal: {
            id: 'document-update-v1',
            summary: 'Publish the reviewed document.',
            requests: [{ version: 1, kind: 'graph-command', command: { action: 'update' } }],
          },
        },
      });
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            { interactionId: 'approve-document', optionId: 'yes' },
            responseContext,
          ),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'invalid_task_interaction_response' });

    await Effect.runPromise(
      respondToTaskInteraction(
        adapter,
        run,
        {
          interactionId: 'approve-document',
          decision: 'reject',
          reason: 'Needs another revision.',
        },
        responseContext,
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'completed',
        result: { success: true, approved: false },
      });
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            adapter,
            run,
            {
              interactionId: 'approve-document',
              decision: 'reject',
              reason: 'Needs another revision.',
            },
            responseContext,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_interaction_not_pending',
    });
  });

  it('records a terminal failure when resumed task execution defects', async () => {
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
    });
    const task = defineTask({
      id: 'demo.defect-after-approval',
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          yield* context.interact.approval({
            id: 'approve-defect',
            prompt: 'Continue?',
            proposal: {
              id: 'defect-v1',
              summary: 'Continue into failing work.',
              requests: [{ kind: 'probe' }],
            },
          });
          return yield* Effect.dieMessage('Storage command defect.');
        }),
    });
    const run = await Effect.runPromise(
      startTask(
        adapter,
        task,
        {},
        {
          runId: 'defect-run',
          trigger: createUserTaskTrigger({ userId: 'user-1' }),
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        interaction: { id: 'approve-defect' },
      });
    });
    await Effect.runPromise(
      respondToTaskInteraction(
        adapter,
        run,
        { interactionId: 'approve-defect', decision: 'approve' },
        { actor: { kind: 'user', id: 'user-1' } },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_failed', message: 'Task failed.' },
      });
    });
  });

  it('preserves the invoking Principal as the default durable Operation actor', async () => {
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      sleep: async () => {},
    });
    const { app } = architecture({ task: { runtime: adapter } });
    const operations = app.operation.defineForEntity('Document', {
      review: app.operation.define({
        layer: 'test.documents',
        exposure: 'server-only',
        durable: { runtime: 'in-process' },
        run: (_input, context) =>
          context!.interact.choice({
            id: 'choose-reviewer',
            prompt: 'Who should review this document?',
            options: [{ id: 'legal', label: 'Legal', value: 'legal' }],
          }),
      }),
      systemReview: app.operation.define({
        layer: 'test.documents',
        exposure: 'server-only',
        durable: {
          runtime: 'in-process',
          trigger: () => ({ cause: 'system', actor: { kind: 'system' } }),
        },
        run: (_input, context) => Effect.succeed(context!.trigger),
      }),
    });

    const result = await withInvocationContext(
      { principal: { kind: 'user', subject: 'user-1', issuer: 'test' } },
      () => app.operation.invoke(operations.review, {}),
    );
    expect(result).toMatchObject({ ok: true, kind: 'success' });
    if (!result.ok) throw new Error('Expected the durable Operation to start.');
    const run = result.value as { taskId: string; runId: string };

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        interaction: { id: 'choose-reviewer' },
      });
    });
    await expect(
      Effect.runPromise(
        app.task.respondToInteraction(
          run,
          { interactionId: 'choose-reviewer', optionId: 'legal' },
          { actor: { kind: 'user', id: 'user-1' } },
        ),
      ),
    ).resolves.toMatchObject({ status: 'running' });
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: 'legal',
      });
    });

    const declared = await withInvocationContext(
      { principal: { kind: 'user', subject: 'user-1', issuer: 'test' } },
      () => app.operation.invoke(operations.systemReview, {}),
    );
    expect(declared).toMatchObject({ ok: true, kind: 'success' });
    if (!declared.ok) throw new Error('Expected the system-owned durable Operation to start.');
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(app.task.getSnapshot(declared.value))).resolves.toMatchObject({
        status: 'completed',
        result: { cause: 'system', actor: { kind: 'system' } },
      });
    });
  });

  it('fails a task that declares an invalid choice interaction', async () => {
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.invalid-choice',
      run: (_input: {}, context) =>
        context.interact.choice({
          prompt: 'Choose one',
          options: [
            { id: 'same', label: 'First', value: 1 },
            { id: 'same', label: 'Second', value: 2 },
          ],
        }),
    });
    const run = await Effect.runPromise(
      startTask(adapter, task, {}, { runId: 'invalid-choice-run' }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_interaction',
          message: 'Choice option IDs must be non-empty and unique.',
        },
      });
    });
  });

  it.each([
    {
      name: 'blank interaction ID',
      request: {
        id: ' ',
        prompt: 'Choose one',
        options: [{ id: 'one', label: 'One', value: 1 }],
      },
      message: 'Choice interaction ID is invalid.',
    },
    {
      name: 'oversized interaction ID',
      request: {
        id: 'i'.repeat(513),
        prompt: 'Choose one',
        options: [{ id: 'one', label: 'One', value: 1 }],
      },
      message: 'Choice interaction ID is invalid.',
    },
    {
      name: 'blank option ID',
      request: {
        prompt: 'Choose one',
        options: [{ id: ' ', label: 'One', value: 1 }],
      },
      message: 'Choice option IDs must be non-empty and unique.',
    },
    {
      name: 'oversized option ID',
      request: {
        prompt: 'Choose one',
        options: [{ id: 'o'.repeat(513), label: 'One', value: 1 }],
      },
      message: 'Choice option IDs must be non-empty and unique.',
    },
  ])('rejects a choice interaction with a $name', async ({ request, message }) => {
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.invalid-choice-identities',
      run: (_input: {}, context) => context.interact.choice(request),
    });
    const run = await Effect.runPromise(startTask(adapter, task, {}));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_interaction',
          message,
        },
      });
    });
  });

  it.each([
    {
      name: 'blank prompt',
      request: {
        prompt: ' ',
        proposal: { id: 'proposal-1', summary: 'Delete one item.', requests: [{}] },
      },
      message: 'Approval prompt cannot be empty.',
    },
    {
      name: 'blank interaction ID',
      request: {
        id: ' ',
        prompt: 'Apply this change?',
        proposal: { id: 'proposal-1', summary: 'Delete one item.', requests: [{}] },
      },
      message: 'Approval interaction ID is invalid.',
    },
    {
      name: 'oversized interaction ID',
      request: {
        id: 'i'.repeat(513),
        prompt: 'Apply this change?',
        proposal: { id: 'proposal-1', summary: 'Delete one item.', requests: [{}] },
      },
      message: 'Approval interaction ID is invalid.',
    },
    {
      name: 'blank proposal ID',
      request: {
        prompt: 'Apply this change?',
        proposal: { id: ' ', summary: 'Delete one item.', requests: [{}] },
      },
      message: 'Approval proposal ID is invalid.',
    },
    {
      name: 'oversized proposal ID',
      request: {
        prompt: 'Apply this change?',
        proposal: { id: 'p'.repeat(513), summary: 'Delete one item.', requests: [{}] },
      },
      message: 'Approval proposal ID is invalid.',
    },
    {
      name: 'blank proposal summary',
      request: {
        prompt: 'Apply this change?',
        proposal: { id: 'proposal-1', summary: ' ', requests: [{}] },
      },
      message: 'Approval proposal summary is required.',
    },
    {
      name: 'empty proposal requests',
      request: {
        prompt: 'Apply this change?',
        proposal: { id: 'proposal-1', summary: 'Delete one item.', requests: [] },
      },
      message: 'Approval proposal requires at least one JSON-safe request.',
    },
    {
      name: 'non-JSON proposal request',
      request: {
        prompt: 'Apply this change?',
        proposal: {
          id: 'proposal-1',
          summary: 'Delete one item.',
          requests: [() => undefined],
        },
      },
      message: 'Approval proposal requires at least one JSON-safe request.',
    },
  ])('rejects an approval interaction with a $name', async ({ request, message }) => {
    const adapter = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.invalid-approval',
      run: (_input: {}, context) =>
        context.interact.approval(request as Parameters<typeof context.interact.approval>[0]),
    });
    const run = await Effect.runPromise(startTask(adapter, task, {}));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'invalid_task_interaction',
          message,
        },
      });
    });
  });

  it('passes trigger and subject metadata through in-process task execution', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const trigger = {
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
      ingress: {
        kind: 'server_action',
      },
    } satisfies TaskTrigger;
    const task = defineTask({
      id: 'demo.say-hello',
      run: (_input: {}, context) =>
        Effect.succeed({
          actorId: context.trigger.actor?.id,
          ingressKind: context.trigger.ingress?.kind,
          subjectId: context.subject?.id,
        }),
    });

    const run = await Effect.runPromise(
      startTask(
        adapter,
        task,
        {},
        {
          runId: 'run-trigger',
          trigger,
          subject: {
            type: 'book',
            id: 'book-1',
          },
        },
      ),
    );

    expect(run).toEqual({
      taskId: 'demo.say-hello',
      runId: 'run-trigger',
      status: 'queued',
      subject: {
        type: 'book',
        id: 'book-1',
      },
    });
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(store.loadSource(run))).resolves.toMatchObject({
        status: 'completed',
        trigger,
        subject: {
          type: 'book',
          id: 'book-1',
        },
        result: {
          actorId: 'user-1',
          ingressKind: 'server_action',
          subjectId: 'book-1',
        },
      });
    });
  });

  it('uses configured run id generation in the in-process adapter', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
      createRunId: () => 'generated-run',
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    });

    const run = await Effect.runPromise(startTask(adapter, task, {}));

    expect(run).toEqual({
      taskId: 'demo.say-hello',
      runId: 'generated-run',
      status: 'queued',
    });
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'completed',
      });
    });
  });

  it('marks in-process task runs as failed when the task effect fails', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: () =>
        Effect.fail({
          reason: 'demo_failed',
          message: 'Demo task failed.',
        }),
    });

    const run = await Effect.runPromise(startTask(adapter, task, {}, { runId: 'run-failed' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'demo_failed',
          message: 'Demo task failed.',
        },
      });
    });
  });

  it('exposes a portable task step boundary in task context', async () => {
    const calls: string[] = [];
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const prepareHelloStep = defineTaskStep({
      id: 'prepare-hello',
      run: () =>
        Effect.sync(() => {
          calls.push('prepare-hello');
          return 'Hi there';
        }),
    });
    const finishHelloStep = defineTaskStep({
      id: 'finish-hello',
      run: () =>
        Effect.sync(() => {
          calls.push('finish-hello');
        }),
    });
    const task = defineTask({
      id: 'demo.say-hello',
      steps: [prepareHelloStep, finishHelloStep],
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          const prepared = yield* context.step(prepareHelloStep, {});
          yield* context.step(finishHelloStep, {});
          return { message: prepared };
        }),
    });

    const run = await Effect.runPromise(startTask(adapter, task, {}, { runId: 'run-steps' }));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'completed',
      });
    });
    expect(calls).toEqual(['prepare-hello', 'finish-hello']);
    expect(task.steps).toEqual({
      'prepare-hello': prepareHelloStep,
      'finish-hello': finishHelloStep,
    });
  });

  it('marks in-process task runs as failed when a step is missing', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          yield* context.step('missing-step', {});
        }),
    });

    const run = await Effect.runPromise(
      startTask(adapter, task, {}, { runId: 'run-missing-step' }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(adapter, run))).resolves.toMatchObject({
        status: 'failed',
        error: {
          code: 'task_step_not_found',
          message: 'Task step is not registered.',
        },
      });
    });
  });

  it('rejects task step definitions whose record keys do not match their ids', () => {
    let failure: unknown;

    try {
      defineTask({
        id: 'demo.say-hello',
        steps: {
          'prepare-hello': defineTaskStep({
            id: 'wrong-step-id',
            run: () => Effect.succeed('Hi there'),
          }),
        },
        run: () => Effect.succeed({ message: 'Hi there' }),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      reason: 'task_definition_invalid',
      message: 'Task step key "prepare-hello" must match step id "wrong-step-id".',
      taskId: 'demo.say-hello',
      stepName: 'prepare-hello',
      stepId: 'wrong-step-id',
    });
  });

  it('rejects duplicate task step ids in array declarations', () => {
    const duplicateStep = defineTaskStep({
      id: 'prepare-hello',
      run: () => Effect.succeed('Hi there'),
    });
    let failure: unknown;

    try {
      defineTask({
        id: 'demo.say-hello',
        steps: [duplicateStep, duplicateStep],
        run: () => Effect.succeed({ message: 'Hi there' }),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      reason: 'task_definition_invalid',
      message: 'Task step id "prepare-hello" is duplicated.',
      taskId: 'demo.say-hello',
      stepId: 'prepare-hello',
    });
  });

  it('returns task failures for unknown runs', async () => {
    const store = createInMemoryTaskStorage();

    await expect(
      Effect.runPromise(
        Effect.flip(
          store.get({
            taskId: 'demo.say-hello',
            runId: 'missing',
          }),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_run_not_found',
      message: 'Task run not found.',
    });
  });

  it('rejects duplicate task run ids instead of overwriting snapshots', async () => {
    const store = createInMemoryTaskStorage();

    const first = await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'same-run',
      }),
    );
    await Effect.runPromise(
      store.update(first, {
        status: 'running',
        progress: {
          message: 'Original run state',
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          store.create({
            taskId: 'demo.say-hello',
            runId: 'same-run',
          }),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_run_already_exists',
      message: 'Task run already exists.',
    });

    await expect(Effect.runPromise(store.get(first))).resolves.toMatchObject({
      status: 'running',
      progress: {
        message: 'Original run state',
      },
    });
  });

  it('surfaces duplicate caller-provided run ids through the in-process adapter', async () => {
    const store = createInMemoryTaskStorage();
    const adapter = createInProcessTaskRuntime({
      storage: store,
      sleep: async () => {},
    });
    const task = defineTask({
      id: 'demo.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    });

    await Effect.runPromise(startTask(adapter, task, {}, { runId: 'same-run' }));

    await expect(
      Effect.runPromise(Effect.flip(startTask(adapter, task, {}, { runId: 'same-run' }))),
    ).resolves.toMatchObject({
      reason: 'task_run_already_exists',
      message: 'Task run already exists.',
    });
  });
});
