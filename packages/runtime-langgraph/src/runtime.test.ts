import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import {
  createInMemoryTaskStorage,
  defineTask,
  defineTaskExecution,
  defineTaskExecutionStep,
  getTaskSnapshot,
  respondToTaskInteraction,
  startTask,
  type TaskExecutionState,
} from '@ontahi/core/runtime/server/tasks';
import { Effect, Option, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createLangGraphTaskExecutor } from './runtime.js';

type ReviewState =
  | { readonly step: 'choose' }
  | { readonly step: 'approve'; readonly selected: string };

type SameStepReviewState = {
  readonly step: 'review';
  readonly phase: 'choose' | 'approve';
  readonly selected?: string;
};

const reviewTask = defineTask({
  id: 'demo.langgraph-review',
  execution: defineTaskExecution<{}, ReviewState, { selected: string; approved: boolean }>({
    initial: () => ({ step: 'choose' }),
    steps: {
      choose: defineTaskExecutionStep({
        run: ({ state, response }) => {
          if (state.step !== 'choose') return Effect.dieMessage('Invalid state.');
          return Effect.succeed(
            response && 'optionId' in response
              ? { kind: 'continue', state: { step: 'approve', selected: response.optionId } }
              : {
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
                },
          );
        },
      }),
      approve: defineTaskExecutionStep({
        run: ({ state, response }) => {
          if (state.step !== 'approve') return Effect.dieMessage('Invalid state.');
          return Effect.succeed(
            response && 'decision' in response
              ? {
                  kind: 'complete',
                  result: {
                    selected: state.selected,
                    approved: response.decision === 'approve',
                  },
                }
              : {
                  kind: 'interaction',
                  state,
                  interaction: {
                    id: 'approve-item',
                    prompt: `Use ${state.selected}?`,
                    proposal: {
                      id: 'use-item',
                      summary: `Use ${state.selected}.`,
                      requests: [{ selected: state.selected }],
                    },
                  },
                },
          );
        },
      }),
    },
  }),
  run: () => Effect.dieMessage('Legacy execution must not run.'),
});

const createRuntime = (
  storage: ReturnType<typeof createInMemoryTaskStorage>,
  saver: MemorySaver | SqliteSaver,
) => {
  const runtime = createLangGraphTaskExecutor({ checkpointer: saver }).createRuntime(storage);
  runtime.register?.(reviewTask);
  return runtime;
};

