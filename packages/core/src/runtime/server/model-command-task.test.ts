import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { getCurrentInvocationContext, withInvocationContext } from './invocation-context.js';
import {
  createModelCommandTask,
  createTaskBackedModelCommandRuntime,
  type ModelCommandTaskHost,
} from './model-command-task.js';
import type { PreparedModelCommandRuntime } from './model-command.js';
import { ModelInterpretationError } from './model-interpretation.js';
import {
  createInMemoryTaskStorage,
  createInProcessTaskRuntime,
  getTaskSnapshot,
  respondToTaskInteraction,
  startTask,
} from './tasks.js';

const input = { text: 'rename the document' };
const proposal = {
  kind: 'invoke' as const,
  operationId: 'Document.rename',
  input: { name: 'Notes' },
};

const fixture = () => {
  const prepare = vi.fn(async () => ({ status: 'proposed' as const, request: proposal }));
  const execute = vi.fn(async () => ({
    status: 'executed' as const,
    message: 'Document renamed.',
    request: proposal,
  }));
  const runtime = {
    prepare,
    execute,
    submit: vi.fn(),
  } as unknown as PreparedModelCommandRuntime;
  const task = createModelCommandTask({
    runtime,
    approval: () => ({
      prompt: 'Rename this document?',
      summary: 'Rename the document to Notes.',
    }),
  });
  const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
  taskRuntime.register?.(task);
  return { prepare, execute, task, taskRuntime };
};

