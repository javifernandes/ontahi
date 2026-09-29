import { Effect, Option, Stream } from 'effect';

import type { GraphCommandRequest, GraphReadRequest } from '../../data-graph/index.js';
import type { JsonValue } from '../../value/json.js';
import type {
  ModelCommandRequest,
  ModelCommandResult,
  TaskRunIdentity,
  TaskRunRef,
  TaskSnapshot,
  TaskTrigger,
} from '../contracts.js';
import type { OperationInvokeRequest } from '../operation-invocation.js';

import {
  type ModelCommandCanonicalRequest,
  type ModelCommandRuntime,
  type PreparedModelCommandRuntime,
} from './model-command.js';
import type { ModelGraphReadResult } from './model-graph-read.js';
import {
  defineTask,
  defineTaskExecution,
  defineTaskExecutionStep,
  toTaskFailure,
  type TaskDefinition,
  type TaskFailure,
  type TaskStartOptions,
} from './tasks.js';

type ModelCommandTaskResult = ModelCommandResult<
  GraphReadRequest | GraphCommandRequest | OperationInvokeRequest,
  ModelGraphReadResult
>;

type ModelCommandTaskState =
  | { readonly step: 'interpret' }
  | {
      readonly step: 'choose';
      readonly prompt: string;
      readonly options: ReadonlyArray<{
        readonly id: string;
        readonly label: string;
        readonly request: ModelCommandCanonicalRequest;
      }>;
    }
  | {
      readonly step: 'review';
      readonly request: ModelCommandCanonicalRequest;
      readonly validation?: 'choice-option';
    }
  | {
      readonly step: 'execute';
      readonly request: ModelCommandCanonicalRequest;
      readonly validation?: 'choice-option';
    };

export type ModelCommandApprovalPresentation = {
  prompt: string;
  summary: string;
};

export type CreateModelCommandTaskOptions = {
  id?: string;
  runtime: PreparedModelCommandRuntime;
  approval?: (
    request: ModelCommandCanonicalRequest,
    input: ModelCommandRequest,
  ) => ModelCommandApprovalPresentation | undefined;
  rejectedMessage?: (input: ModelCommandRequest) => string;
};

export type ModelCommandTaskHost = {
  register<TInput, TResult>(task: TaskDefinition<TInput, TResult>): void;
  start<TInput, TResult>(
    task: TaskDefinition<TInput, TResult>,
    input: TInput,
    options?: TaskStartOptions,
  ): Effect.Effect<TaskRunRef, TaskFailure>;
  observe(ref: TaskRunIdentity): Stream.Stream<TaskSnapshot, TaskFailure>;
};

export type CreateTaskBackedModelCommandRuntimeOptions = CreateModelCommandTaskOptions & {
  tasks: ModelCommandTaskHost;
  trigger?: (request: ModelCommandRequest) => TaskTrigger;
};

const modelEffect = <TValue>(run: () => Promise<TValue>) =>
  Effect.tryPromise({ try: run, catch: toTaskFailure });

/** Builds one durable model-command execution without making the model protocol own continuation.
 * Interpretation may checkpoint a choice; approval is an explicit host policy. */
