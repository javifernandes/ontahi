import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const start = vi.fn();
const resumeHook = vi.fn();
const getTaskWorkflow = vi.fn();
const getRun = vi.fn();
const create = vi.fn();
const attachRuntimeRef = vi.fn();
const update = vi.fn();
const loadSource = vi.fn();
const getSnapshot = vi.fn();
const claimInteraction = vi.fn();
const listRecent = vi.fn();

describe('vercel workflow task runtime adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    start.mockReset();
    resumeHook.mockReset();
    getRun.mockReset();
    getTaskWorkflow.mockReset();
    create.mockReset();
    attachRuntimeRef.mockReset();
    update.mockReset();
    loadSource.mockReset();
    getSnapshot.mockReset();
    claimInteraction.mockReset();
    listRecent.mockReset();
    vi.doMock('workflow/api', () => ({ getRun, resumeHook, start }));
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
        getSnapshot,
        claimInteraction,
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

  it('authorizes, atomically claims, and resumes a persisted interaction after runtime recreation', async () => {
    const ref = { taskId: 'TodoItem.deleteFromNamedList', runId: 'task-run-1' };
    const interaction = {
      id: 'approve-delete-items',
      kind: 'approval' as const,
      prompt: 'Delete two items?',
      proposal: {
        id: 'proposal-1',
        summary: 'Delete exactly two items.',
        requests: [{ version: 1, kind: 'graph-command' }],
      },
      createdAt: '2026-06-03T00:00:00.000Z',
    };
    const source = {
      ...ref,
      status: 'waiting' as const,
      input: { listName: 'Inbox' },
      trigger: { cause: 'user_request', actor: { kind: 'user' as const, id: 'user-1' } },
      checkpoint: { version: 1 as const, state: { step: 'approve-proposal' }, interaction },
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    const claimed = {
      ...ref,
      status: 'running' as const,
      updatedAt: '2026-06-03T00:01:00.000Z',
    };
    loadSource.mockReturnValue(Effect.succeed(source));
    claimInteraction.mockReturnValue(Effect.succeed(claimed));
    resumeHook.mockResolvedValue(undefined);

    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const createRuntime = () =>
      createVercelWorkflowTaskRuntime({
        taskRunStore: {
          create,
          attachRuntimeRef,
          update,
          loadSource,
          getSnapshot,
          claimInteraction,
          listRecent,
        },
        resolveWorkflow: getTaskWorkflow,
      });
    createRuntime();
    const recreated = createRuntime();
    const response = { interactionId: interaction.id, decision: 'approve' as const };

    await expect(
      Effect.runPromise(
        recreated.respondToInteraction!(ref, response, {
          actor: { kind: 'user', id: 'user-1' },
        }),
      ),
    ).resolves.toEqual(claimed);
    expect(claimInteraction).toHaveBeenCalledWith(ref, interaction.id, {
      version: 1,
      state: { step: 'approve-proposal' },
      response,
    });
    expect(resumeHook).toHaveBeenCalledWith(
      expect.stringMatching(/^ontahi-task-interaction:/),
      response,
    );
    expect(resumeHook.mock.calls[0]![0]).toContain(encodeURIComponent(ref.taskId));
    expect(resumeHook.mock.calls[0]![0]).toContain(encodeURIComponent(ref.runId));
  });

  it('rejects unauthorized, invalid, mismatched, and concurrently lost responses before resume', async () => {
    const ref = { taskId: 'fixture.choose', runId: 'task-run-1' };
    const source = {
      ...ref,
      status: 'waiting' as const,
      input: {},
      trigger: { cause: 'user_request', actor: { kind: 'user' as const, id: 'user-1' } },
      checkpoint: {
        version: 1 as const,
        state: { step: 'choose' },
        interaction: {
          id: 'choose-item',
          kind: 'choice' as const,
          prompt: 'Which?',
          options: [{ id: 'one', label: 'One', value: 1 }],
          createdAt: '2026-06-03T00:00:00.000Z',
        },
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    loadSource.mockReturnValue(Effect.succeed(source));
    claimInteraction.mockReturnValue(Effect.succeed(undefined));
    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const runtime = createVercelWorkflowTaskRuntime({
      taskRunStore: {
        create,
        attachRuntimeRef,
        update,
        loadSource,
        getSnapshot,
        claimInteraction,
        listRecent,
      },
      resolveWorkflow: getTaskWorkflow,
    });
    const respond = (response: { interactionId: string; optionId: string }, actorId = 'user-1') =>
      Effect.runPromise(
        runtime.respondToInteraction!(ref, response, {
          actor: { kind: 'user', id: actorId },
        }).pipe(Effect.either),
      );

    await expect(
      respond({ interactionId: 'choose-item', optionId: 'one' }, 'user-2'),
    ).resolves.toMatchObject({ _tag: 'Left', left: { reason: 'task_interaction_access_denied' } });
    await expect(respond({ interactionId: 'other', optionId: 'one' })).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'task_interaction_mismatch' },
    });
    await expect(
      respond({ interactionId: 'choose-item', optionId: 'missing' }),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'invalid_task_interaction_response' },
    });
    await expect(respond({ interactionId: 'choose-item', optionId: 'one' })).resolves.toMatchObject(
      {
        _tag: 'Left',
        left: { reason: 'task_interaction_not_pending' },
      },
    );
    expect(resumeHook).not.toHaveBeenCalled();
  });

  it('treats an already claimed response as idempotent without resuming twice', async () => {
    const ref = { taskId: 'fixture.choose', runId: 'task-run-1' };
    const snapshot = { ...ref, status: 'running' as const, updatedAt: '2026-06-03T00:01:00.000Z' };
    loadSource.mockReturnValue(
      Effect.succeed({
        ...snapshot,
        input: {},
        trigger: { cause: 'user_request', actor: { kind: 'user' as const, id: 'user-1' } },
        checkpoint: {
          version: 1 as const,
          state: { step: 'choose' },
          response: { interactionId: 'choose-item', optionId: 'one' },
        },
      }),
    );
    getSnapshot.mockReturnValue(Effect.succeed(snapshot));
    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const runtime = createVercelWorkflowTaskRuntime({
      taskRunStore: {
        create,
        attachRuntimeRef,
        update,
        loadSource,
        getSnapshot,
        claimInteraction,
        listRecent,
      },
      resolveWorkflow: getTaskWorkflow,
    });

    await expect(
      Effect.runPromise(
        runtime.respondToInteraction!(
          ref,
          { interactionId: 'choose-item', optionId: 'one' },
          { actor: { kind: 'user', id: 'user-1' } },
        ),
      ),
    ).resolves.toEqual(snapshot);
    expect(claimInteraction).not.toHaveBeenCalled();
    expect(resumeHook).not.toHaveBeenCalled();
  });

  it('lets only the atomic claim winner resume under concurrent responses', async () => {
    const ref = { taskId: 'fixture.approve', runId: 'task-run-1' };
    const source = {
      ...ref,
      status: 'waiting' as const,
      input: {},
      trigger: { cause: 'user_request', actor: { kind: 'user' as const, id: 'user-1' } },
      checkpoint: {
        version: 1 as const,
        state: { step: 'approve' },
        interaction: {
          id: 'approval',
          kind: 'approval' as const,
          prompt: 'Approve?',
          proposal: { id: 'proposal', summary: 'Exact proposal', requests: [] },
          createdAt: '2026-06-03T00:00:00.000Z',
        },
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    const claimed = { ...ref, status: 'running' as const, updatedAt: source.updatedAt };
    loadSource.mockReturnValue(Effect.succeed(source));
    claimInteraction
      .mockReturnValueOnce(Effect.succeed(claimed))
      .mockReturnValueOnce(Effect.succeed(undefined));
    resumeHook.mockResolvedValue(undefined);
    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const runtime = createVercelWorkflowTaskRuntime({
      taskRunStore: {
        create,
        attachRuntimeRef,
        update,
        loadSource,
        getSnapshot,
        claimInteraction,
        listRecent,
      },
      resolveWorkflow: getTaskWorkflow,
    });
    const respond = () =>
      Effect.runPromise(
        runtime.respondToInteraction!(
          ref,
          { interactionId: 'approval', decision: 'approve' },
          { actor: { kind: 'user', id: 'user-1' } },
        ).pipe(Effect.either),
      );

    const results = await Promise.all([respond(), respond()]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _tag: 'Right', right: claimed }),
        expect.objectContaining({
          _tag: 'Left',
          left: expect.objectContaining({ reason: 'task_interaction_not_pending' }),
        }),
      ]),
    );
    expect(resumeHook).toHaveBeenCalledOnce();
  });

  it('marks the task failed when a claimed native hook cannot be resumed', async () => {
    const ref = { taskId: 'fixture.approve', runId: 'task-run-1' };
    loadSource.mockReturnValue(
      Effect.succeed({
        ...ref,
        status: 'waiting',
        input: {},
        trigger: { cause: 'user_request', actor: { kind: 'user', id: 'user-1' } },
        checkpoint: {
          version: 1,
          state: { step: 'approve' },
          interaction: {
            id: 'approval',
            kind: 'approval',
            prompt: 'Approve?',
            proposal: { id: 'proposal', summary: 'Exact proposal', requests: [] },
            createdAt: '2026-06-03T00:00:00.000Z',
          },
        },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    claimInteraction.mockReturnValue(
      Effect.succeed({ ...ref, status: 'running', updatedAt: '2026-06-03T00:01:00.000Z' }),
    );
    resumeHook.mockRejectedValue(new Error('hook unavailable'));
    update.mockImplementation((identity, patch) => Effect.succeed({ ...identity, ...patch }));
    const { createVercelWorkflowTaskRuntime } = await import('./runtime.js');
    const runtime = createVercelWorkflowTaskRuntime({
      taskRunStore: {
        create,
        attachRuntimeRef,
        update,
        loadSource,
        getSnapshot,
        claimInteraction,
        listRecent,
      },
      resolveWorkflow: getTaskWorkflow,
    });

    await expect(
      Effect.runPromise(
        runtime.respondToInteraction!(
          ref,
          { interactionId: 'approval', decision: 'approve' },
          { actor: { kind: 'user', id: 'user-1' } },
        ).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'task_interaction_resume_failed' },
    });
    expect(update).toHaveBeenCalledWith(
      ref,
      expect.objectContaining({
        status: 'failed',
        error: {
          code: 'task_interaction_resume_failed',
          message: 'Failed to resume task interaction.',
        },
      }),
    );
  });
});