describe('LangGraph Task Runtime', () => {
  it('runs an explicit string input interaction', async () => {
    const inputTask = defineTask({
      id: 'demo.langgraph-input',
      execution: defineTaskExecution<{}, { readonly step: 'input' }, { title: string }>({
        initial: () => ({ step: 'input' }),
        steps: {
          input: defineTaskExecutionStep({
            run: ({ state, response }) =>
              Effect.succeed(
                response && 'value' in response && typeof response.value === 'string'
                  ? { kind: 'complete', result: { title: response.value } }
                  : {
                      kind: 'interaction',
                      state,
                      interaction: {
                        id: 'enter-title',
                        prompt: 'What title?',
                        input: { type: 'string' },
                      },
                    },
              ),
          }),
        },
      }),
      run: () => Effect.dieMessage('Legacy execution must not run.'),
    });
    const storage = createInMemoryTaskStorage();
    const runtime = createLangGraphTaskExecutor({ checkpointer: new MemorySaver() }).createRuntime(
      storage,
    );
    runtime.register?.(inputTask);
    const run = await Effect.runPromise(
      startTask(
        runtime,
        inputTask,
        {},
        {
          runId: 'input-run',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
        status: 'running',
        interaction: { id: 'enter-title', kind: 'input' },
      });
    });
    await Effect.runPromise(
      respondToTaskInteraction(
        runtime,
        run,
        { interactionId: 'enter-title', value: 'Notes' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { title: 'Notes' },
      });
    });
  });

  it('assigns distinct durable ids to consecutive unnamed input interactions', async () => {
    type InputState = {
      readonly step: 'input';
      readonly phase: 'first' | 'second';
      readonly first?: string;
    };
    const inputTask = defineTask({
      id: 'demo.langgraph-consecutive-input',
      execution: defineTaskExecution<{}, InputState, { first: string; second: string }>({
        initial: () => ({ step: 'input', phase: 'first' }),
        steps: {
          input: defineTaskExecutionStep({
            run: ({ state, response }) => {
              if (
                state.phase === 'first' &&
                response &&
                'value' in response &&
                typeof response.value === 'string'
              )
                return Effect.succeed({
                  kind: 'interaction' as const,
                  state: {
                    step: 'input' as const,
                    phase: 'second' as const,
                    first: response.value,
                  },
                  interaction: { prompt: 'Value?', input: { type: 'string' as const } },
                });
              if (
                state.phase === 'second' &&
                response &&
                'value' in response &&
                typeof response.value === 'string'
              )
                return Effect.succeed({
                  kind: 'complete' as const,
                  result: { first: state.first!, second: response.value },
                });
              return Effect.succeed({
                kind: 'interaction' as const,
                state,
                interaction: { prompt: 'Value?', input: { type: 'string' as const } },
              });
            },
          }),
        },
      }),
      run: () => Effect.dieMessage('Legacy execution must not run.'),
    });
    const storage = createInMemoryTaskStorage();
    const runtime = createLangGraphTaskExecutor({ checkpointer: new MemorySaver() }).createRuntime(
      storage,
    );
    runtime.register?.(inputTask);
    const context = { actor: { kind: 'system' as const } };
    const run = await Effect.runPromise(
      startTask(
        runtime,
        inputTask,
        {},
        {
          runId: 'consecutive-input',
          trigger: { cause: 'system', actor: context.actor },
        },
      ),
    );
    let firstId = '';
    await vi.waitFor(async () => {
      const snapshot = await Effect.runPromise(getTaskSnapshot(runtime, run));
      expect(snapshot.interaction?.kind).toBe('input');
      firstId = snapshot.interaction?.id ?? '';
      expect(firstId).not.toBe('');
    });
    await Effect.runPromise(
      respondToTaskInteraction(runtime, run, { interactionId: firstId, value: 'first' }, context),
    );
    let secondId = '';
    await vi.waitFor(async () => {
      const snapshot = await Effect.runPromise(getTaskSnapshot(runtime, run));
      expect(snapshot.interaction?.kind).toBe('input');
      secondId = snapshot.interaction?.id ?? '';
      expect(secondId).not.toBe(firstId);
    });
    await Effect.runPromise(
      respondToTaskInteraction(runtime, run, { interactionId: secondId, value: 'second' }, context),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { first: 'first', second: 'second' },
      });
    });
  });

  it('runs the same explicit execution across choice, runtime recreation, and approval', async () => {
    const storage = createInMemoryTaskStorage();
    const saver = new MemorySaver();
    const firstRuntime = createRuntime(storage, saver);
    const run = await Effect.runPromise(
      startTask(
        firstRuntime,
        reviewTask,
        {},
        {
          runId: 'review-run',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(firstRuntime, run))).resolves.toMatchObject({
        status: 'running',
        interaction: { id: 'choose-item', kind: 'choice' },
      });
    });

    const secondRuntime = createRuntime(storage, saver);
    await Effect.runPromise(
      respondToTaskInteraction(
        secondRuntime,
        run,
        { interactionId: 'choose-item', optionId: 'two' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(secondRuntime, run))).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-item',
          kind: 'approval',
          proposal: { summary: 'Use two.' },
        },
      });
    });

    await Effect.runPromise(
      respondToTaskInteraction(
        secondRuntime,
        run,
        { interactionId: 'approve-item', decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(secondRuntime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { selected: 'two', approved: true },
      });
    });
    await expect(Effect.runPromise(storage.loadSource(run))).resolves.toMatchObject({
      runtime: { name: 'langgraph', runId: 'demo.langgraph-review:review-run' },
      checkpoint: undefined,
    });
  });

  it('rebuilds a missing provider thread before resuming a claimed response', async () => {
    const storage = createInMemoryTaskStorage();
    const firstRuntime = createRuntime(storage, new MemorySaver());
    const run = await Effect.runPromise(
      startTask(
        firstRuntime,
        reviewTask,
        {},
        {
          runId: 'missing-provider-thread',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(firstRuntime, run))).resolves.toHaveProperty(
        'interaction.id',
        'choose-item',
      );
    });

    const recoveredRuntime = createRuntime(storage, new MemorySaver());
    await Effect.runPromise(
      respondToTaskInteraction(
        recoveredRuntime,
        run,
        { interactionId: 'choose-item', optionId: 'two' },
        { actor: { kind: 'system' } },
      ),
    );

    await vi.waitFor(async () => {
      await expect(
        Effect.runPromise(getTaskSnapshot(recoveredRuntime, run)),
      ).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-item',
          proposal: { summary: 'Use two.' },
        },
      });
    });
  });

  it('rebuilds a stale provider thread from the authoritative Task Storage checkpoint', async () => {
    const storage = createInMemoryTaskStorage();
    const saver = new MemorySaver();
    const firstRuntime = createRuntime(storage, saver);
    const run = await Effect.runPromise(
      startTask(
        firstRuntime,
        reviewTask,
        {},
        {
          runId: 'stale-provider-thread',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(firstRuntime, run))).resolves.toHaveProperty(
        'interaction.id',
        'choose-item',
      );
    });
    await Effect.runPromise(
      storage.update(run, {
        checkpoint: {
          version: 1,
          state: { step: 'approve', selected: 'two' } satisfies ReviewState,
        },
      }),
    );

    const recoveredRuntime = createRuntime(storage, saver);
    await Effect.runPromise(getTaskSnapshot(recoveredRuntime, run));
    await vi.waitFor(async () => {
      await expect(
        Effect.runPromise(getTaskSnapshot(recoveredRuntime, run)),
      ).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-item',
          proposal: { summary: 'Use two.' },
        },
      });
    });
  });

  it('replays prior responses when provider and Task Storage disagree on a same-state interaction', async () => {
    const sameStateTask = defineTask({
      id: 'demo.langgraph-same-state-recovery',
      execution: defineTaskExecution<{}, { step: 'review' }, { approved: boolean }>({
        initial: () => ({ step: 'review' }),
        steps: {
          review: defineTaskExecutionStep({
            run: ({ state, response }) => {
              if (response && 'decision' in response) {
                return Effect.succeed({
                  kind: 'complete' as const,
                  result: { approved: response.decision === 'approve' },
                });
              }
              if (response && 'optionId' in response) {
                return Effect.succeed({
                  kind: 'interaction' as const,
                  state,
                  interaction: {
                    id: 'same-state-approval',
                    prompt: `Use ${response.optionId}?`,
                    proposal: {
                      id: 'same-state-proposal',
                      summary: `Use ${response.optionId}.`,
                      requests: [{ selected: response.optionId }],
                    },
                  },
                });
              }
              return Effect.succeed({
                kind: 'interaction' as const,
                state,
                interaction: {
                  id: 'same-state-choice',
                  prompt: 'Which item?',
                  options: [{ id: 'one', label: 'One', value: 'one' }],
                },
              });
            },
          }),
        },
      }),
      run: () => Effect.dieMessage('Legacy execution must not run.'),
    });
    const storage = createInMemoryTaskStorage();
    const staleSaver = new MemorySaver();
    const createSameStateRuntime = (saver: MemorySaver) => {
      const runtime = createLangGraphTaskExecutor({ checkpointer: saver }).createRuntime(storage);
      runtime.register?.(sameStateTask);
      return runtime;
    };
    const staleRuntime = createSameStateRuntime(staleSaver);
    const run = await Effect.runPromise(
      startTask(
        staleRuntime,
        sameStateTask,
        {},
        {
          runId: 'same-state-recovery',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(staleRuntime, run))).resolves.toHaveProperty(
        'interaction.id',
        'same-state-choice',
      );
    });

    const advancingRuntime = createSameStateRuntime(new MemorySaver());
    await Effect.runPromise(
      respondToTaskInteraction(
        advancingRuntime,
        run,
        { interactionId: 'same-state-choice', optionId: 'one' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(
        Effect.runPromise(getTaskSnapshot(advancingRuntime, run)),
      ).resolves.toHaveProperty('interaction.id', 'same-state-approval');
    });

    const recoveredRuntime = createSameStateRuntime(staleSaver);
    await Effect.runPromise(
      respondToTaskInteraction(
        recoveredRuntime,
        run,
        { interactionId: 'same-state-approval', decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(
        Effect.runPromise(getTaskSnapshot(recoveredRuntime, run)),
      ).resolves.toMatchObject({
        status: 'completed',
        result: { approved: true },
      });
    });
  });

  it('resumes an interaction from a SQLite checkpoint opened by a new runtime', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ontahi-langgraph-'));
    const databasePath = path.join(directory, 'checkpoints.sqlite');
    const storage = createInMemoryTaskStorage();
    const firstSaver = SqliteSaver.fromConnString(databasePath);
    const firstRuntime = createRuntime(storage, firstSaver);

    try {
      const run = await Effect.runPromise(
        startTask(
          firstRuntime,
          reviewTask,
          {},
          {
            runId: 'sqlite-run',
            trigger: { cause: 'system', actor: { kind: 'system' } },
          },
        ),
      );
      await vi.waitFor(async () => {
        await expect(Effect.runPromise(getTaskSnapshot(firstRuntime, run))).resolves.toHaveProperty(
          'interaction.id',
          'choose-item',
        );
      });
      firstSaver.db.close();

      const secondSaver = SqliteSaver.fromConnString(databasePath);
      const secondRuntime = createRuntime(storage, secondSaver);
      await Effect.runPromise(
        respondToTaskInteraction(
          secondRuntime,
          run,
          { interactionId: 'choose-item', optionId: 'one' },
          { actor: { kind: 'system' } },
        ),
      );
      await vi.waitFor(async () => {
        await expect(
          Effect.runPromise(getTaskSnapshot(secondRuntime, run)),
        ).resolves.toHaveProperty('interaction.id', 'approve-item');
      });
      secondSaver.db.close();
    } finally {
      if (firstSaver.db.open) firstSaver.db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects invalid and duplicate interaction responses without a second continuation', async () => {
    const storage = createInMemoryTaskStorage();
    const runtime = createRuntime(storage, new MemorySaver());
    const run = await Effect.runPromise(
      startTask(
        runtime,
        reviewTask,
        {},
        {
          runId: 'response-validation',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
        'interaction.id',
        'choose-item',
      );
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            runtime,
            run,
            { interactionId: 'choose-item', optionId: 'missing' },
            { actor: { kind: 'system' } },
          ),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'invalid_task_interaction_response' });

    await Effect.runPromise(
      respondToTaskInteraction(
        runtime,
        run,
        { interactionId: 'choose-item', optionId: 'one' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
        'interaction.id',
        'approve-item',
      );
    });
    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            runtime,
            run,
            { interactionId: 'choose-item', optionId: 'one' },
            { actor: { kind: 'system' } },
          ),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'task_interaction_mismatch' });
  });

  it('claims concurrent responses once and supports consecutive interactions in one step', async () => {
    let completedExecutions = 0;
    const sameStepTask = defineTask({
      id: 'demo.langgraph-same-step',
      execution: defineTaskExecution<{}, SameStepReviewState, { selected: string }>({
        initial: () => ({ step: 'review', phase: 'choose' }),
        steps: {
          review: defineTaskExecutionStep({
            run: ({ state, response }) => {
              if (state.phase === 'choose') {
                return Effect.succeed(
                  response && 'optionId' in response
                    ? {
                        kind: 'interaction' as const,
                        state: {
                          step: 'review' as const,
                          phase: 'approve' as const,
                          selected: response.optionId,
                        },
                        interaction: {
                          id: 'same-step-approval',
                          prompt: `Use ${response.optionId}?`,
                          proposal: {
                            id: 'same-step-proposal',
                            summary: `Use ${response.optionId}.`,
                            requests: [{ selected: response.optionId }],
                          },
                        },
                      }
                    : {
                        kind: 'interaction' as const,
                        state,
                        interaction: {
                          id: 'same-step-choice',
                          prompt: 'Which item?',
                          options: [{ id: 'one', label: 'One', value: 'one' }],
                        },
                      },
                );
              }

              if (response && 'decision' in response) {
                completedExecutions += 1;
                return Effect.succeed({
                  kind: 'complete' as const,
                  result: { selected: state.selected! },
                });
              }
              return Effect.succeed({
                kind: 'interaction' as const,
                state,
                interaction: {
                  id: 'same-step-approval',
                  prompt: `Use ${state.selected}?`,
                  proposal: {
                    id: 'same-step-proposal',
                    summary: `Use ${state.selected}.`,
                    requests: [{ selected: state.selected! }],
                  },
                },
              });
            },
          }),
        },
      }),
      run: () => Effect.dieMessage('Legacy execution must not run.'),
    });
    const storage = createInMemoryTaskStorage();
    const runtime = createLangGraphTaskExecutor({ checkpointer: new MemorySaver() }).createRuntime(
      storage,
    );
    runtime.register?.(sameStepTask);
    const run = await Effect.runPromise(
      startTask(
        runtime,
        sameStepTask,
        {},
        {
          runId: 'same-step-run',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
        'interaction.id',
        'same-step-choice',
      );
    });

    await Effect.runPromise(
      respondToTaskInteraction(
        runtime,
        run,
        { interactionId: 'same-step-choice', optionId: 'one' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
        'interaction.id',
        'same-step-approval',
      );
    });

    const response = {
      interactionId: 'same-step-approval',
      decision: 'approve' as const,
    };
    await Promise.all([
      Effect.runPromise(
        respondToTaskInteraction(runtime, run, response, { actor: { kind: 'system' } }),
      ),
      Effect.runPromise(
        respondToTaskInteraction(runtime, run, response, { actor: { kind: 'system' } }),
      ),
    ]);
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
        status: 'completed',
        result: { selected: 'one' },
      });
    });
    expect(completedExecutions).toBe(1);
  });

  it('queues an immediate streamed response until the interrupting invocation releases the run', async () => {
    const storage = createInMemoryTaskStorage();
    const runtime = createRuntime(storage, new MemorySaver());
    const run = await Effect.runPromise(
      startTask(
        runtime,
        reviewTask,
        {},
        {
          runId: 'immediate-stream-response',
          trigger: { cause: 'system', actor: { kind: 'system' } },
        },
      ),
    );
    const pending = await Effect.runPromise(
      runtime.observe!(run).pipe(
        Stream.filter(snapshot => snapshot.interaction?.id === 'choose-item'),
        Stream.runHead,
      ),
    );
    expect(Option.isSome(pending)).toBe(true);

    const terminal = Effect.runPromise(
      runtime.observe!(run).pipe(
        Stream.filter(snapshot => snapshot.status === 'completed'),
        Stream.runHead,
      ),
    );
    await Effect.runPromise(
      respondToTaskInteraction(
        runtime,
        run,
        { interactionId: 'choose-item', optionId: 'one' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(storage.getSnapshot(run))).resolves.toHaveProperty(
        'interaction.id',
        'approve-item',
      );
    });

    await Effect.runPromise(
      respondToTaskInteraction(
        runtime,
        run,
        { interactionId: 'approve-item', decision: 'reject' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(storage.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { selected: 'one', approved: false },
      });
    });
    await expect(terminal).resolves.toMatchObject({
      _tag: 'Some',
      value: { status: 'completed', result: { selected: 'one', approved: false } },
    });
  });

  it('keeps interaction responses scoped to the actor that started the run', async () => {
    const storage = createInMemoryTaskStorage();
    const runtime = createRuntime(storage, new MemorySaver());
    const run = await Effect.runPromise(
      startTask(
        runtime,
        reviewTask,
        {},
        {
          runId: 'actor-scope',
          trigger: { cause: 'user_request', actor: { kind: 'user', id: 'alice' } },
        },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
        'interaction.id',
        'choose-item',
      );
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          respondToTaskInteraction(
            runtime,
            run,
            { interactionId: 'choose-item', optionId: 'one' },
            { actor: { kind: 'user', id: 'bob' } },
          ),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'task_interaction_access_denied' });
    await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toHaveProperty(
      'interaction.id',
      'choose-item',
    );
  });

  it('delegates legacy task functions to the in-process executor', async () => {
    const legacy = defineTask({
      id: 'demo.legacy',
      run: (input: { value: string }) => Effect.succeed(input.value.toUpperCase()),
    });
    const runtime = createLangGraphTaskExecutor().createRuntime(createInMemoryTaskStorage());
    const run = await Effect.runPromise(
      startTask(runtime, legacy, { value: 'delegated' }, { runId: 'legacy-run' }),
    );

    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
        status: 'completed',
        result: 'DELEGATED',
      });
    });
  });

  it('fails an invalid persisted step through the normal Task snapshot', async () => {
    const storage = createInMemoryTaskStorage();
    const saver = new MemorySaver();
    const runtime = createRuntime(storage, saver);
    const ref = { taskId: reviewTask.id, runId: 'invalid-step' };
    await Effect.runPromise(
      storage.create({
        ...ref,
        input: {},
        trigger: { cause: 'system', actor: { kind: 'system' } },
      }),
    );
    await Effect.runPromise(
      storage.update(ref, {
        status: 'running',
        checkpoint: {
          version: 1,
          state: { step: 'missing' } satisfies TaskExecutionState,
        },
      }),
    );

    await Effect.runPromise(getTaskSnapshot(runtime, ref));
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(getTaskSnapshot(runtime, ref))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_step_not_found' },
      });
    });
  });

  it('records invalid initial execution state as a terminal Task run', async () => {
    const invalidInitialTask = defineTask({
      id: 'demo.invalid-initial-state',
      execution: defineTaskExecution({
        initial: () => ({ step: '' }),
        steps: {},
      }),
      run: () => Effect.dieMessage('Legacy execution must not run.'),
    });
    const storage = createInMemoryTaskStorage();
    const runtime = createLangGraphTaskExecutor().createRuntime(storage);

    const run = await Effect.runPromise(
      startTask(runtime, invalidInitialTask, {}, { runId: 'invalid-initial' }),
    );

    await expect(Effect.runPromise(getTaskSnapshot(runtime, run))).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'task_definition_invalid' },
    });
  });
});
