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
import { serverContext, type OperationRuntimeContext } from '@ontahi/core/runtime/server';
import {
  createInMemoryTaskStorage,
  createInProcessTaskExecutor,
  getInMemoryTaskRunProjection,
  invalidTaskDefinitionFailure,
  isTaskExecutionState,
  materializeTaskExecutionInteraction,
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
  type TaskApprovalInteractionRequest,
  type TaskChoiceInteractionRequest,
  type TaskConfig,
  type TaskDefinition,
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
import { cloneJson, type JsonValue } from '@ontahi/core/value/json';
import { Effect, Stream } from 'effect';

const LangGraphState = Annotation.Root({
  taskId: Annotation<string>(),
  runId: Annotation<string>(),
  input: Annotation<unknown>(),
  executionState: Annotation<TaskExecutionState>(),
  done: Annotation<boolean>(),
  result: Annotation<unknown>(),
});

type LangGraphExecutionState = typeof LangGraphState.State;
type LangGraphRunnable = ReturnType<ReturnType<typeof createGraphBuilder>['compile']>;

export type LangGraphTaskExecutorOptions = InProcessTaskExecutorOptions & {
  checkpointer?: BaseCheckpointSaver;
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
const graphConfig = (ref: TaskRunIdentity) => ({
  configurable: { thread_id: threadIdOf(ref) },
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
    sleep = milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
    createRunId: createConfiguredRunId = createRunId,
    onBackgroundError,
  }: LangGraphTaskExecutorOptions,
): TaskRuntime => {
  const projection = getInMemoryTaskRunProjection(storage);
  const legacyRuntime = createInProcessTaskExecutor({
    sleep,
    createRunId: createConfiguredRunId,
    onBackgroundError,
  }).createRuntime(storage, host);
  const tasks = new Map<string, TaskDefinition<any, any>>();
  const graphs = new Map<string, LangGraphRunnable>();
  const activeRuns = new Map<string, string | undefined>();
  const pendingLaunches = new Map<string, () => void>();

  const publish = async (snapshot: TaskSnapshot) => {
    await runTaskEffect(projection.publish(snapshot));
    return snapshot;
  };
  const update = async (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    publish(await runTaskEffect(storage.update(ref, patch)));

  const createStepContext = (task: TaskDefinition<any, any>, source: TaskRunSource) => ({
    taskId: source.taskId,
    runId: source.runId,
    ...(source.subject ? { subject: source.subject } : {}),
    trigger: source.trigger,
    createdAt: source.createdAt,
    progress: (progress: NonNullable<TaskSnapshot['progress']>) =>
      validateTaskProgress(task, progress).pipe(
        Effect.flatMap(parsedProgress => storage.update(source, { progress: parsedProgress })),
        Effect.tap(projection.publish),
      ),
    sleep: (milliseconds: number) =>
      Effect.tryPromise({ try: () => sleep(milliseconds), catch: toTaskFailure }),
  });

  const prepareInteraction = async (
    ref: TaskRunIdentity,
    state: TaskExecutionState,
    request: TaskChoiceInteractionRequest<JsonValue> | TaskApprovalInteractionRequest,
    reuseClaimedResponseId: boolean,
  ) => {
    const persisted = await runTaskEffect(storage.loadSource(ref));
    const sameState = JSON.stringify(persisted.checkpoint?.state) === JSON.stringify(state);
    const existing = sameState ? persisted.checkpoint?.interaction : undefined;
    const expectedKind = 'options' in request ? 'choice' : 'approval';
    const canReuse =
      existing?.kind === expectedKind && (request.id === undefined || request.id === existing.id);
    const interaction = canReuse
      ? existing
      : await runTaskEffect(
          materializeTaskExecutionInteraction(ref, request, {
            id:
              request.id ??
              (reuseClaimedResponseId ? persisted.checkpoint?.response?.interactionId : undefined),
          }),
        );

    if (persisted.checkpoint?.response?.interactionId !== interaction.id) {
      await update(ref, {
        checkpoint: {
          version: 1,
          state: cloneJson(state),
          interaction,
        },
      });
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
      await update(ref, {
        status: 'completed',
        completedAt: now(),
        result,
        checkpoint: undefined,
      });
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
      await prepareInteraction(ref, executionState, transition.interaction, false);
      return { executionState, done: false };
    }
    await update(ref, { checkpoint: { version: 1, state: executionState } });
    return { executionState, done: false };
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
      if (!isTaskExecutionState(state.executionState)) {
        throw invalidTaskDefinitionFailure(task.id, 'LangGraph execution state is invalid.', {});
      }
      const step = definition.steps[state.executionState.step];
      if (!step) throw missingTaskStepFailure(task.id, state.executionState.step);
      const context = createStepContext(task, source);
      let transition = await runTaskEffect(
        step.run({ input: state.input, state: state.executionState, context }),
      );

      if (transition.kind === 'interaction') {
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
          true,
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
  });

  const invocationFor = async (graph: LangGraphRunnable, source: TaskRunSource, fresh: boolean) => {
    const config = graphConfig(source);
    if (source.checkpoint?.response) {
      return graph.invoke(new Command({ resume: cloneJson(source.checkpoint.response) }), config);
    }
    if (fresh) return graph.invoke(initialGraphState(source), config);
    const graphState = await graph.getState(config);
    return graph.invoke(graphState.values.taskId ? null : initialGraphState(source), config);
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
        await invocationFor(getGraph(task), source, fresh);
      } catch (error) {
        const failure = toTaskFailure(error);
        await update(source, {
          status: 'failed',
          completedAt: now(),
          checkpoint: undefined,
          error: { code: failure.reason, message: failure.message },
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

  const runtime: TaskRuntime = {
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
          const source = await runTaskEffect(
            storage.create({
              ...ref,
              input: parsedInput,
              trigger: options?.trigger,
              subject: options?.subject,
            }),
          );
          await publish(await runTaskEffect(storage.getSnapshot(ref)));
          await runTaskEffect(
            storage.attachRuntimeRef(ref, { name: 'langgraph', runId: threadIdOf(ref) }),
          );
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
            const failed = await update(ref, {
              status: 'failed',
              completedAt: now(),
              error: { code: failure.reason, message: failure.message },
            });
            return toTaskRunRef(failed);
          }
          const checkpoint = { version: 1 as const, state: cloneJson(state) };
          const running = await update(ref, {
            status: 'running',
            startedAt: now(),
            checkpoint,
          });
          const runningSource = { ...source, ...running, checkpoint, input: parsedInput };
          launch(
            runningSource,
            task,
            serverContext.current() ?? host.createExecutionContext?.(runningSource),
            true,
          );
          return toTaskRunRef(running);
        },
        catch: toTaskFailure,
      });
    },
    getSnapshot: ref =>
      Effect.gen(function* () {
        const task = tasks.get(ref.taskId);
        if (!task?.execution) return yield* legacyRuntime.getSnapshot(ref);
        const source = yield* storage.loadSource(ref);
        recover(source);
        const snapshot = yield* storage.getSnapshot(ref);
        yield* projection.publish(snapshot);
        return snapshot;
      }),
    listRecent: limit => storage.listRecent(limit),
    respondToInteraction: (ref, response, context) =>
      Effect.gen(function* () {
        const task = tasks.get(ref.taskId);
        if (!task?.execution || !task.execution) {
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
        const nextCheckpoint = {
          version: 1 as const,
          state: checkpoint.state,
          response: cloneJson(response),
        };
        const snapshot = yield* storage.claimInteraction(
          ref,
          response.interactionId,
          nextCheckpoint,
        );
        if (!snapshot) return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
        yield* projection.publish(snapshot);
        const resumedSource = { ...source, checkpoint: nextCheckpoint };
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
          const source = yield* storage.loadSource(ref);
          recover(source);
          const snapshot = yield* storage.getSnapshot(ref);
          yield* projection.publish(snapshot);
          return projection.observe(ref);
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
  ...executorOptions
}: LangGraphTasksOptions = {}): TaskConfig => ({
  executor: createLangGraphTaskExecutor(executorOptions),
  storage,
  ...(createExecutionContext ? { host: { createExecutionContext } } : {}),
});
