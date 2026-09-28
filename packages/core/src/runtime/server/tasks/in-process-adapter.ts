import { Deferred, Effect, Stream } from 'effect';

import {
  invalidTaskInteractionFailure,
  invalidTaskInteractionResponseFailure,
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
  TaskChoiceInteractionRequest,
  TaskFailure,
  TaskInteractionResponse,
  TaskInteractionResponseContext,
  TaskPendingChoiceInteraction,
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

type PendingChoiceInteraction = {
  interaction: TaskPendingChoiceInteraction;
  values: ReadonlyMap<string, unknown>;
  deferred: Deferred.Deferred<unknown, TaskFailure>;
};

const pendingInteractionsByStorage = new WeakMap<object, Map<string, PendingChoiceInteraction>>();

const getPendingInteractions = (storage: object) => {
  const existing = pendingInteractionsByStorage.get(storage);
  if (existing) return existing;

  const interactions = new Map<string, PendingChoiceInteraction>();
  pendingInteractionsByStorage.set(storage, interactions);
  return interactions;
};

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
  const keyOf = (ref: TaskRunIdentity) => `${ref.taskId}:${ref.runId}`;
  const withPendingInteraction = (snapshot: TaskSnapshot): TaskSnapshot => {
    const pending = pendingInteractions.get(keyOf(snapshot));

    return pending ? { ...snapshot, interaction: pending.interaction } : snapshot;
  };
  const publishCurrentSnapshot = (ref: TaskRunIdentity) =>
    storage.update(ref, {}).pipe(Effect.map(withPendingInteraction), Effect.tap(taskRuns.publish));
  const update = (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    storage.update(ref, patch).pipe(Effect.tap(taskRuns.publish));

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

                const deferred = yield* Deferred.make<unknown, TaskFailure>();
                const interaction = {
                  id: request.id ?? createInteractionId(),
                  kind: 'choice',
                  prompt: request.prompt,
                  options: request.options.map(({ id, label }) => ({ id, label })),
                  createdAt: now(),
                } satisfies TaskPendingChoiceInteraction;
                const pending = {
                  interaction,
                  values: new Map(request.options.map(option => [option.id, option.value])),
                  deferred,
                } satisfies PendingChoiceInteraction;

                pendingInteractions.set(key, pending);
                yield* publishCurrentSnapshot(ref).pipe(
                  Effect.tapError(() => Effect.sync(() => pendingInteractions.delete(key))),
                );

                return (yield* Deferred.await(deferred).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      if (pendingInteractions.get(key) === pending) {
                        pendingInteractions.delete(key);
                      }
                    }),
                  ),
                )) as (typeof request.options)[number]['value'];
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
          Effect.catchAll(error =>
            update(ref, {
              status: 'failed',
              completedAt: now(),
              error: {
                code: error.reason,
                message: error.message,
              },
            }),
          ),
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
        const pending = pendingInteractions.get(key);

        if (!pending) {
          return yield* Effect.fail(taskInteractionNotPendingFailure(ref));
        }

        if (pending.interaction.id !== response.interactionId) {
          return yield* Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
        }

        if (!pending.values.has(response.optionId)) {
          return yield* Effect.fail(
            invalidTaskInteractionResponseFailure(ref, response.interactionId, response.optionId),
          );
        }

        pendingInteractions.delete(key);
        const snapshot = yield* publishCurrentSnapshot(ref).pipe(
          Effect.tapError(() => Effect.sync(() => pendingInteractions.set(key, pending))),
        );
        yield* Deferred.succeed(pending.deferred, pending.values.get(response.optionId));
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
