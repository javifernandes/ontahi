import { Effect } from 'effect';

import { cloneJson, isJsonValue } from '../../../value/json.js';

import {
  invalidTaskInteractionFailure,
  invalidTaskInteractionResponseFailure,
  taskInteractionMismatchFailure,
} from './failures.js';
import type {
  TaskApprovalInteractionRequest,
  TaskChoiceInteractionRequest,
  TaskInputInteractionRequest,
  TaskExecutionInteractionRequest,
  TaskExecutionState,
  TaskFailure,
  TaskInteractionResponse,
  TaskPendingApprovalInteraction,
  TaskPendingChoiceInteraction,
  TaskPendingInputInteraction,
  TaskPendingInteraction,
  TaskRunIdentity,
} from './types.js';

let fallbackInteractionIdSequence = 0;

const createInteractionId = () =>
  globalThis.crypto?.randomUUID() ?? `interaction-${Date.now()}-${++fallbackInteractionIdSequence}`;

export const isTaskExecutionState = (value: unknown): value is TaskExecutionState =>
  isJsonValue(value) &&
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'step' in value &&
  typeof value.step === 'string' &&
  value.step.length > 0;

export const validateTaskChoiceInteractionRequest = <TValue>(
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

export const validateTaskApprovalInteractionRequest = (
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

export const validateTaskInputInteractionRequest = (
  ref: TaskRunIdentity,
  request: TaskInputInteractionRequest,
): Effect.Effect<void, TaskFailure> => {
  if (request.prompt.trim().length === 0)
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Input prompt cannot be empty.'));
  if (request.id !== undefined && (request.id.trim().length === 0 || request.id.length > 512))
    return Effect.fail(invalidTaskInteractionFailure(ref, 'Input interaction ID is invalid.'));
  return Effect.void;
};

export type MaterializeTaskInteractionOptions = {
  id?: string;
  now?: () => string;
  createId?: () => string;
};

export const materializeTaskExecutionInteraction = (
  ref: TaskRunIdentity,
  request: TaskExecutionInteractionRequest,
  options: MaterializeTaskInteractionOptions = {},
): Effect.Effect<TaskPendingInteraction, TaskFailure> => {
  const id = options.id ?? request.id ?? (options.createId ?? createInteractionId)();
  const createdAt = (options.now ?? (() => new Date().toISOString()))();

  return 'options' in request
    ? validateTaskChoiceInteractionRequest(ref, request).pipe(
        Effect.as({
          id,
          kind: 'choice',
          prompt: request.prompt,
          options: request.options.map(({ id: optionId, label }) => ({ id: optionId, label })),
          createdAt,
        } satisfies TaskPendingChoiceInteraction),
      )
    : 'input' in request
      ? validateTaskInputInteractionRequest(ref, request).pipe(
          Effect.as({
            id,
            kind: 'input',
            prompt: request.prompt,
            input: request.input,
            createdAt,
          } satisfies TaskPendingInputInteraction),
        )
      : validateTaskApprovalInteractionRequest(ref, request).pipe(
          Effect.map(
            () =>
              ({
                id,
                kind: 'approval',
                prompt: request.prompt,
                proposal: cloneJson(request.proposal),
                createdAt,
              }) satisfies TaskPendingApprovalInteraction,
          ),
        );
};

export const validateTaskInteractionResponse = (
  ref: TaskRunIdentity,
  interaction: TaskPendingInteraction,
  response: TaskInteractionResponse,
): Effect.Effect<void, TaskFailure> => {
  if (interaction.id !== response.interactionId) {
    return Effect.fail(taskInteractionMismatchFailure(ref, response.interactionId));
  }
  const valid =
    interaction.kind === 'choice'
      ? 'optionId' in response &&
        interaction.options.some(option => option.id === response.optionId)
      : interaction.kind === 'input'
        ? 'value' in response && typeof response.value === 'string'
        : 'decision' in response;
  return valid
    ? Effect.void
    : Effect.fail(invalidTaskInteractionResponseFailure(ref, response.interactionId));
};
