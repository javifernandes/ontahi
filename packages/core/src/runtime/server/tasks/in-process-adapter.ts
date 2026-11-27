import { Cause, Effect, Option, Stream } from 'effect';

import { cloneJson } from '../../../value/json.js';
import { getConfiguredRuntimeTelemetry } from '../config.js';
import type { OperationRuntimeContext } from '../context-types.js';
import { getOperationRuntimeContext, operationRuntimeContextStorage } from '../context.js';
import { traceRuntimeEffect } from '../telemetry.js';
import {
  commitMutationSetToCurrentUnitOfWork,
  createCommittedMutationCommit,
  deliverCommittedMutationsToCurrentRuntime,
  getCurrentUnitOfWork,
  sealCurrentUnitOfWorkMutationJournal,
} from '../unit-of-work.js';

import {
  createTaskEventCheckpoint,
  pollTaskEventWait,
  requireTaskEventDelivery,
  settleTaskEventCheckpoint,
  eventWaitMatchesOccurrence,
  materializeTaskEventWait,
  taskEventWaitSubscriptionId,
} from './event-waits.js';
import {
  isTaskExecutionState,
  materializeTaskExecutionInteraction,
  validateTaskApprovalInteractionRequest,
  validateTaskChoiceInteractionRequest,
  validateTaskInputInteractionRequest,
  validateTaskInteractionResponse,
} from './execution-interactions.js';
import {
  invalidTaskInteractionFailure,
  invalidTaskInteractionResponseFailure,
  invalidTaskDefinitionFailure,
  missingTaskStepFailure,
  taskInteractionAccessDeniedFailure,
  taskInteractionMismatchFailure,
  taskInteractionNotPendingFailure,
  toTaskFailure,
} from './failures.js';
import { getInMemoryTaskRunProjection } from './task-run-observation.js';
import type {
  InProcessTaskExecutorOptions,
  InProcessTaskRuntimeOptions,
  TaskExecutor,
  TaskContext,
  TaskDefinition,
  TaskApprovalDecision,
  TaskFailure,
  TaskExecutionCheckpoint,
  TaskExecutionInteractionRequest,
  TaskInteractionResponse,
  TaskInteractionResponseContext,
  TaskPendingApprovalInteraction,
  TaskPendingChoiceInteraction,
  TaskPendingInputInteraction,
  TaskInputValue,
  TaskInputValueFor,
  TaskPendingInteraction,
  TaskRunIdentity,
  TaskRunRef,
  TaskRunSource,
  TaskRuntime,
  TaskSnapshot,
} from './types.js';
import {
  validateTaskInput,
  validateTaskOutput,
  validateTaskProgress,
  validateTaskStepInput,
  validateTaskStepOutput,
} from './validation.js';

const now = () => new Date().toISOString();

let fallbackRunIdSequence = 0;

const createRunId = () =>
  globalThis.crypto?.randomUUID() ?? `task-${Date.now()}-${++fallbackRunIdSequence}`;

let fallbackInteractionIdSequence = 0;

const createInteractionId = () =>
  globalThis.crypto?.randomUUID() ?? `interaction-${Date.now()}-${++fallbackInteractionIdSequence}`;

type PendingInteraction = {
  interaction: TaskPendingInteraction;
  resolve(
    response: TaskInteractionResponse,
  ): { readonly success: true; readonly value: unknown } | { readonly success: false };
  continuation: Promise<unknown>;
  resume(value: unknown): void;
};

const createContinuation = () => {
  let resume!: (value: unknown) => void;
  const continuation = new Promise<unknown>(resolve => {
    resume = resolve;
  });
  return { continuation, resume };
};

const taskFailureFromCause = (cause: Cause.Cause<unknown>): TaskFailure => {
  const failure = Cause.failureOption(cause);
  return toTaskFailure(Option.isSome(failure) ? failure.value : Cause.squash(cause));
};

const pendingInteractionsByStorage = new WeakMap<object, Map<string, PendingInteraction>>();

const getPendingInteractions = (storage: object) => {
  const existing = pendingInteractionsByStorage.get(storage);
  if (existing) return existing;

  const interactions = new Map<string, PendingInteraction>();
  pendingInteractionsByStorage.set(storage, interactions);
  return interactions;
};

const toTaskRunRef = (snapshot: TaskSnapshot): TaskRunRef => ({
  taskId: snapshot.taskId,
  runId: snapshot.runId,
  status: snapshot.status,
  ...(snapshot.subject ? { subject: snapshot.subject } : {}),
});