describe('Model Command Task', () => {
  it('checkpoints a canonical mutation for approval before executing it', async () => {
    const f = fixture();
    const run = await Effect.runPromise(
      startTask(f.taskRuntime, f.task, input, {
        runId: 'model-approval',
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(f.taskRuntime, run))).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-model-command',
          kind: 'approval',
          prompt: 'Rename this document?',
          proposal: {
            id: 'model-approval:model-command',
            summary: 'Rename the document to Notes.',
            requests: [proposal],
          },
        },
      });
    });
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.execute).not.toHaveBeenCalled();

    await Effect.runPromise(
      respondToTaskInteraction(
        f.taskRuntime,
        run,
        { interactionId: 'approve-model-command', decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(f.taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Document renamed.', request: proposal },
      });
    });
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.execute).toHaveBeenCalledOnce();
  });

  it('executes an unambiguous effect without approval by default', async () => {
    const f = fixture();
    const task = createModelCommandTask({
      runtime: {
        prepare: f.prepare,
        execute: f.execute,
        submit: vi.fn(),
      } as unknown as PreparedModelCommandRuntime,
    });
    const run = await Effect.runPromise(startTask(f.taskRuntime, task, input));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(f.taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Document renamed.' },
      });
    });
    expect(f.execute).toHaveBeenCalledOnce();
  });

  it('completes immediately when interpretation answers without a canonical request', async () => {
    const prepare = vi.fn(async () => ({
      status: 'answered' as const,
      message: 'You can rename documents.',
    }));
    const execute = vi.fn();
    const task = createModelCommandTask({
      runtime: { prepare, execute, submit: vi.fn() } as unknown as PreparedModelCommandRuntime,
    });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(startTask(taskRuntime, task, input));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'answered', message: 'You can rename documents.' },
      });
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('checkpoints a model choice and executes the selected canonical request', async () => {
    const second = { ...proposal, input: { name: 'Archive' } };
    const prepare = vi.fn(async () => ({
      status: 'choice' as const,
      prompt: 'Which document?',
      options: [
        { id: 'notes', label: 'Notes', request: proposal },
        { id: 'archive', label: 'Archive', request: second },
      ],
    }));
    const execute = vi.fn(async (_input, request) => ({
      status: 'executed' as const,
      message: 'Document renamed.',
      request,
    }));
    const task = createModelCommandTask({
      runtime: { prepare, execute, submit: vi.fn() } as unknown as PreparedModelCommandRuntime,
    });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(
      startTask(taskRuntime, task, input, {
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'choose-model-command',
          kind: 'choice',
          prompt: 'Which document?',
          options: [
            { id: 'notes', label: 'Notes' },
            { id: 'archive', label: 'Archive' },
          ],
        },
      });
    });
    await Effect.runPromise(
      respondToTaskInteraction(
        taskRuntime,
        run,
        { interactionId: 'choose-model-command', optionId: 'archive' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', request: second },
      });
    });
    expect(execute).toHaveBeenCalledWith(input, second, expect.any(AbortSignal), {
      kind: 'choice-option',
    });
  });

  it('continues a partial Operation application through consecutive Hole choices', async () => {
    const openApplication = {
      kind: 'operation-application' as const,
      operationId: 'Document.move',
      arguments: {
        source: { kind: 'hole' as const, id: 'source' },
        destination: { kind: 'hole' as const, id: 'destination' },
      },
    };
    const candidate = (entityName: string, id: string, label: string) => ({
      id: JSON.stringify({ kind: 'entity-ref', entityName, ref: { id } }),
      label,
      candidate: {
        ref: { kind: 'entity-ref', entityName, ref: { id } },
        label,
      },
    });
    const sourceChoice = {
      status: 'choice' as const,
      prompt: 'Which source did you mean?',
      proposal: {
        application: openApplication,
        bindings: {
          source: { kind: 'entity-match' as const, text: 'Inbox' },
          destination: { kind: 'entity-match' as const, text: 'Later' },
        },
      },
      candidates: {},
      holeId: 'source',
      options: [candidate('List', 'inbox-a', 'Inbox A'), candidate('List', 'inbox-b', 'Inbox B')],
    };
    const destinationChoice = {
      ...sourceChoice,
      prompt: 'Which destination did you mean?',
      holeId: 'destination',
      options: [candidate('List', 'later-a', 'Later A'), candidate('List', 'later-b', 'Later B')],
    };
    const request = {
      kind: 'invoke' as const,
      operationId: 'Document.move',
      input: {
        source: { kind: 'entity-ref', entityName: 'List', ref: { id: 'inbox-b' } },
        destination: { kind: 'entity-ref', entityName: 'List', ref: { id: 'later-a' } },
      },
    };
    const prepare = vi.fn(async () => ({
      status: 'application-choice' as const,
      choice: sourceChoice,
    }));
    const continueApplication = vi
      .fn()
      .mockResolvedValueOnce({ status: 'application-choice', choice: destinationChoice })
      .mockResolvedValueOnce({ status: 'proposed', request });
    const execute = vi.fn(async () => ({
      status: 'executed' as const,
      message: 'Document moved.',
      request,
    }));
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    const task = createModelCommandTask({
      runtime: {
        prepare,
        continueApplication,
        execute,
        submit: vi.fn(),
      } as unknown as PreparedModelCommandRuntime,
    });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(
      startTask(taskRuntime, task, input, {
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        interaction: {
          id: 'Document.move:source',
          kind: 'choice',
          options: [{ label: 'Inbox A' }, { label: 'Inbox B' }],
        },
      });
    });
    expect(execute).not.toHaveBeenCalled();
    await Effect.runPromise(
      respondToTaskInteraction(
        taskRuntime,
        run,
        {
          interactionId: 'Document.move:source',
          optionId: sourceChoice.options[1]!.id,
        },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        interaction: {
          id: 'Document.move:destination',
          kind: 'choice',
          options: [{ label: 'Later A' }, { label: 'Later B' }],
        },
      });
    });
    expect(execute).not.toHaveBeenCalled();
    await Effect.runPromise(
      respondToTaskInteraction(
        taskRuntime,
        run,
        {
          interactionId: 'Document.move:destination',
          optionId: destinationChoice.options[0]!.id,
        },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', request },
      });
    });
    expect(continueApplication).toHaveBeenNthCalledWith(
      1,
      input,
      sourceChoice,
      sourceChoice.options[1]!.id,
      expect.any(AbortSignal),
    );
    expect(continueApplication).toHaveBeenNthCalledWith(
      2,
      input,
      destinationChoice,
      destinationChoice.options[0]!.id,
      expect.any(AbortSignal),
    );
    expect(execute).toHaveBeenCalledOnce();
  });

  it('finishes a rejected proposal without executing it', async () => {
    const f = fixture();
    const run = await Effect.runPromise(
      startTask(f.taskRuntime, f.task, input, {
        runId: 'model-rejection',
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(f.taskRuntime, run))).resolves.toHaveProperty(
        'interaction.id',
        'approve-model-command',
      );
    });

    await Effect.runPromise(
      respondToTaskInteraction(
        f.taskRuntime,
        run,
        { interactionId: 'approve-model-command', decision: 'reject' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(f.taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'unresolved', message: 'The proposed action was not approved.' },
      });
    });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('continues without approval when a host policy changes before presentation', async () => {
    const f = fixture();
    const approval = vi
      .fn()
      .mockReturnValueOnce({ prompt: 'Rename this document?', summary: 'Rename it.' })
      .mockReturnValueOnce(undefined);
    const task = createModelCommandTask({
      runtime: {
        prepare: f.prepare,
        execute: f.execute,
        submit: vi.fn(),
      } as unknown as PreparedModelCommandRuntime,
      approval,
    });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(startTask(taskRuntime, task, input));

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Document renamed.' },
      });
    });
    expect(approval).toHaveBeenCalledTimes(2);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  it('executes read proposals without requesting approval', async () => {
    const read = {
      version: 1 as const,
      kind: 'graph-read' as const,
      mode: 'run' as const,
    } as never;
    const prepare = vi.fn(async () => ({ status: 'proposed' as const, request: read }));
    const execute = vi.fn(async () => ({
      status: 'executed' as const,
      message: 'Read completed.',
      request: read,
      response: { kind: 'graph-read-result' as const, value: [] },
    }));
    const runtime = { prepare, execute, submit: vi.fn() } as unknown as PreparedModelCommandRuntime;
    const task = createModelCommandTask({ runtime });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(
      startTask(taskRuntime, task, input, { runId: 'model-read' }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Read completed.' },
      });
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('executes a graph read selected from a choice without requesting approval', async () => {
    const read = {
      version: 1 as const,
      kind: 'graph-read' as const,
      mode: 'run' as const,
    } as never;
    const prepare = vi.fn(async () => ({
      status: 'choice' as const,
      prompt: 'Which report?',
      options: [{ id: 'open', label: 'Open documents', request: read }],
    }));
    const execute = vi.fn(async () => ({
      status: 'executed' as const,
      message: 'Read completed.',
      request: read,
      response: { kind: 'graph-read-result' as const, value: [] },
    }));
    const approval = vi.fn(() => ({
      prompt: 'Approve this request?',
      summary: 'Run the request.',
    }));
    const task = createModelCommandTask({
      runtime: { prepare, execute, submit: vi.fn() } as unknown as PreparedModelCommandRuntime,
      approval,
    });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    taskRuntime.register?.(task);
    const run = await Effect.runPromise(
      startTask(taskRuntime, task, input, {
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toHaveProperty(
        'interaction.id',
        'choose-model-command',
      );
    });
    await Effect.runPromise(
      respondToTaskInteraction(
        taskRuntime,
        run,
        { interactionId: 'choose-model-command', optionId: 'open' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(taskRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Read completed.' },
      });
    });
    expect(approval).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('restores the initiating principal when an interaction is resumed by another principal', async () => {
    const principals: unknown[] = [];
    const prepare = vi.fn(async () => {
      principals.push(getCurrentInvocationContext()?.principal);
      return { status: 'proposed' as const, request: proposal };
    });
    const execute = vi.fn(async () => {
      principals.push(getCurrentInvocationContext()?.principal);
      return {
        status: 'executed' as const,
        message: 'Document renamed.',
        request: proposal,
      };
    });
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    const runtime = createTaskBackedModelCommandRuntime({
      runtime: { prepare, execute, submit: vi.fn() } as unknown as PreparedModelCommandRuntime,
      tasks: {
        register: task => taskRuntime.register?.(task),
        start: (task, taskInput, options) => startTask(taskRuntime, task, taskInput, options),
        observe: run => taskRuntime.observe!(run),
      },
      approval: () => ({
        prompt: 'Rename this document?',
        summary: 'Rename the document to Notes.',
      }),
    });

    const pending = await withInvocationContext(
      { principal: { kind: 'user', subject: 'owner', issuer: 'test-issuer' } },
      () => runtime.submit(input, new AbortController().signal),
    );
    expect(pending.status).toBe('pending');
    if (pending.status !== 'pending') throw new Error('Expected approval interaction.');

    await withInvocationContext({ principal: { kind: 'user', subject: 'inspector' } }, () =>
      Effect.runPromise(
        respondToTaskInteraction(
          taskRuntime,
          pending.run,
          { interactionId: pending.interaction.id, decision: 'approve' },
          { actor: { kind: 'user', id: 'owner' } },
        ),
      ),
    );
    await vi.waitFor(async () => {
      await expect(
        Effect.runPromise(getTaskSnapshot(taskRuntime, pending.run)),
      ).resolves.toHaveProperty('status', 'completed');
    });
    expect(principals).toEqual([
      { kind: 'user', subject: 'owner', issuer: 'test-issuer' },
      { kind: 'user', subject: 'owner', issuer: 'test-issuer' },
    ]);
  });

  it('adapts the first durable interaction into a pending model result', async () => {
    const f = fixture();
    const runtime = createTaskBackedModelCommandRuntime({
      runtime: {
        prepare: f.prepare,
        execute: f.execute,
        submit: vi.fn(),
      } as unknown as PreparedModelCommandRuntime,
      tasks: {
        register: task => f.taskRuntime.register?.(task),
        start: (task, taskInput, options) => startTask(f.taskRuntime, task, taskInput, options),
        observe: run => f.taskRuntime.observe!(run),
      },
      approval: () => ({
        prompt: 'Rename this document?',
        summary: 'Rename the document to Notes.',
      }),
    });

    await expect(runtime.submit(input, new AbortController().signal)).resolves.toMatchObject({
      status: 'pending',
      message: 'Rename this document?',
      run: { taskId: 'ontahi.model-command' },
      interaction: {
        id: 'approve-model-command',
        kind: 'approval',
        proposal: { requests: [proposal] },
      },
    });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('returns a terminal Task result without requiring an interaction', async () => {
    const terminal = {
      taskId: 'ontahi.model-command',
      runId: 'terminal',
      status: 'completed' as const,
      updatedAt: '2026-09-29T00:00:00.000Z',
      result: { status: 'answered' as const, message: 'You can rename documents.' },
    };
    const tasks = {
      register: vi.fn(),
      start: () => Effect.succeed({ ...terminal, status: 'queued' as const }),
      observe: () => Stream.make(terminal),
    } as unknown as ModelCommandTaskHost;
    const runtime = createTaskBackedModelCommandRuntime({
      runtime: {} as PreparedModelCommandRuntime,
      tasks,
    });

    await expect(runtime.submit(input, new AbortController().signal)).resolves.toEqual(
      terminal.result,
    );
  });

  it('fails when observation ends or the Task terminates without a result', async () => {
    const runtimeWith = (observe: ModelCommandTaskHost['observe']) =>
      createTaskBackedModelCommandRuntime({
        runtime: {} as PreparedModelCommandRuntime,
        tasks: {
          register: vi.fn(),
          start: () =>
            Effect.succeed({
              taskId: 'ontahi.model-command',
              runId: 'failed',
              status: 'queued',
            }),
          observe,
        } as unknown as ModelCommandTaskHost,
      });

    await expect(
      runtimeWith(() => Stream.empty).submit(input, new AbortController().signal),
    ).rejects.toThrow('observation ended');
    await expect(
      runtimeWith(() =>
        Stream.make({
          taskId: 'ontahi.model-command',
          runId: 'failed',
          status: 'failed' as const,
          updatedAt: '2026-09-29T00:00:00.000Z',
          error: { code: 'model_failed', message: 'Model execution failed.' },
        }),
      ).submit(input, new AbortController().signal),
    ).rejects.toThrow('Model execution failed.');
  });

  it('preserves model interpretation failures across the Task boundary', async () => {
    const taskRuntime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    const runtime = createTaskBackedModelCommandRuntime({
      runtime: {
        prepare: async () => {
          throw new ModelInterpretationError('model_output_invalid', 'Use the advertised schema.');
        },
      } as unknown as PreparedModelCommandRuntime,
      tasks: {
        register: task => taskRuntime.register?.(task),
        start: (task, taskInput, options) => startTask(taskRuntime, task, taskInput, options),
        observe: run => taskRuntime.observe!(run),
      },
    });

    await expect(runtime.submit(input, new AbortController().signal)).rejects.toMatchObject({
      name: 'ModelInterpretationError',
      code: 'model_output_invalid',
      message: 'Use the advertised schema.',
    });
  });
});