export const createModelCommandTask = ({
  id = 'ontahi.model-command',
  runtime,
  approval,
  rejectedMessage = () => 'The proposed action was not approved.',
}: CreateModelCommandTaskOptions): TaskDefinition<ModelCommandRequest, ModelCommandTaskResult> => {
  const execution = defineTaskExecution<
    ModelCommandRequest,
    ModelCommandTaskState,
    ModelCommandTaskResult
  >({
    initial: () => ({ step: 'interpret' }),
    steps: {
      interpret: defineTaskExecutionStep({
        run: ({ input, state }) => {
          if (state.step !== 'interpret') return Effect.dieMessage('Invalid model command state.');
          return modelEffect(async () => {
            const prepared = await runtime.prepare(input, new AbortController().signal);
            if (prepared.status === 'choice') {
              return {
                kind: 'continue' as const,
                state: {
                  step: 'choose' as const,
                  prompt: prepared.prompt,
                  options: prepared.options,
                },
              };
            }
            if (prepared.status !== 'proposed') {
              return { kind: 'complete' as const, result: prepared };
            }
            if (prepared.request.kind === 'graph-read' || !approval?.(prepared.request, input)) {
              const result = await runtime.execute(
                input,
                prepared.request,
                new AbortController().signal,
              );
              return { kind: 'complete' as const, result };
            }
            return {
              kind: 'continue' as const,
              state: { step: 'review' as const, request: prepared.request },
            };
          });
        },
      }),
      choose: defineTaskExecutionStep({
        run: ({ input, state, response }) => {
          if (state.step !== 'choose') return Effect.dieMessage('Invalid model command state.');
          if (!response) {
            return Effect.succeed({
              kind: 'interaction' as const,
              state,
              interaction: {
                id: 'choose-model-command',
                prompt: state.prompt,
                options: state.options.map(option => ({
                  id: option.id,
                  label: option.label,
                  value: option.request as JsonValue,
                })),
              },
            });
          }
          if (!('optionId' in response)) return Effect.dieMessage('Invalid choice response.');
          const selected = state.options.find(option => option.id === response.optionId);
          if (!selected) return Effect.dieMessage('Unknown model command choice.');
          return Effect.succeed({
            kind: 'continue' as const,
            state: approval?.(selected.request, input)
              ? {
                  step: 'review' as const,
                  request: selected.request,
                  validation: 'choice-option' as const,
                }
              : {
                  step: 'execute' as const,
                  request: selected.request,
                  validation: 'choice-option' as const,
                },
          });
        },
      }),
      review: defineTaskExecutionStep({
        run: ({ input, state, response, context }) => {
          if (state.step !== 'review') return Effect.dieMessage('Invalid model command state.');
          if (!response) {
            const presentation = approval?.(state.request, input);
            if (!presentation)
              return Effect.succeed({
                kind: 'continue' as const,
                state: {
                  step: 'execute' as const,
                  request: state.request,
                  ...(state.validation ? { validation: state.validation } : {}),
                },
              });
            return Effect.succeed({
              kind: 'interaction' as const,
              state,
              interaction: {
                id: 'approve-model-command',
                prompt: presentation.prompt,
                proposal: {
                  id: `${context.runId}:model-command`,
                  summary: presentation.summary,
                  requests: [state.request as JsonValue],
                },
              },
            });
          }
          if (!('decision' in response)) return Effect.dieMessage('Invalid approval response.');
          return Effect.succeed(
            response.decision === 'approve'
              ? {
                  kind: 'continue' as const,
                  state: {
                    step: 'execute' as const,
                    request: state.request,
                    ...(state.validation ? { validation: state.validation } : {}),
                  },
                }
              : {
                  kind: 'complete' as const,
                  result: { status: 'unresolved' as const, message: rejectedMessage(input) },
                },
          );
        },
      }),
      execute: defineTaskExecutionStep({
        run: ({ input, state }) => {
          if (state.step !== 'execute') return Effect.dieMessage('Invalid model command state.');
          return modelEffect(async () => ({
            kind: 'complete' as const,
            result: await runtime.execute(
              input,
              state.request,
              new AbortController().signal,
              state.validation ? { kind: state.validation } : undefined,
            ),
          }));
        },
      }),
    },
  });

  return defineTask({
    id,
    execution,
    run: () => Effect.dieMessage('Model command Tasks require explicit execution.'),
  });
};

const isModelCommandTaskSettled = (snapshot: TaskSnapshot) =>
  snapshot.interaction !== undefined ||
  snapshot.status === 'completed' ||
  snapshot.status === 'failed' ||
  snapshot.status === 'cancelled';

/** Starts model interpretation as a durable Task and returns at its first interaction or result. */
export const createTaskBackedModelCommandRuntime = ({
  tasks,
  trigger = () => ({ cause: 'system', actor: { kind: 'system' } }),
  ...taskOptions
}: CreateTaskBackedModelCommandRuntimeOptions): ModelCommandRuntime => {
  const task = createModelCommandTask(taskOptions);
  tasks.register(task);

  return {
    submit: async (request, signal) => {
      const run = await Effect.runPromise(
        tasks.start(task, request, { trigger: trigger(request) }),
        { signal },
      );
      const settled = await Effect.runPromise(
        tasks.observe(run).pipe(Stream.filter(isModelCommandTaskSettled), Stream.runHead),
        { signal },
      );
      if (Option.isNone(settled)) {
        throw new Error('Model command observation ended before the Task produced a result.');
      }
      const snapshot = settled.value;
      if (snapshot.interaction) {
        return {
          status: 'pending',
          message: snapshot.interaction.prompt,
          run: { taskId: snapshot.taskId, runId: snapshot.runId },
          interaction: snapshot.interaction,
        };
      }
      if (snapshot.status === 'completed' && snapshot.result !== undefined) {
        return snapshot.result as ModelCommandTaskResult;
      }
      throw new Error(snapshot.error?.message ?? `Model command Task ${snapshot.status}.`);
    },
  };
};
