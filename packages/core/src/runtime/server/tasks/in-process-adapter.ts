import { Cause, Effect, Option, Stream } from 'effect';

import { cloneJson, isJsonValue } from '../../../value/json.js';
import type { OperationRuntimeContext } from '../context-types.js';
import { getOperationRuntimeContext, operationRuntimeContextStorage } from '../context.js';

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
  TaskChoiceInteractionRequest,
  TaskApprovalInteractionRequest,
  TaskApprovalDecision,
  TaskFailure,
  TaskExecutionState,
  TaskInteractionResponse,
  TaskInteractionResponseContext,
  TaskPendingApprovalInteraction,
  TaskPendingChoiceInteraction,
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

type ExplicitExecution = {
  task: TaskDefinition<any, any>;
  input: unknown;
  state: TaskExecutionState;
  context: TaskContext;
  operationContext?: OperationRuntimeContext;
  interaction?: TaskPendingInteraction;
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
const explicitExecutionsByStorage = new WeakMap<object, Map<string, ExplicitExecution>>();

const getPendingInteractions = (storage: object) => {
  const existing = pendingInteractionsByStorage.get(storage);
  if (existing) return existing;

  const interactions = new Map<string, PendingInteraction>();
  pendingInteractionsByStorage.set(storage, interactions);
  return interactions;
};

const getExplicitExecutions = (storage: object) => {
  const existing = explicitExecutionsByStorage.get(storage);
  if (existing) return existing;

  const executions = new Map<string, ExplicitExecution>();
  explicitExecutionsByStorage.set(storage, executions);
  return executions;
};

const isTaskExecutionState = (value: unknown): value is TaskExecutionState =>
  isJsonValue(value) &&
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'step' in value &&
  typeof value.step === 'string' &&
  value.step.length > 0;

const validateChoiceRequest = <TValue>(
  ref: TaskRunIdentity,
  request: TaskChoiceInteractionRequest<TValue>,
): Effect.Effect<void, TaskFailure> => {
  if (request.prompt.trim().length === 0) {
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Choice prompt cannot be empty.'));
  }

  if (request.options.length === 0) {
    return Effect.fail(
      invalidTaskInteractionFailure(ref, 'Choice interaction requires at least one option.'),
    );
  }

  if (request.id !== undefined && (request.id.trim().length === 0 || request.id.length > 512)) {
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Choice interaction ID is invalid.'));
  }

  const optionIds = request.options.map(option => option.id);
  if (
    optionIds.some(id => id.trim().length === 0 || id.length > 512) ||
    new Set(optionIds).size !== optionIds.length
  ) {
    return Effect.fail(
      invalidTaskInteractionFailure(ref, 'Choice option IDs must be non-empty and unique.'),
    );
  }

  return Effect.void;
};

const validateApprovalRequest = (
  ref: TaskRunIdentity,
  request: TaskApprovalInteractionRequest,
): Effect.Effect<void, TaskFailure> => {
  if (request.prompt.trim().length === 0) {
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Approval prompt cannot be empty.'));
  }
  if (request.id !== undefined && (request.id.trim().length === 0 || request.id.length > 512)) {
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Approval interaction ID is invalid.'));
  }
  if (request.proposal.id.trim().length === 0 || request.proposal.id.length > 512) {
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Approval proposal ID is invalid.'));
  }
  if (request.proposal.summary.trim().length === 0) {
    return Effect.fail(
      invalidTaskInteractionFailure(ref, 'Approval proposal summary is required.'),
    );
  }
  if (
    request.proposal.requests.length === 0 ||
    request.proposal.requests.some(candidate => !isJsonValue(candidate))
  ) {
    return Effect.fail(
      invalidTaskInteractionFailure(
        ref,
        'Approval proposal requires at least one JSON-safe request.',
      ),
    );
  }

  return Effect.void;
};

const toTaskRunRef = (snapshot: TaskSnapshot): TaskRunRef => ({
  taskId: snapshot.taskId,
  runId: snapshot.runId,
  status: snapshot.status,
  ...(snapshot.subject ? { subject: snapshot.subject } : {}),
});

export const createInProcessTaskRuntime = ({
  storage,
  sleep = milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
  createRunId: createConfiguredRunId = createRunId,
  onBackgroundError,
}: InProcessTaskRuntimeOptions): TaskRuntime => {
  const taskRuns = getInMemoryTaskRunProjection(storage);
  const pendingInteractions = getPendingInteractions(storage);
  const explicitExecutions = getExplicitExecutions(storage);
  const keyOf = (ref: TaskRunIdentity) => `${ref.taskId}:${ref.runId}`;
  const withPendingInteraction = (snapshot: TaskSnapshot): TaskSnapshot => {
    const key = keyOf(snapshot);
    const pending =
      pendingInteractions.get(key)?.interaction ?? explicitExecutions.get(key)?.interaction;

    return pending ? { ...snapshot, interaction: pending } : snapshot;
  };
  const publishCurrentSnapshot = (ref: TaskRunIdentity) =>
    storage.update(ref, {}).pipe(Effect.map(withPendingInteraction), Effect.tap(taskRuns.publish));
  const update = (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    storage.update(ref, patch).pipe(Effect.tap(taskRuns.publish));
  const waitForInteraction = <TValue>(
    ref: TaskRunIdentity,
    pending: PendingInteraction,
  ): Effect.Effect<TValue, TaskFailure> => {
    const key = keyOf(ref);
    pendingInteractions.set(key, pending);

    return publishCurrentSnapshot(ref).pipe(
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
    request: TaskChoiceInteractionRequest<unknown> | TaskApprovalInteractionRequest,
  ): Effect.Effect<TaskPendingInteraction, TaskFailure> =>
    'options' in request
      ? validateChoiceRequest(ref, request).pipe(
          Effect.as({
            id: request.id ?? createInteractionId(),
            kind: 'choice',
            prompt: request.prompt,
            options: request.options.map(({ id, label }) => ({ id, label })),
            createdAt: now(),
          } satisfies TaskPendingChoiceInteraction),
        )
      : validateApprovalRequest(ref, request).pipe(
          Effect.as({
            id: request.id ?? createInteractionId(),
            kind: 'approval',
            prompt: request.prompt,
            proposal: cloneJson(request.proposal),
            createdAt: now(),
          } satisfies TaskPendingApprovalInteraction),
        );
  const launchExplicitExecution = (
    ref: TaskRunIdentity,
    execution: ExplicitExecution,
    response?: TaskInteractionResponse,
  ) => {
    const background = Effect.gen(function* () {
      let currentResponse = response;

      while (true) {
        const definition = execution.task.execution;
        if (!definition) {
          return yield* Effect.fail(
            invalidTaskDefinitionFailure(
              execution.task.id,
              'Explicit execution definition is missing.',
              {},
            ),
          );
        }
        const step = definition.steps[execution.state.step];
        if (!step) {
          return yield* Effect.fail(
            missingTaskStepFailure(execution.task.id, execution.state.step),
          );
        }
        const transition = yield* step.run({
          input: execution.input,
          state: execution.state,
          ...(currentResponse ? { response: currentResponse } : {}),
          context: execution.context,
        });
        currentResponse = undefined;

        if (transition.kind === 'complete') {
          const result = yield* validateTaskOutput(execution.task, transition.result);
          explicitExecutions.delete(keyOf(ref));
          yield* update(ref, {
            status: 'completed',
            completedAt: now(),
            result,
          });
          return;
        }
        if (!isTaskExecutionState(transition.state)) {
          return yield* Effect.fail(
            invalidTaskDefinitionFailure(
              execution.task.id,
              'Explicit execution step returned an invalid JSON-safe state.',
              { stepId: execution.state.step },
            ),
          );
        }

        execution.state = transition.state;
        if (transition.kind === 'continue') continue;

        execution.interaction = yield* materializeExecutionInteraction(ref, transition.interaction);
        yield* publishCurrentSnapshot(ref);
        return;
      }
    }).pipe(
      Effect.catchAllCause(cause => {
        explicitExecutions.delete(keyOf(ref));
        const error = taskFailureFromCause(cause);
        return update(ref, {
          status: 'failed',
          completedAt: now(),
          error: {
            code: error.reason,
            message: error.message,
          },
        });
      }),
    );

    const run = () => Effect.runPromise(background).catch(error => onBackgroundError?.(error));
    if (execution.operationContext)
      operationRuntimeContextStorage.run(execution.operationContext, run);
    else void run();
  };

  return {
    start: (task, input, options) =>
      Effect.gen(function* () {
        const parsedInput = yield* validateTaskInput(task, input);
        const runId = options?.runId ?? createConfiguredRunId();
        const ref = { taskId: task.id, runId };
        const snapshot = yield* storage.create({
          ...ref,
          input: parsedInput,
          trigger: options?.trigger,
          subject: options?.subject,
        });
        yield* taskRuns.publish(snapshot);
        const source = yield* storage.loadSource(ref);
        const context: TaskContext = {
          ...ref,
          ...(source.subject ? { subject: source.subject } : {}),
          trigger: source.trigger,
          createdAt: source.createdAt,
          interact: {
            choice: request =>
              Effect.gen(function* () {
                yield* validateChoiceRequest(ref, request);
                const key = keyOf(ref);
                if (pendingInteractions.has(key)) {
                  return yield* Effect.fail(
                    invalidTaskInteractionFailure(
                      ref,
                      'Task run already has a pending interaction.',
                    ),
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
            approval: request =>
              Effect.gen(function* () {
                yield* validateApprovalRequest(ref, request);
                const key = keyOf(ref);
                if (pendingInteractions.has(key)) {
                  return yield* Effect.fail(
                    invalidTaskInteractionFailure(
                      ref,
                      'Task run already has a pending interaction.',
                    ),
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
        if (task.execution) {
          const background = Effect.gen(function* () {
            yield* update(ref, {
              status: 'running',
              startedAt: now(),
            });
            const state = yield* Effect.sync(() => task.execution!.initial(parsedInput));
            if (!isTaskExecutionState(state)) {
              return yield* Effect.fail(
                invalidTaskDefinitionFailure(
                  task.id,
                  'Explicit execution initial state must be a JSON-safe object with a step.',
                  {},
                ),
              );
            }
            const operationContext = getOperationRuntimeContext();
            const execution: ExplicitExecution = {
              task,
              input: parsedInput,
              state,
              context,
              ...(operationContext ? { operationContext } : {}),
            };
            explicitExecutions.set(keyOf(ref), execution);
            launchExplicitExecution(ref, execution);
          }).pipe(
            Effect.catchAllCause(cause => {
              explicitExecutions.delete(keyOf(ref));
              const error = taskFailureFromCause(cause);
              return update(ref, {
                status: 'failed',
                completedAt: now(),
                error: { code: error.reason, message: error.message },
              });
            }),
          );

          void Effect.runPromise(background).catch(error => onBackgroundError?.(error));
          return toTaskRunRef(snapshot);
        }
        const background = Effect.gen(function* () {
          yield* update(ref, {
            status: 'running',
            startedAt: now(),
          });
          const result = yield* task.run(parsedInput, context);
          const parsedResult = yield* validateTaskOutput(task, result);
          yield* update(ref, {
            status: 'completed',
            completedAt: now(),
            result: parsedResult,
          });
        }).pipe(
          Effect.catchAllCause(cause => {
            const error = taskFailureFromCause(cause);
            return update(ref, {
              status: 'failed',
              completedAt: now(),
              error: {
                code: error.reason,
                message: error.message,
              },
            });
          }),
        );

        void Effect.runPromise(background).catch(error => onBackgroundError?.(error));
        return toTaskRunRef(snapshot);
      }),
    getSnapshot: ref =>
      storage
        .getSnapshot(ref)
        .pipe(Effect.map(withPendingInteraction), Effect.tap(taskRuns.publish)),
    listRecent: limit => storage.listRecent(limit),
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
        const explicit = explicitExecutions.get(key);
        if (explicit?.interaction) {
          if (explicit.interaction.id !== response.interactionId) {
            return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
          }
          const valid =
            explicit.interaction.kind === 'choice'
              ? 'optionId' in response &&
                explicit.interaction.options.some(option => option.id === response.optionId)
              : 'decision' in response;
          if (!valid) {
            return yield* Effect.fail(
              invalidTaskInteractionResponseFailure(ref, response.interactionId),
            );
          }

          const interaction = explicit.interaction;
          delete explicit.interaction;
          const snapshot = yield* publishCurrentSnapshot(ref).pipe(
            Effect.tapError(() => Effect.sync(() => Object.assign(explicit, { interaction }))),
          );
          launchExplicitExecution(ref, explicit, response);
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
        const snapshot = yield* publishCurrentSnapshot(ref).pipe(
          Effect.tapError(() => Effect.sync(() => pendingInteractions.set(key, pending))),
        );
        pending.resume(resolution.value);
        return snapshot;
      }),
    observe: ref =>
      Stream.unwrap(
        storage
          .getSnapshot(ref)
          .pipe(
            Effect.map(withPendingInteraction),
            Effect.tap(taskRuns.publish),
            Effect.as(taskRuns.observe(ref)),
          ),
      ),
  };
};

export const createInProcessTaskExecutor = (
  options: InProcessTaskExecutorOptions = {},
): TaskExecutor => ({
  createRuntime: storage =>
    createInProcessTaskRuntime({
      ...options,
      storage,
    }),
});
