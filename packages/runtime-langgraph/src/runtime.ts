import { AsyncLocalStorage } from 'node:async_hooks';

import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  type BaseCheckpointSaver,
} from '@langchain/langgraph';
import {
  serverContext,
  type EventOccurrence,
  type OperationRuntimeContext,
  type TaskRuntimeRef,
} from '@ontahi/core/runtime/server';
import {
  createInMemoryTaskStorage,
  createInProcessTaskExecutor,
  getInMemoryTaskRunProjection,
  invalidTaskDefinitionFailure,
  isTaskExecutionState,
  materializeTaskEventWait,
  materializeTaskExecutionInteraction,
  pollTaskEventWait,
  requireTaskEventDelivery,
  settleTaskEventCheckpoint,
  taskEventWaitSubscriptionId,
  missingTaskStepFailure,
  taskInteractionAccessDeniedFailure,
  taskInteractionMismatchFailure,
  taskInteractionNotPendingFailure,
  toTaskFailure,
  validateTaskInteractionResponse,
  validateTaskInput,
  validateTaskOutput,
  validateTaskProgress,
  type InProcessTaskExecutorOptions,
  type TaskConfig,
  type TaskDefinition,
  type TaskExecutionCheckpoint,
  type TaskExecutionInteractionRequest,
  type TaskExecutionState,
  type TaskExecutionTransition,
  type TaskExecutor,
  type TaskFailure,
  type TaskInteractionResponse,
  type TaskPendingInteraction,
  type TaskRunIdentity,
  type TaskRunRef,
  type TaskRunSource,
  type TaskRuntime,
  type TaskRuntimeHostOptions,
  type TaskSnapshot,
  type TaskStartOptions,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { cloneJson } from '@ontahi/core/value/json';
import { Effect, Fiber, Schedule, Stream } from 'effect';

import { createExecutionLease, executionLeaseLost } from './execution-lease.js';

const LangGraphState = Annotation.Root({
  taskId: Annotation<string>(),
  runId: Annotation<string>(),
  input: Annotation<unknown>(),
  executionState: Annotation<TaskExecutionState>(),
  eventOccurrence: Annotation<EventOccurrence | null>(),
  done: Annotation<boolean>(),
  result: Annotation<unknown>(),
});

type LangGraphExecutionState = typeof LangGraphState.State;
type LangGraphRunnable = ReturnType<ReturnType<typeof createGraphBuilder>['compile']>;
type LangGraphReplayEntry = {
  state: TaskExecutionState;
  response: TaskInteractionResponse;
};
type LangGraphTaskExecutionCheckpoint = TaskExecutionCheckpoint & {
  /** Adapter-private responses needed to reconstruct a missing provider thread deterministically. */
  replay?: LangGraphReplayEntry[];
  replayEvent?: { state: TaskExecutionState; occurrence: EventOccurrence };
};

export type LangGraphTaskExecutorOptions = InProcessTaskExecutorOptions & {
  checkpointer?: BaseCheckpointSaver;
  /** Time a worker can go without renewing its lease before another worker may recover the run. */
  executionLeaseMs?: number;
};

export type LangGraphTasksOptions = LangGraphTaskExecutorOptions &
  TaskRuntimeHostOptions & {
    storage?: TaskStorage;
  };

const now = () => new Date().toISOString();

let fallbackRunIdSequence = 0;
const createRunId = () =>
  globalThis.crypto?.randomUUID() ?? `task-${Date.now()}-${++fallbackRunIdSequence}`;

const keyOf = (ref: TaskRunIdentity) => `${ref.taskId}:${ref.runId}`;
const threadIdOf = (ref: TaskRunIdentity) => keyOf(ref);
const interactionIdOf = (
  ref: TaskRunIdentity,
  state: TaskExecutionState,
  request: TaskExecutionInteractionRequest,
) => {
  const source = JSON.stringify([ref.taskId, ref.runId, state, request]);
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `langgraph-${(hash >>> 0).toString(36)}`;
};
const graphConfig = (source: TaskRunSource) => ({
  configurable: { thread_id: source.runtime?.runId ?? threadIdOf(source) },
  durability: 'sync' as const,
});

const runTaskEffect = async <TValue>(effect: Effect.Effect<TValue, TaskFailure>) => {
  const result = await Effect.runPromise(effect.pipe(Effect.either));
  if (result._tag === 'Left') throw result.left;
  return result.right;
};

const toTaskRunRef = (snapshot: TaskSnapshot): TaskRunRef => ({
  taskId: snapshot.taskId,
  runId: snapshot.runId,
  status: snapshot.status,
  ...(snapshot.subject ? { subject: snapshot.subject } : {}),
});

const createGraphBuilder = (
  execute: (state: LangGraphExecutionState) => Promise<Partial<LangGraphExecutionState>>,
) =>
  new StateGraph(LangGraphState)
    .addNode('execute', execute)
    .addEdge(START, 'execute')
    .addConditionalEdges('execute', state => (state.done ? END : 'execute'));

const createLangGraphTaskRuntime = (
  storage: TaskStorage,
  host: TaskRuntimeHostOptions,
  {
    checkpointer = new MemorySaver(),
    executionLeaseMs = 60_000,
    sleep = milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
    createRunId: createConfiguredRunId = createRunId,
    onBackgroundError,
  }: LangGraphTaskExecutorOptions,
): TaskRuntime => {
  if (!Number.isSafeInteger(executionLeaseMs) || executionLeaseMs <= 0) {
    throw new RangeError('LangGraph execution lease must be a positive integer in milliseconds.');
  }
  const lease = createExecutionLease(storage, executionLeaseMs, threadIdOf);
  const execution = new AsyncLocalStorage<{ runtime: TaskRuntimeRef | undefined }>();
  const projection = getInMemoryTaskRunProjection(storage);
  const legacyRuntime = createInProcessTaskExecutor({
    sleep,
    createRunId: createConfiguredRunId,
    onBackgroundError,
  }).createRuntime(storage, host);
  const tasks = new Map<string, TaskDefinition<any, any>>();
  const graphs = new Map<string, LangGraphRunnable>();
  const eventDeclarations = new Map(host.events?.declarations.map(event => [event.id, event]));
  const eventDelivery = () => {
    try {
      return requireTaskEventDelivery(host.events?.runtime);
    } catch {
      throw {
        reason: 'task_event_runtime_unavailable',
        message: 'A durable Event Runtime with retention and acknowledgement is required.',
      } satisfies TaskFailure;
    }
  };
  const activeRuns = new Map<string, string | undefined>();
  const pendingLaunches = new Map<string, () => void>();

  const publish = async (snapshot: TaskSnapshot) => {
    await runTaskEffect(projection.publish(snapshot));
    return snapshot;
  };
  const update = async (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    publish(await runTaskEffect(storage.update(ref, patch)));
  const updateOwned = (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    lease.update(ref, execution.getStore()?.runtime, patch).pipe(
      Effect.flatMap(snapshot =>
        snapshot ? Effect.succeed(snapshot) : Effect.fail(executionLeaseLost()),
      ),
      Effect.tap(projection.publish),
    );
  const checkpointOf = (source: TaskRunSource) =>
    source.checkpoint as LangGraphTaskExecutionCheckpoint | undefined;
  const replayOf = (source: TaskRunSource) => checkpointOf(source)?.replay ?? [];
  const withReplay = (
    checkpoint: TaskExecutionCheckpoint,
    replay: readonly LangGraphReplayEntry[],
    replayEvent?: LangGraphTaskExecutionCheckpoint['replayEvent'],
  ): LangGraphTaskExecutionCheckpoint => ({
    ...checkpoint,
    ...(replayEvent ? { replayEvent: cloneJson(replayEvent) } : {}),
    ...(replay.length > 0 ? { replay: cloneJson(replay) as LangGraphReplayEntry[] } : {}),
  });

  const createStepContext = (task: TaskDefinition<any, any>, source: TaskRunSource) => ({
    taskId: source.taskId,
    runId: source.runId,
    ...(source.subject ? { subject: source.subject } : {}),
    trigger: source.trigger,
    createdAt: source.createdAt,
    progress: (progress: NonNullable<TaskSnapshot['progress']>) =>
      validateTaskProgress(task, progress).pipe(
        Effect.flatMap(parsedProgress => updateOwned(source, { progress: parsedProgress })),
      ),
    sleep: (milliseconds: number) =>
      Effect.tryPromise({ try: () => sleep(milliseconds), catch: toTaskFailure }),
  });

  const prepareInteraction = async (
    ref: TaskRunIdentity,
    state: TaskExecutionState,
    request: TaskExecutionInteractionRequest,
    replayEvent?: LangGraphTaskExecutionCheckpoint['replayEvent'],
  ) => {
    const persisted = await runTaskEffect(storage.loadSource(ref));
    const sameState = JSON.stringify(persisted.checkpoint?.state) === JSON.stringify(state);
    const persistedCheckpoint = checkpointOf(persisted);
    const existing = sameState ? persistedCheckpoint?.interaction : undefined;
    const interactionId = request.id ?? interactionIdOf(ref, state, request);
    const canReuse = existing?.id === interactionId;
    const interaction = canReuse
      ? existing
      : await runTaskEffect(
          materializeTaskExecutionInteraction(ref, request, { id: interactionId }),
        );

    if (persistedCheckpoint?.response?.interactionId !== interaction.id) {
      await runTaskEffect(
        updateOwned(ref, {
          status: 'waiting',
          checkpoint: withReplay(
            { version: 1, state: cloneJson(state), interaction },
            replayOf(persisted),
            persistedCheckpoint?.replayEvent ?? replayEvent,
          ),
        }),
      );
    }
    return interaction;
  };

  const applyTransition = async (
    task: TaskDefinition<any, any>,
    source: TaskRunSource,
    transition: TaskExecutionTransition<TaskExecutionState, unknown>,
  ): Promise<Partial<LangGraphExecutionState>> => {
    const ref = { taskId: source.taskId, runId: source.runId };
    if (transition.kind === 'complete') {
      const result = await runTaskEffect(validateTaskOutput(task, transition.result));
      await runTaskEffect(
        updateOwned(ref, {
          status: 'completed',
          completedAt: now(),
          result,
          checkpoint: undefined,
        }),
      );
      return { done: true, result };
    }
    if (!isTaskExecutionState(transition.state)) {
      throw invalidTaskDefinitionFailure(
        task.id,
        'Explicit execution step returned an invalid JSON-safe state.',
        {},
      );
    }
    const executionState = cloneJson(transition.state) as TaskExecutionState;
    if (transition.kind === 'interaction') {
      await prepareInteraction(ref, executionState, transition.interaction);
      return { executionState, done: false };
    }
    if (transition.kind === 'event') {
      eventDelivery();
      if (!storage.updateIfStatus) {
        throw {
          reason: 'task_event_runtime_unavailable',
          message: 'LangGraph Event waits require Task Storage with conditional writes.',
        } satisfies TaskFailure;
      }
      const eventWait = materializeTaskEventWait(ref, transition.event, eventDeclarations);
      await runTaskEffect(
        updateOwned(ref, {
          status: 'waiting',
          checkpoint: { version: 1, state: executionState, eventWait },
        }),
      );
      return { done: true, eventOccurrence: null };
    }
    await runTaskEffect(
      updateOwned(ref, {
        checkpoint: withReplay(
          { version: 1, state: executionState },
          replayOf(source),
          checkpointOf(source)?.replayEvent,
        ),
      }),
    );
    return { executionState, done: false, eventOccurrence: null };
  };

  const getGraph = (task: TaskDefinition<any, any>) => {
    const existing = graphs.get(task.id);
    if (existing) return existing;
    const definition = task.execution;
    if (!definition) {
      throw invalidTaskDefinitionFailure(
        task.id,
        'LangGraph execution requires an explicit Task execution definition.',
        {},
      );
    }

    const graph = createGraphBuilder(async state => {
      const ref = { taskId: state.taskId, runId: state.runId };
      const source = await runTaskEffect(storage.loadSource(ref));
      if (!lease.owns(execution.getStore()?.runtime, source)) throw executionLeaseLost();
      if (!isTaskExecutionState(state.executionState)) {
        throw invalidTaskDefinitionFailure(task.id, 'LangGraph execution state is invalid.', {});
      }
      const step = definition.steps[state.executionState.step];
      if (!step) throw missingTaskStepFailure(task.id, state.executionState.step);
      const context = createStepContext(task, source);
      let transition = await runTaskEffect(
        step.run({
          input: state.input,
          state: state.executionState,
          ...(state.eventOccurrence ? { event: state.eventOccurrence } : {}),
          context,
        }),
      );

      while (transition.kind === 'interaction') {
        if (!isTaskExecutionState(transition.state)) {
          throw invalidTaskDefinitionFailure(
            task.id,
            'Explicit execution step returned an invalid JSON-safe state.',
            { stepId: state.executionState.step },
          );
        }
        const interaction = await prepareInteraction(
          ref,
          transition.state,
          transition.interaction,
          state.eventOccurrence
            ? { state: state.executionState, occurrence: state.eventOccurrence }
            : undefined,
        );
        const response = interrupt<TaskPendingInteraction, TaskInteractionResponse>(interaction);
        await runTaskEffect(validateTaskInteractionResponse(ref, interaction, response));
        transition = await runTaskEffect(
          step.run({
            input: state.input,
            state: transition.state,
            response: cloneJson(response),
            context,
          }),
        );
      }

      return applyTransition(task, source, transition);
    }).compile({ checkpointer });
    graphs.set(task.id, graph);
    return graph;
  };

  const initialGraphState = (source: TaskRunSource): LangGraphExecutionState => ({
    taskId: source.taskId,
    runId: source.runId,
    input: source.input,
    executionState: source.checkpoint!.state as TaskExecutionState,
    done: false,
    result: undefined,
    eventOccurrence: source.checkpoint?.eventOccurrence ?? null,
  });

  const pendingProviderInteractionId = (
    graphState: Awaited<ReturnType<LangGraphRunnable['getState']>>,
  ) => {
    const ids = graphState.tasks.flatMap(task =>
      task.interrupts.flatMap(providerInterrupt => {
        const value = providerInterrupt.value;
        if (!value || typeof value !== 'object' || !('id' in value)) return [];
        return typeof value.id === 'string' ? [value.id] : [];
      }),
    );
    return ids.length === 1 ? ids[0] : undefined;
  };

  const expectedProviderInteractionId = (source: TaskRunSource) =>
    source.checkpoint?.interaction?.id ?? source.checkpoint?.response?.interactionId;

  const providerStateMatches = (
    graphState: Awaited<ReturnType<LangGraphRunnable['getState']>>,
    source: TaskRunSource,
  ) => {
    const expectedInteractionId = expectedProviderInteractionId(source);
    const providerInteractionId = pendingProviderInteractionId(graphState);
    return (
      graphState.values.taskId === source.taskId &&
      graphState.values.runId === source.runId &&
      JSON.stringify(graphState.values.executionState) ===
        JSON.stringify(source.checkpoint?.state) &&
      providerInteractionId === expectedInteractionId
    );
  };

  const rebuildProviderThread = async (graph: LangGraphRunnable, source: TaskRunSource) => {
    await checkpointer.getTuple(graphConfig(source));
    await checkpointer.deleteThread(graphConfig(source).configurable.thread_id);
    const config = graphConfig(source);
    const replay = replayOf(source);
    const replayEvent = checkpointOf(source)?.replayEvent;
    const firstState = replayEvent?.state ?? replay[0]?.state;
    const replaySource = firstState
      ? {
          ...source,
          checkpoint: {
            version: 1 as const,
            state: firstState,
            ...(replayEvent ? { eventOccurrence: replayEvent.occurrence } : {}),
          },
        }
      : source;
    let result = await graph.invoke(initialGraphState(replaySource), config);
    for (const entry of replay) {
      const graphState = await graph.getState(config);
      if (pendingProviderInteractionId(graphState) !== entry.response.interactionId) {
        throw invalidTaskDefinitionFailure(
          source.taskId,
          'LangGraph replay did not reproduce the expected pending interaction.',
          { interactionId: entry.response.interactionId },
        );
      }
      result = await graph.invoke(new Command({ resume: cloneJson(entry.response) }), config);
    }
    return result;
  };

  const invocationFor = async (graph: LangGraphRunnable, source: TaskRunSource, fresh: boolean) => {
    const config = graphConfig(source);
    if (fresh || source.checkpoint?.eventOccurrence) return rebuildProviderThread(graph, source);

    const graphState = await graph.getState(config);
    const providerMatches = providerStateMatches(graphState, source);
    if (source.checkpoint?.response) {
      if (!providerMatches) return rebuildProviderThread(graph, source);
      return graph.invoke(new Command({ resume: cloneJson(source.checkpoint.response) }), config);
    }
    return providerMatches ? graph.invoke(null, config) : rebuildProviderThread(graph, source);
  };

  const launch = (
    source: TaskRunSource,
    task: TaskDefinition<any, any>,
    operationContext: OperationRuntimeContext | undefined,
    fresh = false,
  ) => {
    const key = keyOf(source);
    const responseId = source.checkpoint?.response?.interactionId;
    if (activeRuns.has(key)) {
      if (responseId && activeRuns.get(key) !== responseId) {
        pendingLaunches.set(key, () => {
          launch(source, task, operationContext, fresh);
        });
      }
      return false;
    }
    activeRuns.set(key, responseId);
    const run = async () => {
      try {
        let claimed = await runTaskEffect(lease.claim(source));
        while (!claimed && responseId) {
          const latest = await runTaskEffect(storage.loadSource(source));
          if (
            latest.status !== 'running' ||
            latest.checkpoint?.response?.interactionId !== responseId ||
            !latest.runtime?.executionLease
          )
            return;
          await new Promise(resolve => setTimeout(resolve, 10));
          claimed = await runTaskEffect(lease.claim(source));
        }
        if (!claimed) return;
        await execution.run({ runtime: claimed.runtime }, async () => {
          const runtime = claimed.runtime;
          const renewal = runtime?.executionLease
            ? Effect.runFork(
                Effect.sleep(Math.max(1, Math.floor(executionLeaseMs / 3))).pipe(
                  Effect.zipRight(lease.renew(claimed, runtime)),
                  Effect.map(snapshot => snapshot !== undefined),
                  Effect.catchAll(error =>
                    Effect.sync(() => {
                      onBackgroundError?.(error);
                      return true;
                    }),
                  ),
                  Effect.repeat(Schedule.recurWhile(Boolean)),
                ),
              )
            : undefined;
          try {
            if (claimed.checkpoint?.eventOccurrence) {
              try {
                await settleTaskEventCheckpoint(claimed.checkpoint, host.events?.runtime);
              } catch (error) {
                onBackgroundError?.(toTaskFailure(error));
                return;
              }
            }
            await invocationFor(getGraph(task), claimed, fresh);
          } catch (error) {
            const failure = toTaskFailure(error);
            if (failure.reason === 'task_worker_lease_lost') return;
            const snapshot = await runTaskEffect(
              lease.update(claimed, claimed.runtime, {
                status: 'failed',
                completedAt: now(),
                ...(failure.reason === 'task_effect_outcome_ambiguous'
                  ? {}
                  : { checkpoint: undefined }),
                error: { code: failure.reason, message: failure.message },
              }),
            );
            if (snapshot) await publish(snapshot);
          } finally {
            if (renewal) await Effect.runPromise(Fiber.interrupt(renewal));
            if (claimed.runtime?.executionLease) {
              const { executionLease: _released, ...runtime } = claimed.runtime;
              await runTaskEffect(lease.update(claimed, claimed.runtime, { runtime }, true));
            }
          }
        });
      } finally {
        activeRuns.delete(key);
        const pending = pendingLaunches.get(key);
        if (pending) {
          pendingLaunches.delete(key);
          pending();
        }
      }
    };
    const promise = operationContext ? serverContext.run(operationContext, run) : run();
    void promise.catch(error => onBackgroundError?.(error));
    return true;
  };

  const recover = (source: TaskRunSource) => {
    const task = tasks.get(source.taskId);
    if (
      source.status !== 'running' ||
      !source.checkpoint ||
      source.checkpoint.interaction ||
      !task?.execution
    ) {
      return false;
    }
    return launch(source, task, host.createExecutionContext?.(source));
  };

  const refresh = (ref: TaskRunIdentity) =>
    Effect.gen(function* () {
      let source = yield* storage.loadSource(ref);
      if (source.status === 'waiting' && source.checkpoint?.eventWait && host.events) {
        const waiting = source;
        const snapshot = yield* Effect.tryPromise({
          try: () => pollTaskEventWait(storage, waiting, host.events?.runtime),
          catch: toTaskFailure,
        });
        if (snapshot) yield* projection.publish(snapshot);
        source = yield* storage.loadSource(ref);
      }
      recover(source);
      const snapshot = yield* storage.getSnapshot(ref);
      yield* projection.publish(snapshot);
      return snapshot;
    });

  const updateQueued = async (source: TaskRunSource, patch: Partial<TaskRunSource>) => {
    if (!storage.updateIfStatus) return update(source, patch);
    const snapshot = await runTaskEffect(
      storage.updateIfStatus(source, 'queued', patch, { runtime: source.runtime }),
    );
    return snapshot ? publish(snapshot) : runTaskEffect(storage.getSnapshot(source));
  };

  const runtime: TaskRuntime = {
    supportsAtomicAdmission: storage.admit !== undefined,
    ...(storage.updateIfStatus && {
      cancel: (ref: TaskRunIdentity) =>
        Effect.gen(function* () {
          while (true) {
            const source = yield* storage.loadSource(ref);
            if (
              source.runtime?.name !== 'langgraph' ||
              (source.status !== 'queued' &&
                source.status !== 'running' &&
                source.status !== 'waiting')
            )
              return undefined;
            if (source.checkpoint?.eventWait) {
              return yield* Effect.fail({
                reason: 'task_event_wait_cancel_required',
                message: 'Use Event-wait cancellation while this Task is waiting for an Event.',
              } satisfies TaskFailure);
            }
            const { executionLease: _revoked, ...runtime } = source.runtime;
            const snapshot = yield* storage.updateIfStatus!(
              ref,
              source.status,
              {
                status: 'cancelled',
                completedAt: now(),
                runtime,
                ...(source.status === 'queued'
                  ? {}
                  : {
                      error: {
                        code: 'task_effect_outcome_ambiguous',
                        message:
                          'LangGraph execution cancelled before confirming its external effects.',
                      },
                    }),
              },
              { runtime: source.runtime },
            );
            if (snapshot) {
              yield* projection.publish(snapshot);
              return snapshot;
            }
          }
        }),
    }),
    register: task => {
      tasks.set(task.id, task);
      legacyRuntime.register?.(task);
    },
    start: <TInput, TResult>(
      task: TaskDefinition<TInput, TResult>,
      input: TInput,
      options?: TaskStartOptions,
    ) => {
      if (!task.execution) return legacyRuntime.start(task, input, options);
      return Effect.tryPromise({
        try: async () => {
          tasks.set(task.id, task);
          const parsedInput = await runTaskEffect(validateTaskInput(task, input));
          const runId = options?.runId ?? createConfiguredRunId();
          const ref = { taskId: task.id, runId };
          const admission = options?.admission;
          if (admission && !storage.admit) {
            throw {
              reason: 'task_admission_unavailable',
              message: 'Task storage does not support atomic admission.',
            } satisfies TaskFailure;
          }
          const createInput = {
            ...ref,
            input: parsedInput,
            trigger: options?.trigger,
            subject: options?.subject,
            runtime: { name: 'langgraph', runId: threadIdOf(ref) },
          };
          const { source, created } = admission
            ? await runTaskEffect(storage.admit!(createInput, admission))
            : { source: await runTaskEffect(storage.create(createInput)), created: true };
          if (!created) {
            return {
              ...toTaskRunRef(source),
              admission:
                source.error?.code === 'task_effect_outcome_ambiguous'
                  ? ('reconciliation-required' as const)
                  : source.status === 'completed'
                    ? ('already-completed' as const)
                    : ('reused' as const),
            };
          }
          const admissionResult = admission ? { admission: 'created' as const } : {};
          await publish(await runTaskEffect(storage.getSnapshot(ref)));
          let state: TaskExecutionState;
          try {
            const initial = task.execution!.initial(parsedInput);
            if (!isTaskExecutionState(initial)) {
              throw invalidTaskDefinitionFailure(
                task.id,
                'Explicit execution initial state must be a JSON-safe object with a step.',
                {},
              );
            }
            state = initial;
          } catch (error) {
            const failure = toTaskFailure(error);
            const failed = await updateQueued(source, {
              status: 'failed',
              completedAt: now(),
              error: { code: failure.reason, message: failure.message },
            });
            return { ...toTaskRunRef(failed), ...admissionResult };
          }
          const checkpoint = { version: 1 as const, state: cloneJson(state) };
          const running = await updateQueued(source, {
            status: 'running',
            startedAt: now(),
            checkpoint,
          });
          if (running.status !== 'running') return { ...toTaskRunRef(running), ...admissionResult };
          const runningSource = { ...source, ...running, checkpoint, input: parsedInput };
          launch(
            runningSource,
            task,
            serverContext.current() ?? host.createExecutionContext?.(runningSource),
            true,
          );
          return { ...toTaskRunRef(running), ...admissionResult };
        },
        catch: toTaskFailure,
      });
    },
    getSnapshot: ref =>
      tasks.get(ref.taskId)?.execution ? refresh(ref) : legacyRuntime.getSnapshot(ref),
    cancelEventWait: ref =>
      Effect.gen(function* () {
        if (!tasks.get(ref.taskId)?.execution && legacyRuntime.cancelEventWait) {
          return yield* legacyRuntime.cancelEventWait(ref);
        }
        const source = yield* storage.loadSource(ref);
        const wait = source.checkpoint?.eventWait;
        const snapshot =
          source.status === 'waiting' && wait
            ? yield* storage.cancelEvent(ref, wait.id, 'cancelled')
            : undefined;
        if (!wait || !snapshot) {
          return yield* Effect.fail({
            reason: 'task_event_wait_not_pending',
            message: 'Task run has no pending Event wait.',
            ...ref,
          } satisfies TaskFailure);
        }
        yield* projection.publish(snapshot);
        yield* Effect.tryPromise({
          try: () => eventDelivery().cancel(taskEventWaitSubscriptionId(ref, wait.id)),
          catch: toTaskFailure,
        }).pipe(Effect.retry(Schedule.recurs(2)));
        return snapshot;
      }),
    listRecent: limit => storage.listRecent(limit),
    respondToInteraction: (ref, response, context) =>
      Effect.gen(function* () {
        const task = tasks.get(ref.taskId);
        if (!task?.execution) {
          if (!legacyRuntime.respondToInteraction) {
            return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
          }
          return yield* legacyRuntime.respondToInteraction(ref, response, context);
        }
        const source = yield* storage.loadSource(ref);
        if (
          source.trigger.actor?.kind !== context.actor.kind ||
          source.trigger.actor.id !== context.actor.id
        ) {
          return yield* Effect.fail(taskInteractionAccessDeniedFailure(ref));
        }
        const checkpoint = source.checkpoint;
        if (checkpoint?.response?.interactionId === response.interactionId) {
          recover(source);
          return yield* storage.getSnapshot(ref);
        }
        if (!checkpoint?.interaction) {
          return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
        }
        if (checkpoint.interaction.id !== response.interactionId) {
          return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
        }
        yield* validateTaskInteractionResponse(ref, checkpoint.interaction, response);
        const nextCheckpoint = withReplay(
          {
            version: 1 as const,
            state: checkpoint.state,
            response: cloneJson(response),
          },
          [
            ...replayOf(source),
            {
              state: cloneJson(checkpoint.state) as TaskExecutionState,
              response: cloneJson(response),
            },
          ],
          checkpointOf(source)?.replayEvent,
        );
        const snapshot = yield* storage.claimInteraction(
          ref,
          response.interactionId,
          nextCheckpoint,
        );
        if (!snapshot) return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
        yield* projection.publish(snapshot);
        const resumedSource = { ...source, status: 'running' as const, checkpoint: nextCheckpoint };
        launch(
          resumedSource,
          task,
          serverContext.current() ?? host.createExecutionContext?.(resumedSource),
        );
        return snapshot;
      }),
    observe: ref =>
      Stream.unwrap(
        Effect.gen(function* () {
          const task = tasks.get(ref.taskId);
          if (!task?.execution && legacyRuntime.observe) return legacyRuntime.observe(ref);
          yield* refresh(ref);
          const snapshots = projection.observe(ref);
          if (!host.events) return snapshots;
          return snapshots.pipe(
            Stream.drainFork(
              Stream.repeatEffect(
                refresh(ref).pipe(
                  Effect.delay('250 millis'),
                  Effect.catchAll(error =>
                    Effect.sync(() => {
                      onBackgroundError?.(error);
                      return undefined;
                    }),
                  ),
                ),
              ).pipe(
                Stream.takeUntil(
                  snapshot =>
                    snapshot !== undefined &&
                    ['completed', 'failed', 'cancelled'].includes(snapshot.status),
                ),
              ),
            ),
          );
        }),
      ),
  };

  return runtime;
};

export const createLangGraphTaskExecutor = (
  options: LangGraphTaskExecutorOptions = {},
): TaskExecutor => ({
  createRuntime: (storage, host = {}) => createLangGraphTaskRuntime(storage, host, options),
});

export const langGraphTasks = ({
  storage = createInMemoryTaskStorage(),
  createExecutionContext,
  events,
  ...executorOptions
}: LangGraphTasksOptions = {}): TaskConfig => ({
  executor: createLangGraphTaskExecutor(executorOptions),
  storage,
  ...(createExecutionContext || events ? { host: { createExecutionContext, events } } : {}),
});
