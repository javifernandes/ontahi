import { createInMemoryTaskStorage } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const workflowMocks = vi.hoisted(() => ({
  apiLoads: 0,
  runtimeLoads: 0,
  getRun: vi.fn(),
  stepsList: vi.fn(),
}));

vi.mock('workflow/api', () => {
  workflowMocks.apiLoads += 1;
  return {
    getRun: workflowMocks.getRun,
  };
});

vi.mock('workflow/runtime', () => {
  workflowMocks.runtimeLoads += 1;
  return {
    getWorld: () => ({
      steps: {
        list: workflowMocks.stepsList,
      },
    }),
  };
});

const getRun = workflowMocks.getRun;
const stepsList = workflowMocks.stepsList;

describe('task run reconciliation', () => {
  beforeEach(() => {
    getRun.mockReset();
    stepsList.mockReset();
    stepsList.mockResolvedValue({ data: [] });
  });

  it('does not load the Workflow SDK for runs that do not require reconciliation', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'fixture.say-hello',
        runId: 'run-without-runtime',
      }),
    );

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(source, store));

    expect(reconciled).toEqual(source);
    expect(workflowMocks.apiLoads).toBe(0);
    expect(workflowMocks.runtimeLoads).toBe(0);
  });

  it('patches stale non-terminal Vercel task runs from runtime status', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'fixture.say-hello',
        runId: 'run-1',
      }),
    );
    await Effect.runPromise(
      store.attachRuntimeRef(source, {
        name: 'vercel-workflow',
        runId: 'wrun-1',
      }),
    );
    const staleSource = await Effect.runPromise(store.loadSource(source));

    getRun.mockReturnValue({
      status: Promise.resolve('failed'),
      completedAt: Promise.resolve(new Date('2026-06-04T00:00:00.000Z')),
    });

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(staleSource, store));

    expect(reconciled).toMatchObject({
      taskId: 'fixture.say-hello',
      runId: 'run-1',
      status: 'failed',
      completedAt: '2026-06-04T00:00:00.000Z',
      error: {
        code: 'task_runtime_failed',
        message: 'Task runtime reported the run failed.',
      },
    });
    await expect(Effect.runPromise(store.getSnapshot(source))).resolves.toMatchObject({
      status: 'failed',
      completedAt: '2026-06-04T00:00:00.000Z',
    });
  });

  it('extracts structured task errors from failed Vercel workflow steps', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'book.import-github-markdown',
        runId: 'run-3',
      }),
    );
    await Effect.runPromise(
      store.attachRuntimeRef(source, {
        name: 'vercel-workflow',
        runId: 'wrun-3',
      }),
    );
    const staleSource = await Effect.runPromise(store.loadSource(source));

    getRun.mockReturnValue({
      status: Promise.resolve('failed'),
      completedAt: Promise.resolve(new Date('2026-06-04T00:00:00.000Z')),
    });
    stepsList.mockResolvedValue({
      data: [
        {
          status: 'failed',
          error: {
            message:
              'Step "bookImportGithubMarkdownSourceStep" failed after 3 retries: {"reason":"book_slug_already_exists","message":"A book already exists for slug \\"example-markdown-book\\".","status":500}',
          },
          completedAt: new Date('2026-06-04T00:00:00.000Z'),
        },
      ],
    });

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(staleSource, store));

    expect(stepsList).toHaveBeenCalledWith({
      runId: 'wrun-3',
      resolveData: 'none',
    });
    expect(reconciled).toMatchObject({
      status: 'failed',
      error: {
        code: 'book_slug_already_exists',
        message: 'A book already exists for slug "example-markdown-book".',
      },
    });
    await expect(Effect.runPromise(store.getSnapshot(source))).resolves.toMatchObject({
      status: 'failed',
      error: {
        code: 'book_slug_already_exists',
        message: 'A book already exists for slug "example-markdown-book".',
      },
    });
  });

  it('enriches terminal generic Vercel failures from failed workflow steps', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'book.import-github-markdown',
        runId: 'run-4',
      }),
    );
    await Effect.runPromise(
      store.update(source, {
        status: 'failed',
        error: {
          code: 'task_failed',
          message: 'Task failed.',
        },
      }),
    );
    await Effect.runPromise(
      store.attachRuntimeRef(source, {
        name: 'vercel-workflow',
        runId: 'wrun-4',
      }),
    );
    const failedSource = await Effect.runPromise(store.loadSource(source));

    getRun.mockReturnValue({
      status: Promise.resolve('failed'),
      completedAt: Promise.resolve(new Date('2026-06-04T00:00:00.000Z')),
    });
    stepsList.mockResolvedValue({
      data: [
        {
          status: 'failed',
          error: {
            message:
              'Step "bookImportGithubMarkdownSourceStep" failed after 3 retries: {"reason":"book_slug_already_exists","message":"A book already exists for slug \\"example-markdown-book\\".","status":500}',
          },
          completedAt: new Date('2026-06-04T00:00:00.000Z'),
        },
      ],
    });

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(failedSource, store));

    expect(reconciled).toMatchObject({
      status: 'failed',
      error: {
        code: 'book_slug_already_exists',
        message: 'A book already exists for slug "example-markdown-book".',
      },
    });
  });

  it('enriches terminal unknown Vercel failures from failed workflow steps', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'book.import-github-markdown',
        runId: 'run-5',
      }),
    );
    await Effect.runPromise(
      store.attachRuntimeRef(source, {
        name: 'vercel-workflow',
        runId: 'wrun-5',
      }),
    );
    await Effect.runPromise(
      store.update(source, {
        status: 'failed',
        error: {
          code: 'task_runtime_failed',
          message: 'Unknown error',
        },
        updatedAt: '2026-06-04T00:00:00.000Z',
      }),
    );
    const failedSource = await Effect.runPromise(store.loadSource(source));

    getRun.mockReturnValue({
      status: Promise.resolve('failed'),
      completedAt: Promise.resolve(new Date('2026-06-04T00:00:00.000Z')),
    });
    stepsList.mockResolvedValue({
      data: [
        {
          status: 'failed',
          error: {
            message:
              'Step "bookImportGithubMarkdownSourceStep" failed after 3 retries: {"reason":"github_markdown_import_failed","message":"Could not extract or sync the Markdown book. No chapter markdown files found under numbered part folders in /tmp/source","status":500}',
          },
          completedAt: new Date('2026-06-04T00:00:00.000Z'),
        },
      ],
    });

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(failedSource, store));

    expect(reconciled).toMatchObject({
      status: 'failed',
      error: {
        code: 'github_markdown_import_failed',
        message:
          'Could not extract or sync the Markdown book. No chapter markdown files found under numbered part folders in /tmp/source',
      },
      updatedAt: '2026-06-04T00:00:00.000Z',
    });
  });

  it('leaves task runs without a supported runtime untouched', async () => {
    const store = createInMemoryTaskStorage();
    const source = await Effect.runPromise(
      store.create({
        taskId: 'fixture.say-hello',
        runId: 'run-2',
      }),
    );

    const { reconcileTaskRunSource } = await import('../src/reconciliation.js');
    const reconciled = await Effect.runPromise(reconcileTaskRunSource(source, store));

    expect(reconciled).toEqual(source);
    expect(getRun).not.toHaveBeenCalled();
  });
});
