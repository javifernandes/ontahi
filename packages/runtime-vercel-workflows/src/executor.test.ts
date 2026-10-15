import { field, value } from '@ontahi/core/data-graph';
import {
  getRequiredDataGraphRuntime,
  type OperationRuntimeContext,
} from '@ontahi/core/runtime/server';
import type { TaskDefinition, TaskRunSource } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createHook, hookResponses, workflowSleep } = vi.hoisted(() => ({
  createHook: vi.fn(),
  hookResponses: [] as unknown[],
  workflowSleep: vi.fn(() => Promise.resolve()),
}));

vi.mock('server-only', () => ({}));
vi.mock('workflow', () => ({ createHook, sleep: workflowSleep }));

const taskDefinitions = new Map<string, TaskDefinition<any, any>>();
const loadSource = vi.fn();
const update = vi.fn();
const writeProgressEvent = vi.fn(() => Promise.resolve());
const writeResultEvent = vi.fn(() => Promise.resolve());

const createExecutor = async (
  createExecutionContext?: (source: TaskRunSource) => OperationRuntimeContext | undefined,
) => {
  const { createVercelWorkflowTaskExecutor } = await import('./executor.js');

  return createVercelWorkflowTaskExecutor({
    taskRunStore: {
      loadSource,
      update,
    },
    getTaskDefinition: taskId => taskDefinitions.get(taskId),
    ...(createExecutionContext ? { createExecutionContext } : {}),
    writeProgressEvent,
    writeResultEvent,
  });
};

