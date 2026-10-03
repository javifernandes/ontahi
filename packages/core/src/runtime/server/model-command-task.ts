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

import { getCurrentInvocationContext, withInvocationContext } from './invocation-context.js';
import {
  type ModelCommandCanonicalRequest,
  type ModelCommandRuntime,
  type PreparedModelCommandRuntime,
} from './model-command.js';
import type { ModelGraphReadResult } from './model-graph-read.js';
import { ModelInterpretationError } from './model-interpretation.js';
import type { ModelOperationApplicationChoice } from './model-operation-application.js';
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
      readonly step: 'choose-application';
      readonly choice: ModelOperationApplicationChoice;
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

const principalFromTaskTrigger = (trigger: TaskTrigger) => {
  const actor = trigger.actor;
  if ((actor?.kind !== 'user' && actor?.kind !== 'service') || !actor.id) return null;
  return {
    kind: actor.kind,
    subject: actor.id,
    ...(actor.issuer === undefined ? {} : { issuer: actor.issuer }),
  } as const;
};

const modelEffect = <TValue>(trigger: TaskTrigger, run: () => Promise<TValue>) =>
  Effect.tryPromise({
    try: () => withInvocationContext({ principal: principalFromTaskTrigger(trigger) }, run),
    catch: error =>
      error instanceof ModelInterpretationError
        ? {
            reason: `model_interpretation_failed:${error.code}`,
            message: error.message,
          }
        : toTaskFailure(error),
  });

const modelInterpretationErrorFromTaskFailure = (failure: TaskSnapshot['error']) =>
  failure?.code.startsWith('model_interpretation_failed:')
    ? new ModelInterpretationError(
        failure.code.slice('model_interpretation_failed:'.length),
        failure.message,
      )
    : undefined;

/** Builds one durable model-command execution without making the model protocol own continuation.
 * Interpretation may checkpoint a choice; approval is an explicit host policy. */
export const createModelCommandTask = ({
  id = 'ontahi.model-command',
  runtime,
  approval,
  rejectedMessage = () => 'The proposed action was not approved.',
}: CreateModelCommandTaskOptions): TaskDefinition<ModelCommandRequest, ModelCommandTaskResult> => {
  const routePreparation = (
    prepared: Awaited<ReturnType<PreparedModelCommandRuntime['prepare']>>,
    input: ModelCommandRequest,
    validation?: 'choice-option',
  ) => {
    if (prepared.status === 'choice')
      return {
        kind: 'continue' as const,
        state: {
          step: 'choose' as const,
          prompt: prepared.prompt,
          options: prepared.options,
        },
      };
    if (prepared.status === 'application-choice')
      return {
        kind: 'continue' as const,
        state: { step: 'choose-application' as const, choice: prepared.choice },
      };
    if (prepared.status !== 'proposed') return { kind: 'complete' as const, result: prepared };
    return {
      kind: 'continue' as const,
      state:
        prepared.request.kind !== 'graph-read' && approval?.(prepared.request, input)
          ? {
              step: 'review' as const,
              request: prepared.request,
              ...(validation ? { validation } : {}),
            }
          : {
              step: 'execute' as const,
              request: prepared.request,
              ...(validation ? { validation } : {}),
            },
    };
  };
  const execution = defineTaskExecution<
    ModelCommandRequest,
    ModelCommandTaskState,
    ModelCommandTaskResult
  >({
    initial: () => ({ step: 'interpret' }),
    steps: {
      interpret: defineTaskExecutionStep({
        run: ({ input, state, context }) => {
          if (state.step !== 'interpret') return Effect.dieMessage('Invalid model command state.');
          return modelEffect(context.trigger, async () => {
            const prepared = await runtime.prepare(input, new AbortController().signal);
            return routePreparation(prepared, input);
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
            state:
              selected.request.kind !== 'graph-read' && approval?.(selected.request, input)
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
      'choose-application': defineTaskExecutionStep({
        run: ({ input, state, response, context }) => {
          if (state.step !== 'choose-application')
            return Effect.dieMessage('Invalid model command state.');
          if (!response) {
            return Effect.succeed({
              kind: 'interaction' as const,
              state,
              interaction: {
                id: `${state.choice.proposal.application.operationId}:${state.choice.holeId}`,
                prompt: state.choice.prompt,
                options: state.choice.options.map(option => ({
                  id: option.id,
                  label: option.label,
                  value: option.candidate.ref as JsonValue,
                })),
              },
            });
          }
          if (!('optionId' in response)) return Effect.dieMessage('Invalid choice response.');
          return modelEffect(context.trigger, async () => {
            const prepared = await runtime.continueApplication(
              input,
              state.choice,
              response.optionId,
              new AbortController().signal,
            );
            return routePreparation(prepared, input, 'choice-option');
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
        run: ({ input, state, context }) => {
          if (state.step !== 'execute') return Effect.dieMessage('Invalid model command state.');
          return modelEffect(context.trigger, async () => ({
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
  trigger = () => {
    const principal = getCurrentInvocationContext()?.principal;
    return {
      cause: principal ? ('user_request' as const) : ('system' as const),
      actor: principal
        ? {
            kind: principal.kind,
            id: principal.subject,
            ...(principal.issuer === undefined ? {} : { issuer: principal.issuer }),
          }
        : { kind: 'system' as const },
    };
  },
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
      if (snapshot.error) {
        const interpretationError = modelInterpretationErrorFromTaskFailure(snapshot.error);
        if (interpretationError) throw interpretationError;
      }
      throw new Error(snapshot.error?.message ?? `Model command Task ${snapshot.status}.`);
    },
  };
};
