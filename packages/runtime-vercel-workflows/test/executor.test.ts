import { field, value } from '@ontahi/core/data-graph';
import type { TaskDefinition } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { workflowSleep } = vi.hoisted(() => ({
  workflowSleep: vi.fn(() => Promise.resolve()),
}));

vi.mock('server-only', () => ({}));
vi.mock('workflow', () => ({ sleep: workflowSleep }));

const taskDefinitions = new Map<string, TaskDefinition<any, any>>();
const loadSource = vi.fn();
const update = vi.fn();
const writeProgressEvent = vi.fn(() => Promise.resolve());
const writeResultEvent = vi.fn(() => Promise.resolve());

const createExecutor = async () => {
  const { createVercelWorkflowTaskExecutor } = await import('../src/executor.js');

  return createVercelWorkflowTaskExecutor({
    taskRunStore: {
      loadSource,
      update,
    },
    getTaskDefinition: taskId => taskDefinitions.get(taskId),
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