describe('vercel workflow task executor', () => {
  beforeEach(() => {
    taskDefinitions.clear();
    loadSource.mockReset();
    update.mockReset();
    writeProgressEvent.mockClear();
    writeResultEvent.mockClear();
    workflowSleep.mockClear();
    createHook.mockReset();
    hookResponses.length = 0;
    createHook.mockImplementation(({ token }: { token: string }) => ({
      token,
      getConflict: () => Promise.resolve(null),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(hookResponses.shift()).then(resolve, reject),
      dispose: vi.fn(),
    }));
    update.mockImplementation(ref =>
      Effect.succeed({
        ...ref,
        status: 'running',
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
  });

  it('rehydrates workflow context from the task run before calling generated steps', async () => {
    const trigger = {
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
      ingress: {
        kind: 'server_action',
      },
    } as const;
    const subject = {
      type: 'book',
      id: 'book-1',
    };
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger,
        subject,
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    const runStep = vi.fn(async input => ({ stepInput: input.input }));
    taskDefinitions.set('fixture.say-hello', {
      id: 'fixture.say-hello',
      run: (_input: unknown, context) =>
        Effect.gen(function* () {
          const stepResult = yield* context.step('prepare-hello', { greeting: 'Hi' });

          return {
            actorId: context.trigger.actor?.id,
            subjectId: context.subject?.id,
            stepResult,
          };
        }),
    });
    const executor = await createExecutor();

    const result = await executor.runTask(
      {
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
      },
      runStep,
    );

    expect(result).toEqual({
      actorId: 'user-1',
      subjectId: 'book-1',
      stepResult: {
        stepInput: {
          greeting: 'Hi',
        },
      },
    });
    expect(runStep).toHaveBeenCalledWith({
      taskId: 'fixture.say-hello',
      runId: 'bookops-run-1',
      stepName: 'prepare-hello',
      input: {
        greeting: 'Hi',
      },
    });
    expect(loadSource).toHaveBeenCalledWith({
      taskId: 'fixture.say-hello',
      runId: 'bookops-run-1',
    });
    expect(update).toHaveBeenCalledWith(
      {
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
      },
      expect.objectContaining({
        status: 'completed',
        result,
      }),
    );
    expect(writeResultEvent).toHaveBeenCalledWith('bookops-run-1', result);
  });

  it('uses the durable Workflow sleep primitive from task context', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.wait',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.wait', {
      id: 'fixture.wait',
      run: (_input: unknown, context) =>
        Effect.gen(function* () {
          yield* context.sleep(20_000);
          return { waited: true };
        }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.wait',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).resolves.toEqual({ waited: true });

    expect(workflowSleep).toHaveBeenCalledWith(20_000);
  });

  it('rehydrates the host execution context for graph-backed explicit steps', async () => {
    const dataGraphRuntime = { name: 'todo-runtime' };
    const source = {
      taskId: 'fixture.context',
      runId: 'bookops-run-1',
      status: 'queued' as const,
      input: {},
      trigger: { cause: 'user_request' },
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    loadSource.mockReturnValue(Effect.succeed(source));
    taskDefinitions.set('fixture.context', {
      id: 'fixture.context',
      execution: {
        initial: () => ({ step: 'complete' }),
        steps: {
          complete: {
            run: () =>
              Effect.succeed({
                kind: 'complete',
                result: { runtime: getRequiredDataGraphRuntime<typeof dataGraphRuntime>().name },
              } as const),
          },
        },
      },
      run: () => Effect.die('unused'),
    });
    const executor = await createExecutor(() => ({
      scope: 'fixture.context',
      telemetrySpanName: 'fixture.context',
      resources: new Map([['dataGraph.runtime', dataGraphRuntime]]),
    }));

    await expect(
      executor.runTask({ taskId: source.taskId, runId: source.runId }, vi.fn()),
    ).resolves.toEqual({ runtime: 'todo-runtime' });
  });

  it('fails explicitly when a workflow task requests an unsupported interaction', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.choose',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.choose', {
      id: 'fixture.choose',
      run: (_input: unknown, context) =>
        context.interact.choice({
          prompt: 'Continue?',
          options: [{ id: 'yes', label: 'Yes', value: true }],
        }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.choose',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'task_interaction_unavailable',
      taskId: 'fixture.choose',
      runId: 'bookops-run-1',
    });
    expect(update).toHaveBeenCalledWith(
      {
        taskId: 'fixture.choose',
        runId: 'bookops-run-1',
      },
      expect.objectContaining({
        status: 'failed',
        error: {
          code: 'task_interaction_unavailable',
          message: 'Task interaction is unavailable for this runtime.',
        },
      }),
    );
  });

  it('fails explicitly when a workflow task requests an unsupported approval', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.approve',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.approve', {
      id: 'fixture.approve',
      run: (_input: unknown, context) =>
        context.interact.approval({
          prompt: 'Apply this change?',
          proposal: {
            id: 'change-1',
            summary: 'Apply one exact change.',
            requests: [{ version: 1, kind: 'graph-command' }],
          },
        }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.approve',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'task_interaction_unavailable',
      taskId: 'fixture.approve',
      runId: 'bookops-run-1',
    });
  });

  it('fails explicitly when a workflow task requests unsupported input', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.input',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.input', {
      id: 'fixture.input',
      run: (_input: unknown, context) =>
        context.interact.input({
          prompt: 'What title?',
          input: { type: 'string' },
        }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.input',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'task_interaction_unavailable',
      taskId: 'fixture.input',
      runId: 'bookops-run-1',
    });
  });

  it('runs one explicit execution unchanged across choice and approval hooks', async () => {
    const run = vi.fn(() => Effect.succeed({ completed: true }));
    const proposal = {
      id: 'proposal-1',
      summary: 'Delete the selected items.',
      requests: [{ version: 1, kind: 'graph-command' }],
    };
    let source = {
      taskId: 'fixture.explicit-execution',
      runId: 'bookops-run-1',
      status: 'queued' as const,
      input: { candidates: ['one', 'two'] },
      trigger: { cause: 'user_request' },
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    loadSource.mockImplementation(() => Effect.succeed(source));
    update.mockImplementation((_ref, patch) => {
      source = { ...source, ...patch } as typeof source;
      return Effect.succeed(source);
    });
    hookResponses.push(
      { interactionId: 'choose-item', optionId: 'two' },
      { interactionId: 'approve-item', decision: 'approve' },
    );
    taskDefinitions.set('fixture.explicit-execution', {
      id: 'fixture.explicit-execution',
      execution: {
        initial: () => ({ step: 'choose' }),
        steps: {
          choose: {
            run: ({ state, response }) =>
              response
                ? Effect.succeed({ kind: 'continue', state: { step: 'approve' } } as const)
                : Effect.succeed({
                    kind: 'interaction',
                    state,
                    interaction: {
                      id: 'choose-item',
                      prompt: 'Which item?',
                      options: [
                        { id: 'one', label: 'One', value: 'one' },
                        { id: 'two', label: 'Two', value: 'two' },
                      ],
                    },
                  } as const),
          },
          approve: {
            run: ({ state, response }) =>
              response
                ? Effect.succeed({
                    kind: 'complete',
                    result: { completed: true },
                  } as const)
                : Effect.succeed({
                    kind: 'interaction',
                    state,
                    interaction: {
                      id: 'approve-item',
                      prompt: 'Apply?',
                      proposal,
                    },
                  } as const),
          },
        },
      },
      run,
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.explicit-execution',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).resolves.toEqual({ completed: true });
    expect(run).not.toHaveBeenCalled();
    expect(createHook).toHaveBeenCalledTimes(2);
    expect(createHook.mock.calls.map(([options]) => options.token)).toEqual([
      expect.stringMatching(/^ontahi-task-interaction:/),
      expect.stringMatching(/^ontahi-task-interaction:/),
    ]);
    expect(createHook.mock.calls[0]![0].token).not.toBe(createHook.mock.calls[1]![0].token);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'fixture.explicit-execution' }),
      expect.objectContaining({
        status: 'waiting',
        checkpoint: expect.objectContaining({
          interaction: expect.objectContaining({ id: 'approve-item', proposal }),
        }),
      }),
    );
    expect(update).toHaveBeenLastCalledWith(
      {
        taskId: 'fixture.explicit-execution',
        runId: 'bookops-run-1',
      },
      expect.objectContaining({
        status: 'completed',
        result: { completed: true },
      }),
    );
  });

  it('keeps explicit Event waits outside this interaction vertical', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.event-wait',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.event-wait', {
      id: 'fixture.event-wait',
      execution: {
        initial: () => ({ step: 'wait' }),
        steps: {
          wait: {
            run: ({ state }) =>
              Effect.succeed({
                kind: 'event',
                state,
                event: {
                  declaration: { id: 'FixtureReady', version: 1 } as never,
                },
              } as const),
          },
        },
      },
      run: () => Effect.die('unused'),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask({ taskId: 'fixture.event-wait', runId: 'bookops-run-1' }, vi.fn()),
    ).rejects.toMatchObject({
      reason: 'task_definition_invalid',
      message: 'Vercel Workflow Task Runtime does not support durable Event waits.',
    });
  });

  it('fails rather than publishing a wait when another workflow owns the native hook', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.conflict',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    createHook.mockImplementation(() => ({
      getConflict: () => Promise.resolve({ runId: 'other-workflow-run' }),
      then: vi.fn(),
      dispose: vi.fn(),
    }));
    taskDefinitions.set('fixture.conflict', {
      id: 'fixture.conflict',
      execution: {
        initial: () => ({ step: 'approve' }),
        steps: {
          approve: {
            run: ({ state }) =>
              Effect.succeed({
                kind: 'interaction',
                state,
                interaction: {
                  id: 'approve',
                  prompt: 'Approve?',
                  proposal: {
                    id: 'proposal',
                    summary: 'Exact proposal',
                    requests: [{ version: 1, kind: 'graph-command' }],
                  },
                },
              } as const),
          },
        },
      },
      run: () => Effect.die('unused'),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask({ taskId: 'fixture.conflict', runId: 'bookops-run-1' }, vi.fn()),
    ).rejects.toMatchObject({
      reason: 'task_definition_invalid',
      interactionId: 'approve',
      workflowRunId: 'other-workflow-run',
    });
    expect(update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'waiting' }),
    );
  });

  it('validates persisted task input before running a workflow task', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {
          name: '',
        },
        trigger: {
          cause: 'user_request',
        },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    const run = vi.fn(() => Effect.succeed({ message: 'Hi there' }));
    taskDefinitions.set('fixture.say-hello', {
      id: 'fixture.say-hello',
      input: value('SayHelloTaskInput', {
        name: field.nonEmptyString(),
      }),
      run,
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.say-hello',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'invalid_task_input',
    });
    expect(run).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      {
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
      },
      expect.objectContaining({
        status: 'failed',
        error: {
          code: 'invalid_task_input',
          message: expect.any(String),
        },
      }),
    );
  });

  it('validates progress before persisting workflow task snapshots', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.progress',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.progress', {
      id: 'fixture.progress',
      progress: value('FixtureProgress', {
        percent: field.number({ min: 0, max: 100 }),
      }),
      run: (_input: unknown, context) =>
        Effect.gen(function* () {
          yield* context.progress({ percent: 101 });
          return { completed: true };
        }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.progress',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'invalid_task_progress',
    });
    expect(writeProgressEvent).not.toHaveBeenCalled();
  });

  it('validates final output before completing a workflow task', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.output',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.output', {
      id: 'fixture.output',
      output: value('FixtureOutput', {
        count: field.positiveInteger(),
      }),
      run: () => Effect.succeed({ count: 0 }),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'fixture.output',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'invalid_task_output',
    });
    expect(writeResultEvent).not.toHaveBeenCalled();
  });

  it('validates step output before returning it to a workflow task', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.step-output',
        runId: 'bookops-run-1',
        status: 'running',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('fixture.step-output', {
      id: 'fixture.step-output',
      steps: {
        count: {
          id: 'count',
          output: value('CountStepOutput', {
            count: field.positiveInteger(),
          }),
          run: () => Effect.succeed({ count: 0 }),
        },
      },
      run: () => Effect.succeed({}),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTaskStep(
        {
          taskId: 'fixture.step-output',
          runId: 'bookops-run-1',
          stepName: 'count',
          input: {},
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'invalid_task_step_output',
    });
  });

  it('persists structured task failures embedded in Vercel Workflow step errors', async () => {
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'book.import-github-markdown',
        runId: 'bookops-run-1',
        status: 'queued',
        input: {},
        trigger: {
          cause: 'user_request',
        },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    taskDefinitions.set('book.import-github-markdown', {
      id: 'book.import-github-markdown',
      run: () =>
        Effect.fail(
          new Error(
            'Step "bookImportGithubMarkdownSourceStep" failed after 3 retries: {"reason":"github_markdown_import_failed","message":"Could not extract or sync the Markdown book. No chapter markdown files found under numbered part folders in /tmp/source","status":500}',
          ) as never,
        ),
    });
    const executor = await createExecutor();

    await expect(
      executor.runTask(
        {
          taskId: 'book.import-github-markdown',
          runId: 'bookops-run-1',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      reason: 'github_markdown_import_failed',
      message:
        'Could not extract or sync the Markdown book. No chapter markdown files found under numbered part folders in /tmp/source',
    });
    expect(update).toHaveBeenCalledWith(
      {
        taskId: 'book.import-github-markdown',
        runId: 'bookops-run-1',
      },
      expect.objectContaining({
        status: 'failed',
        error: {
          code: 'github_markdown_import_failed',
          message:
            'Could not extract or sync the Markdown book. No chapter markdown files found under numbered part folders in /tmp/source',
        },
      }),
    );
  });

  it('rehydrates step context from the task run before calling nested generated steps', async () => {
    const trigger = {
      cause: 'external_event',
      ingress: {
        kind: 'http',
        deliveryId: 'delivery-1',
      },
      source: {
        provider: 'github',
        event: 'push',
      },
    } as const;
    const subject = {
      type: 'book',
      id: 'book-1',
    };
    loadSource.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        status: 'running',
        input: {},
        trigger,
        subject,
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    const runStep = vi.fn(async input => ({ nestedInput: input.input }));
    taskDefinitions.set('fixture.say-hello', {
      id: 'fixture.say-hello',
      steps: {
        'prepare-hello': {
          id: 'prepare-hello',
          run: (_input: unknown, context) =>
            Effect.gen(function* () {
              const nested = yield* context.step('finish-hello', { message: 'Hi there' });

              return {
                deliveryId: context.trigger.ingress?.deliveryId,
                subjectId: context.subject?.id,
                nested,
              };
            }),
        },
      },
      run: () => Effect.succeed({}),
    });
    const executor = await createExecutor();

    const result = await executor.runTaskStep(
      {
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        stepName: 'prepare-hello',
        input: {},
      },
      runStep,
    );

    expect(result).toEqual({
      deliveryId: 'delivery-1',
      subjectId: 'book-1',
      nested: {
        nestedInput: {
          message: 'Hi there',
        },
      },
    });
    expect(runStep).toHaveBeenCalledWith({
      taskId: 'fixture.say-hello',
      runId: 'bookops-run-1',
      stepName: 'finish-hello',
      input: {
        message: 'Hi there',
      },
    });
  });
});
