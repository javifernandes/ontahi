import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const start = vi.fn();
const getTaskWorkflow = vi.fn();
const getRun = vi.fn();
const create = vi.fn();
const attachRuntimeRef = vi.fn();
const update = vi.fn();
const loadSource = vi.fn();
const listRecent = vi.fn();

describe('vercel workflow task runtime adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    start.mockReset();
    getRun.mockReset();
    getTaskWorkflow.mockReset();
    create.mockReset();
    attachRuntimeRef.mockReset();
    update.mockReset();
    loadSource.mockReset();
    listRecent.mockReset();
    vi.doMock('workflow/api', () => ({ getRun, start }));
  });

  it('creates a durable task run and starts Vercel with only the task run reference', async () => {
    const workflow = vi.fn();
    const trigger = {
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
    } as const;
    const subject = {
      type: 'book',
      id: 'book-1',
    };

    getTaskWorkflow.mockReturnValue(workflow);
    create.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        status: 'queued',
        input: { greeting: 'Hi' },
        trigger,
        subject,
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    attachRuntimeRef.mockReturnValue(
      Effect.succeed({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
        status: 'queued',
        subject,
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    start.mockResolvedValue({
      runId: 'wrun-1',
      status: Promise.resolve('pending'),
    });

    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const adapter = createVercelWorkflowTaskRuntime({
      taskRunStore: {
        create,
        attachRuntimeRef,
        update,
        loadSource,
        listRecent,
      },
      resolveWorkflow: getTaskWorkflow,
    });
    const task = {
      id: 'fixture.say-hello',
      run: () => Effect.succeed({ message: 'Hi there' }),
    };
    const ref = await Effect.runPromise(
      adapter.start(task, { greeting: 'Hi' }, { runId: 'bookops-run-1', trigger, subject }),
    );

    expect(create).toHaveBeenCalledWith({
      taskId: 'fixture.say-hello',
      runId: 'bookops-run-1',
      input: { greeting: 'Hi' },
      trigger,
      subject,
    });
    expect(start).toHaveBeenCalledWith(workflow, [
      {
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
      },
    ]);
    expect(attachRuntimeRef).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'fixture.say-hello',
        runId: 'bookops-run-1',
      }),
      {
        name: 'vercel-workflow',
        runId: 'wrun-1',
      },
    );
    expect(ref).toEqual({
      taskId: 'fixture.say-hello',
      runId: 'bookops-run-1',
      status: 'queued',
      subject,
    });
  });
});