export const deferredTaskRuntimeName = 'deferred-worker';

export const createInProcessTaskRuntime = ({
  storage,
  sleep = milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
  createRunId: createConfiguredRunId = createRunId,
  onBackgroundError,
  createExecutionContext,
  events,
  deferExplicitExecution = false,
  withEventWaitTransaction = (_ref, work) => work(),
}: InProcessTaskRuntimeOptions): TaskRuntime & {
  runCheckpoint(ref: TaskRunIdentity): Effect.Effect<boolean, TaskFailure>;
} => {
  const taskRuns = getInMemoryTaskRunProjection(storage);
  const pendingInteractions = getPendingInteractions(storage);
  const taskDefinitions = new Map<string, TaskDefinition<any, any>>();
  const activeExplicitExecutions = new Set<string>();
  const activeEventWaits = new Map<string, AbortController>();
  const eventDeclarations = new Map(
    events?.declarations.map(declaration => [declaration.id, declaration]),
  );
  const keyOf = (ref: TaskRunIdentity) => JSON.stringify([ref.taskId, ref.runId]);
  const withPendingInteraction = (snapshot: TaskSnapshot): TaskSnapshot => {
    const key = keyOf(snapshot);
    const pending = pendingInteractions.get(key)?.interaction;

    return pending ? { ...snapshot, interaction: pending } : snapshot;
  };
  const update = (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    storage.update(ref, patch).pipe(Effect.tap(taskRuns.publish));
  let resumeEventWait: (source: TaskRunSource) => boolean;
  const observeEventWait = (source: TaskRunSource) => {
    const wait = source.checkpoint?.eventWait;
    if (!wait) return false;
    if (!events) {
      void Effect.runPromise(
        update(source, {
          status: 'failed',
          completedAt: now(),
          checkpoint: undefined,
          error: {
            code: 'task_event_runtime_unavailable',
            message: 'A durable Event Runtime is required for Task Event waits.',
          },
        }),
      );
      return false;
    }

    let delivery;
    try {
      delivery = requireTaskEventDelivery(events.runtime);
    } catch (error) {
      void Effect.runPromise(
        update(source, {
          status: 'failed',
          completedAt: now(),
          checkpoint: undefined,
          error: {
            code: 'task_event_runtime_unavailable',
            message: String(error),
          },
        }),
      );
      return false;
    }

    const key = keyOf(source);
    if (activeEventWaits.has(key)) return false;
    const controller = new AbortController();
    activeEventWaits.set(key, controller);
    const subscriptionId = taskEventWaitSubscriptionId(source, wait.id);
    const consumerId = `task-runtime:${source.taskId}:${source.runId}`;
    const retryDelay = () => new Promise(resolve => setTimeout(resolve, 100));
    const run = async () => {
      while (!controller.signal.aborted) {
        try {
          await delivery.register({
            id: subscriptionId,
            eventId: wait.eventId,
            eventVersion: wait.eventVersion,
            ...(wait.correlation ? { correlation: wait.correlation } : {}),
          });
          break;
        } catch (error) {
          onBackgroundError?.(error);
          await retryDelay();
        }
      }
      while (!controller.signal.aborted) {
        try {
          if (wait.timeoutAt && Date.parse(wait.timeoutAt) <= Date.now()) {
            const snapshot = await Effect.runPromise(
              storage.cancelEvent(source, wait.id, 'failed', {
                code: 'task_event_wait_timed_out',
                message: `Timed out waiting for Event ${wait.eventId}@${wait.eventVersion}.`,
              }),
            );
            if (snapshot) await Effect.runPromise(taskRuns.publish(snapshot));
            await delivery.cancel(subscriptionId);
            return;
          }
          if (!taskDefinitions.get(source.taskId)?.execution) {
            await new Promise(resolve => setTimeout(resolve, 10));
            continue;
          }
          const claim = await delivery.claim(subscriptionId, { consumerId, leaseMs: 1_000 });
          if (!claim) {
            const latest = await Effect.runPromise(storage.loadSource(source));
            if (latest.status !== 'waiting' || latest.checkpoint?.eventWait?.id !== wait.id) {
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
            continue;
          }
          if (!eventWaitMatchesOccurrence(wait, claim.delivery.occurrence)) {
            await delivery.release(claim);
            await retryDelay();
            continue;
          }
          const checkpoint = createTaskEventCheckpoint(source.checkpoint!, wait, claim);
          const snapshot = await Effect.runPromise(storage.claimEvent(source, wait.id, checkpoint));
          if (!snapshot) {
            const latest = await Effect.runPromise(storage.loadSource(source));
            if (latest.status === 'waiting') await delivery.release(claim);
            else {
              await delivery.acknowledge(claim);
              await delivery.cancel(subscriptionId);
            }
            return;
          }
          await Effect.runPromise(taskRuns.publish(snapshot));
          const latest = await Effect.runPromise(storage.loadSource(source));
          resumeEventWait(latest);
          await delivery.acknowledge(claim);
          await delivery.cancel(subscriptionId);
          return;
        } catch (error) {
          onBackgroundError?.(error);
          await retryDelay();
        }
      }
    };
    void run()
      .catch(error => onBackgroundError?.(error))
      .finally(() => {
        if (activeEventWaits.get(key) === controller) activeEventWaits.delete(key);
      });
    return true;
  };
  const restoreCommittedMutations = (source: TaskRunSource) => {
    if (source.executionMetadata?.committedMutations) {
      commitMutationSetToCurrentUnitOfWork(source.executionMetadata.committedMutations);
    }
  };
  const captureExecutionMetadata = (): TaskRunSource['executionMetadata'] => {
    if (!getCurrentUnitOfWork()) return undefined;
    const committedMutations = sealCurrentUnitOfWorkMutationJournal();
    if (committedMutations.mutations.length === 0) return undefined;
    const commit = createCommittedMutationCommit(committedMutations);
    return { committedMutations, mutationCommitId: commit.id };
  };
  const createTaskOperationContext = (
    source: TaskRunSource,
  ): OperationRuntimeContext | undefined => {
    const configured = createExecutionContext?.(source);
    if (configured) return configured;
    const parent = getOperationRuntimeContext();
    return parent
      ? {
          ...parent,
          scope: source.taskId,
          telemetrySpanName: source.taskId,
          resources: new Map(parent.resources),
        }
      : undefined;
  };
  const waitForInteraction = <TValue>(
    ref: TaskRunIdentity,
    pending: PendingInteraction,
  ): Effect.Effect<TValue, TaskFailure> => {
    const key = keyOf(ref);
    pendingInteractions.set(key, pending);

    return storage.update(ref, { status: 'waiting' }).pipe(
      Effect.map(withPendingInteraction),
      Effect.tap(taskRuns.publish),
      Effect.tapError(() => Effect.sync(() => pendingInteractions.delete(key))),
      Effect.flatMap(() => Effect.promise(() => pending.continuation)),
      Effect.ensuring(
        Effect.sync(() => {
          if (pendingInteractions.get(key) === pending) pendingInteractions.delete(key);
        }),
      ),
      Effect.map(value => value as TValue),
    );
  };
  const materializeExecutionInteraction = (
    ref: TaskRunIdentity,
    request: TaskExecutionInteractionRequest,
  ): Effect.Effect<TaskPendingInteraction, TaskFailure> =>
    materializeTaskExecutionInteraction(ref, request);
  const createTaskContext = (
    task: TaskDefinition<any, any>,
    source: TaskRunSource,
  ): TaskContext => {
    const ref = { taskId: source.taskId, runId: source.runId };
    const context: TaskContext = {
      ...ref,
      ...(source.subject ? { subject: source.subject } : {}),
      trigger: source.trigger,
      createdAt: source.createdAt,
      interact: {
        choice: request =>
          Effect.gen(function* () {
            yield* validateTaskChoiceInteractionRequest(ref, request);
            const key = keyOf(ref);
            if (pendingInteractions.has(key)) {
              return yield* Effect.fail(
                invalidTaskInteractionFailure(ref, 'Task run already has a pending interaction.'),
              );
            }

            const continuation = createContinuation();
            const interaction = {
              id: request.id ?? createInteractionId(),
              kind: 'choice',
              prompt: request.prompt,
              options: request.options.map(({ id, label }) => ({ id, label })),
              createdAt: now(),
            } satisfies TaskPendingChoiceInteraction;
            const values = new Map(request.options.map(option => [option.id, option.value]));
            const pending = {
              interaction,
              resolve: (response: TaskInteractionResponse) => {
                if (!('optionId' in response)) return { success: false } as const;
                return values.has(response.optionId)
                  ? ({ success: true, value: values.get(response.optionId) } as const)
                  : ({ success: false } as const);
              },
              ...continuation,
            } satisfies PendingInteraction;

            return yield* waitForInteraction<(typeof request.options)[number]['value']>(
              ref,
              pending,
            );
          }),
        input: request =>
          Effect.gen(function* () {
            yield* validateTaskInputInteractionRequest(ref, request);
            const key = keyOf(ref);
            if (pendingInteractions.has(key)) {
              return yield* Effect.fail(
                invalidTaskInteractionFailure(ref, 'Task run already has a pending interaction.'),
              );
            }

            const continuation = createContinuation();
            const interaction = {
              id: request.id ?? createInteractionId(),
              kind: 'input',
              prompt: request.prompt,
              input: request.input,
              createdAt: now(),
            } satisfies TaskPendingInputInteraction;
            const pending = {
              interaction,
              resolve: (response: TaskInteractionResponse) =>
                'value' in response
                  ? ({ success: true, value: response.value } as const)
                  : ({ success: false } as const),
              ...continuation,
            } satisfies PendingInteraction;

            return (yield* waitForInteraction<TaskInputValue>(ref, pending)) as TaskInputValueFor<
              typeof request.input
            >;
          }),
        approval: request =>
          Effect.gen(function* () {
            yield* validateTaskApprovalInteractionRequest(ref, request);
            const key = keyOf(ref);
            if (pendingInteractions.has(key)) {
              return yield* Effect.fail(
                invalidTaskInteractionFailure(ref, 'Task run already has a pending interaction.'),
              );
            }

            const continuation = createContinuation();
            const interaction = {
              id: request.id ?? createInteractionId(),
              kind: 'approval',
              prompt: request.prompt,
              proposal: cloneJson(request.proposal),
              createdAt: now(),
            } satisfies TaskPendingApprovalInteraction;
            const pending = {
              interaction,
              resolve: (response: TaskInteractionResponse) =>
                'decision' in response
                  ? {
                      success: true,
                      value: {
                        decision: response.decision,
                        ...(response.reason === undefined ? {} : { reason: response.reason }),
                      },
                    }
                  : { success: false },
              ...continuation,
            } satisfies PendingInteraction;

            return yield* waitForInteraction<TaskApprovalDecision>(ref, pending);
          }),
      },
      progress: progress =>
        Effect.flatMap(validateTaskProgress(task, progress), parsedProgress =>
          update(ref, { progress: parsedProgress }),
        ),
      sleep: milliseconds =>
        Effect.tryPromise({
          try: () => sleep(milliseconds),
          catch: toTaskFailure,
        }),
      step: (stepOrName: string | { id: string }, input: unknown) => {
        const name = typeof stepOrName === 'string' ? stepOrName : stepOrName.id;
        const step = task.steps?.[name];

        return step
          ? Effect.flatMap(validateTaskStepInput(task.id, step, input), parsedInput =>
              Effect.flatMap(step.run(parsedInput, context), output =>
                validateTaskStepOutput(task.id, step, output),
              ),
            )
          : Effect.fail(missingTaskStepFailure(task.id, name));
      },
    };
    return context;
  };
  const traceExecution = <TValue, TError>(
    source: TaskRunSource,
    work: Effect.Effect<TValue, TError>,
  ) =>
    Effect.suspend(() => {
      if (!getConfiguredRuntimeTelemetry() || !storage.beginExecution) return work;
      return storage.beginExecution(source).pipe(
        Effect.flatMap(ordinal =>
          traceRuntimeEffect('ontahi.runtime.task.attempt', work, undefined, {
            attributes: { 'ontahi.task.execution.ordinal': ordinal },
            ...(source.enqueueTrace ? { links: [source.enqueueTrace] } : {}),
          }),
        ),
      );
    });
  const prepareExplicitExecution = (
    ref: TaskRunIdentity,
    task: TaskDefinition<any, any>,
    source: TaskRunSource,
    refresh = false,
  ) => {
    const executionKey = keyOf(ref);
    if (activeExplicitExecutions.has(executionKey)) return undefined;
    activeExplicitExecutions.add(executionKey);

    const definition = task.execution!;
    const background = Effect.gen(function* () {
      if (refresh) {
        // The previous execution may have settled after the caller read its checkpoint.
        source = yield* storage.loadSource(ref);
        if (source.status !== 'running' || !canRunCheckpoint(source)) return;
      }
      const context = createTaskContext(task, source);
      yield* traceExecution(
        source,
        Effect.gen(function* () {
          yield* Effect.sync(() => restoreCommittedMutations(source));
          let checkpoint = source.checkpoint!;

          while (true) {
            if (checkpoint.version !== 1 || !isTaskExecutionState(checkpoint.state)) {
              return yield* Effect.fail(
                invalidTaskDefinitionFailure(
                  task.id,
                  'Persisted explicit execution state is invalid.',
                  {},
                ),
              );
            }
            if (deferExplicitExecution) yield* storage.loadSource(ref);
            const step = definition.steps[checkpoint.state.step];
            if (!step) {
              return yield* Effect.fail(missingTaskStepFailure(task.id, checkpoint.state.step));
            }
            const transition = yield* step.run({
              input: source.input,
              state: checkpoint.state,
              ...(checkpoint.response ? { response: checkpoint.response } : {}),
              ...(checkpoint.eventOccurrence ? { event: checkpoint.eventOccurrence } : {}),
              context,
            });

            if (transition.kind === 'complete') {
              const result = yield* validateTaskOutput(task, transition.result);
              const executionMetadata = yield* Effect.sync(captureExecutionMetadata);
              yield* update(ref, {
                status: 'completed',
                completedAt: now(),
                result,
                ...(executionMetadata ? { executionMetadata } : {}),
                checkpoint: undefined,
              });
              if (executionMetadata?.committedMutations) {
                yield* Effect.sync(() =>
                  deliverCommittedMutationsToCurrentRuntime({
                    id:
                      executionMetadata.mutationCommitId ??
                      createCommittedMutationCommit(executionMetadata.committedMutations).id,
                    mutations: executionMetadata.committedMutations,
                  }),
                );
              }
              return;
            }
            if (!isTaskExecutionState(transition.state)) {
              return yield* Effect.fail(
                invalidTaskDefinitionFailure(
                  task.id,
                  'Explicit execution step returned an invalid JSON-safe state.',
                  { stepId: checkpoint.state.step },
                ),
              );
            }

            if (transition.kind === 'continue') {
              checkpoint = { version: 1, state: cloneJson(transition.state) };
              yield* update(ref, { checkpoint });
              continue;
            }

            if (transition.kind === 'event') {
              if (deferExplicitExecution) {
                yield* Effect.try({
                  try: () => requireTaskEventDelivery(events?.runtime),
                  catch: error => ({
                    reason: 'task_event_runtime_unavailable',
                    message: String(error),
                  }),
                });
              }
              const eventWait = yield* Effect.try({
                try: () => materializeTaskEventWait(ref, transition.event, eventDeclarations),
                catch: toTaskFailure,
              });
              checkpoint = { version: 1, state: cloneJson(transition.state), eventWait };
              const executionMetadata = yield* Effect.sync(captureExecutionMetadata);
              yield* update(ref, {
                status: 'waiting',
                checkpoint,
                ...(executionMetadata ? { executionMetadata } : {}),
              });
              const waitingSource = { ...source, status: 'waiting' as const, checkpoint };
              if (!deferExplicitExecution) observeEventWait(waitingSource);
              return;
            }

            const interaction = yield* materializeExecutionInteraction(ref, transition.interaction);
            checkpoint = { version: 1, state: cloneJson(transition.state), interaction };
            const executionMetadata = yield* Effect.sync(captureExecutionMetadata);
            yield* update(ref, {
              status: 'waiting',
              checkpoint,
              ...(executionMetadata ? { executionMetadata } : {}),
            });
            return;
          }
        }),
      );
    }).pipe(
      Effect.catchAllCause(cause => {
        if (deferExplicitExecution && Cause.isInterruptedOnly(cause))
          return Effect.failCause(cause);
        const error = taskFailureFromCause(cause);
        return Effect.sync(captureExecutionMetadata).pipe(
          Effect.flatMap(executionMetadata =>
            update(ref, {
              status: 'failed',
              completedAt: now(),
              ...(error.reason === 'task_effect_outcome_ambiguous'
                ? {}
                : { checkpoint: undefined }),
              ...(executionMetadata ? { executionMetadata } : {}),
              error: {
                code: error.reason,
                message: error.message,
              },
            }),
          ),
        );
      }),
      Effect.ensuring(Effect.sync(() => activeExplicitExecutions.delete(executionKey))),
    );

    return background;
  };
  const launchExplicitExecution = (
    ref: TaskRunIdentity,
    task: TaskDefinition<any, any>,
    source: TaskRunSource,
    operationContext?: OperationRuntimeContext,
    refresh = false,
  ) => {
    if (deferExplicitExecution || source.runtime?.name === deferredTaskRuntimeName) return false;
    const execution = prepareExplicitExecution(ref, task, source, refresh);
    if (!execution) return false;
    const run = () => Effect.runPromise(execution).catch(error => onBackgroundError?.(error));
    if (operationContext) operationRuntimeContextStorage.run(operationContext, run);
    else void run();
    return true;
  };
  const canRunCheckpoint = (source: TaskRunSource) =>
    (source.status === 'queued' || source.status === 'running') &&
    source.checkpoint &&
    !source.checkpoint.interaction &&
    !source.checkpoint.eventWait;

  const recoverExplicitExecution = (source: TaskRunSource) => {
    const task = taskDefinitions.get(source.taskId);
    if (source.status !== 'running' || !canRunCheckpoint(source) || !task?.execution) return false;
    return launchExplicitExecution(source, task, source, createTaskOperationContext(source), true);
  };
  resumeEventWait = recoverExplicitExecution;
  const recoverEventWait = (source: TaskRunSource) =>
    !deferExplicitExecution &&
    source.runtime?.name !== deferredTaskRuntimeName &&
    source.status === 'waiting' &&
    source.checkpoint?.eventWait
      ? observeEventWait(source)
      : false;

  return {
    supportsAtomicAdmission: storage.admit !== undefined,
    register: task => {
      taskDefinitions.set(task.id, task);
    },
    runCheckpoint: ref =>
      Effect.gen(function* () {
        if (!deferExplicitExecution) return false;
        let source = yield* storage.loadSource(ref);
        const task = taskDefinitions.get(ref.taskId);
        if (source.runtime?.name !== deferredTaskRuntimeName || !task?.execution) return false;
        if (source.status === 'waiting' && source.checkpoint?.eventWait) {
          const waiting = source;
          const snapshot = yield* Effect.uninterruptible(
            Effect.tryPromise({
              try: () =>
                withEventWaitTransaction(ref, () =>
                  pollTaskEventWait(storage, waiting, events?.runtime),
                ),
              catch: toTaskFailure,
            }),
          );
          if (!snapshot) return false;
          yield* taskRuns.publish(snapshot);
          if (snapshot.status === 'failed') return true;
          source = yield* storage.loadSource(ref);
        }
        if (!canRunCheckpoint(source)) return false;
        if (source.checkpoint?.eventResume) {
          const checkpoint = source.checkpoint;
          yield* Effect.uninterruptible(
            Effect.tryPromise({
              try: () =>
                withEventWaitTransaction(ref, () =>
                  settleTaskEventCheckpoint(checkpoint, events?.runtime),
                ),
              catch: toTaskFailure,
            }),
          );
        }
        if (source.status === 'queued') {
          yield* update(ref, { status: 'running', startedAt: now() });
        }
        const operationContext = createTaskOperationContext(source);
        const execution = prepareExplicitExecution(ref, task, source);
        if (!execution) return false;
        yield* operationContext
          ? Effect.async<void, TaskFailure>(resume => {
              let notifyExit!: () => void;
              const exited = new Promise<void>(resolve => {
                notifyExit = resolve;
              });
              const cancel = operationRuntimeContextStorage.run(operationContext, () =>
                Effect.runCallback(execution, {
                  onExit: exit => {
                    notifyExit();
                    resume(exit);
                  },
                }),
              );
              return Effect.promise(() => {
                cancel();
                return exited;
              });
            })
          : execution;
        return true;
      }),
    start: (task, input, options) =>
      Effect.gen(function* () {
        taskDefinitions.set(task.id, task);
        const parsedInput = yield* validateTaskInput(task, input);
        const runId = options?.runId ?? createConfiguredRunId();
        const ref = { taskId: task.id, runId };
        let initialCheckpoint: TaskExecutionCheckpoint | undefined;
        if (deferExplicitExecution) {
          const state = task.execution?.initial(parsedInput);
          if (!isTaskExecutionState(state)) {
            return yield* Effect.fail(
              invalidTaskDefinitionFailure(
                task.id,
                'Worker execution requires a valid explicit Task.',
                {},
              ),
            );
          }
          initialCheckpoint = { version: 1, state: cloneJson(state) };
        }
        const enqueueTrace = getConfiguredRuntimeTelemetry()?.captureTraceContext?.();
        const createInput = {
          ...(enqueueTrace ? { enqueueTrace } : {}),
          ...ref,
          input: parsedInput,
          trigger: options?.trigger,
          subject: options?.subject,
          ...(initialCheckpoint
            ? { checkpoint: initialCheckpoint, runtime: { name: deferredTaskRuntimeName } }
            : {}),
        };
        let snapshot;
        if (options?.admission) {
          if (!storage.admit) {
            return yield* Effect.fail({
              reason: 'task_admission_unavailable',
              message: 'Task storage does not support atomic admission.',
            });
          }
          const admitted = yield* storage.admit(createInput, options.admission);
          if (!admitted.created) {
            return {
              ...toTaskRunRef(admitted.source),
              admission:
                admitted.source.error?.code === 'task_effect_outcome_ambiguous'
                  ? 'reconciliation-required'
                  : admitted.source.status === 'completed'
                    ? 'already-completed'
                    : 'reused',
            };
          }
          snapshot = admitted.source;
        } else {
          snapshot = yield* storage.create(createInput);
        }
        yield* taskRuns.publish(snapshot);
        const startedRef: TaskRunRef = {
          ...toTaskRunRef(snapshot),
          ...(options?.admission ? { admission: 'created' } : {}),
        };
        if (deferExplicitExecution) return startedRef;
        const source = yield* storage.loadSource(ref);
        const context = createTaskContext(task, source);
        const operationContext = createTaskOperationContext(source);
        const executionDefinition = task.execution;
        if (executionDefinition) {
          const background = Effect.gen(function* () {
            const state = yield* Effect.sync(() => executionDefinition.initial(parsedInput));
            if (!isTaskExecutionState(state)) {
              return yield* Effect.fail(
                invalidTaskDefinitionFailure(
                  task.id,
                  'Explicit execution initial state must be a JSON-safe object with a step.',
                  {},
                ),
              );
            }
            const checkpoint = { version: 1 as const, state: cloneJson(state) };
            yield* update(ref, { status: 'running', startedAt: now(), checkpoint });
            launchExplicitExecution(ref, task, { ...source, checkpoint }, operationContext);
          }).pipe(
            Effect.catchAllCause(cause => {
              const error = taskFailureFromCause(cause);
              return update(ref, {
                status: 'failed',
                completedAt: now(),
                checkpoint: undefined,
                error: { code: error.reason, message: error.message },
              });
            }),
          );

          void Effect.runPromise(background).catch(error => onBackgroundError?.(error));
          return startedRef;
        }
        const background = traceExecution(
          source,
          Effect.gen(function* () {
            yield* Effect.sync(() => restoreCommittedMutations(source));
            yield* update(ref, {
              status: 'running',
              startedAt: now(),
            });
            const result = yield* task.run(parsedInput, context);
            const parsedResult = yield* validateTaskOutput(task, result);
            const executionMetadata = yield* Effect.sync(captureExecutionMetadata);
            yield* update(ref, {
              status: 'completed',
              completedAt: now(),
              result: parsedResult,
              ...(executionMetadata ? { executionMetadata } : {}),
            });
            if (executionMetadata?.committedMutations) {
              yield* Effect.sync(() =>
                deliverCommittedMutationsToCurrentRuntime({
                  id:
                    executionMetadata.mutationCommitId ??
                    createCommittedMutationCommit(executionMetadata.committedMutations).id,
                  mutations: executionMetadata.committedMutations,
                }),
              );
            }
          }),
        ).pipe(
          Effect.catchAllCause(cause => {
            const error = taskFailureFromCause(cause);
            return Effect.sync(captureExecutionMetadata).pipe(
              Effect.flatMap(executionMetadata =>
                update(ref, {
                  status: 'failed',
                  completedAt: now(),
                  ...(executionMetadata ? { executionMetadata } : {}),
                  error: {
                    code: error.reason,
                    message: error.message,
                  },
                }),
              ),
            );
          }),
        );

        const run = () => Effect.runPromise(background).catch(error => onBackgroundError?.(error));
        if (operationContext) operationRuntimeContextStorage.run(operationContext, run);
        else void run();
        return startedRef;
      }),
    getSnapshot: ref =>
      Effect.gen(function* () {
        const source = yield* storage.loadSource(ref);
        recoverExplicitExecution(source);
        recoverEventWait(source);
        const snapshot = yield* storage.getSnapshot(ref);
        const projected = withPendingInteraction(snapshot);
        yield* taskRuns.publish(projected);
        return projected;
      }),
    listRecent: limit => storage.listRecent(limit),
    cancelEventWait: ref =>
      Effect.gen(function* () {
        const source = yield* storage.loadSource(ref);
        const wait = source.checkpoint?.eventWait;
        if (!wait || source.status !== 'waiting') {
          return yield* Effect.fail({
            reason: 'task_event_wait_not_pending',
            message: 'Task run has no pending Event wait.',
            ...ref,
          });
        }
        const snapshot = yield* storage.cancelEvent(ref, wait.id, 'cancelled');
        if (!snapshot) {
          return yield* Effect.fail({
            reason: 'task_event_wait_not_pending',
            message: 'Task run has no pending Event wait.',
            ...ref,
          });
        }
        const controller = activeEventWaits.get(keyOf(ref));
        controller?.abort();
        if (events?.runtime.durableDelivery) {
          yield* Effect.promise(() =>
            events.runtime.durableDelivery!.cancel(taskEventWaitSubscriptionId(ref, wait.id)),
          );
        }
        yield* taskRuns.publish(snapshot);
        return snapshot;
      }),
    respondToInteraction: (
      ref,
      response: TaskInteractionResponse,
      context: TaskInteractionResponseContext,
    ) =>
      Effect.gen(function* () {
        const source = yield* storage.loadSource(ref);
        if (
          source.trigger.actor?.kind !== context.actor.kind ||
          source.trigger.actor.id !== context.actor.id
        ) {
          return yield* Effect.fail(taskInteractionAccessDeniedFailure(ref));
        }

        const key = keyOf(ref);
        const checkpoint = source.checkpoint;
        if (checkpoint?.response?.interactionId === response.interactionId) {
          recoverExplicitExecution(source);
          const snapshot = yield* storage.getSnapshot(ref);
          yield* taskRuns.publish(snapshot);
          return snapshot;
        }
        if (checkpoint?.interaction) {
          if (checkpoint.interaction.id !== response.interactionId) {
            return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
          }
          yield* validateTaskInteractionResponse(ref, checkpoint.interaction, response);

          const task = taskDefinitions.get(ref.taskId);
          if (!task?.execution) {
            return yield* Effect.fail(
              invalidTaskDefinitionFailure(
                ref.taskId,
                'The explicit Task definition is not registered in this runtime.',
                {},
              ),
            );
          }
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
          if (!snapshot) {
            const latest = yield* storage.loadSource(ref);
            recoverExplicitExecution(latest);
            return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
          }
          yield* taskRuns.publish(snapshot);
          launchExplicitExecution(
            ref,
            task,
            { ...source, status: 'running', checkpoint: nextCheckpoint },
            createTaskOperationContext(source),
          );
          return snapshot;
        }
        const pending = pendingInteractions.get(key);

        if (!pending) {
          return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
        }

        if (pending.interaction.id !== response.interactionId) {
          return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
        }

        const resolution = pending.resolve(response);
        if (!resolution.success) {
          return yield* Effect.fail(
            invalidTaskInteractionResponseFailure(ref, response.interactionId),
          );
        }

        pendingInteractions.delete(key);
        const snapshot = yield* update(ref, { status: 'running' }).pipe(
          Effect.tapError(() => Effect.sync(() => pendingInteractions.set(key, pending))),
        );
        pending.resume(resolution.value);
        return snapshot;
      }),
    observe: ref =>
      Stream.unwrap(
        Effect.gen(function* () {
          const source = yield* storage.loadSource(ref);
          if (source.runtime?.name === deferredTaskRuntimeName && storage.observeSnapshots) {
            return storage.observeSnapshots(ref);
          }
          recoverExplicitExecution(source);
          recoverEventWait(source);
          const snapshot = withPendingInteraction(yield* storage.getSnapshot(ref));
          yield* taskRuns.publish(snapshot);
          return taskRuns.observe(ref);
        }),
      ),
  };
};

export const createInProcessTaskExecutor = (
  options: InProcessTaskExecutorOptions = {},
): TaskExecutor => ({
  createRuntime: (storage, host) =>
    createInProcessTaskRuntime({
      ...options,
      ...host,
      storage,
    }),
});
