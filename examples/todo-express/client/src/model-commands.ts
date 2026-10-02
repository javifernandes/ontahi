import type {
  ModelCommandRequest,
  ModelCommandResult,
  TaskInteractionResponse,
  TaskRunIdentity,
  TaskSnapshot,
} from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  isDurableOperationProtocolError,
  parseDurableOperationProtocolResponse,
  parseModelCommandProtocolResponse,
  toDurableOperationInteractionResponseRequest,
  toModelCommandProtocolRequest,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';

export type ModelCommandSubmitResult =
  | { ok: true; value: ModelCommandResult }
  | { ok: false; message?: string };
export type ModelCommandSubmitter = (
  request: ModelCommandRequest,
) => Promise<ModelCommandSubmitResult>;
export type ModelCommandResponder = (
  run: TaskRunIdentity,
  response: TaskInteractionResponse,
) => Promise<ModelCommandSubmitResult>;

const modelResultFromSnapshot = (snapshot: TaskSnapshot): ModelCommandSubmitResult => {
  if (snapshot.interaction)
    return {
      ok: true,
      value: {
        status: 'pending',
        message: snapshot.interaction.prompt,
        run: { taskId: snapshot.taskId, runId: snapshot.runId },
        interaction: snapshot.interaction,
      },
    };
  if (snapshot.status === 'completed') {
    const parsed = parseModelCommandProtocolResponse({
      version: 1,
      kind: 'model-command-result',
      result: snapshot.result,
    });
    if (parsed.success && parsed.response.kind === 'model-command-result')
      return { ok: true, value: parsed.response.result };
  }
  return {
    ok: false,
    message: snapshot.error?.message ?? `Model command Task ${snapshot.status}.`,
  };
};

const settleStartedOperation = async (
  runtimeTransport: RuntimeTransport,
  outcome: Extract<ModelCommandResult, { status: 'started' }>,
): Promise<ModelCommandSubmitResult> => {
  if (!runtimeTransport.durableOperation)
    return { ok: false, message: 'The configured Runtime Transport cannot observe this run.' };
  try {
    for await (const snapshot of runtimeTransport.durableOperation.observe(outcome.run)) {
      if (snapshot.interaction)
        return {
          ok: false,
          message: 'The started Operation requires an interaction that command chat cannot resume.',
        };
      if (snapshot.status === 'completed')
        return {
          ok: true,
          value: { status: 'executed', message: outcome.message, request: outcome.request },
        };
      if (snapshot.status === 'failed' || snapshot.status === 'cancelled')
        return {
          ok: false,
          message: snapshot.error?.message ?? `Operation ${snapshot.status}.`,
        };
    }
  } catch {
    return {
      ok: false,
      message: 'The Operation started, but its completion could not be observed. Check the list.',
    };
  }
  return { ok: false, message: 'The Operation observation ended before completion.' };
};

export const createModelCommandSubmitter = (
  runtimeTransport: RuntimeTransport,
): ModelCommandSubmitter => {
  const exchange = createRuntimeProtocolExchange({ transport: runtimeTransport });
  return async request => {
    const parsed = parseModelCommandProtocolResponse(
      await exchange({ family: 'model.command', body: toModelCommandProtocolRequest(request) }),
    );
    if (!parsed.success) throw new Error(parsed.error.error.message);
    if (parsed.response.kind === 'protocol-error')
      return { ok: false, message: parsed.response.error.message };
    const outcome = parsed.response.result;
    return outcome.status === 'started'
      ? settleStartedOperation(runtimeTransport, outcome)
      : { ok: true, value: outcome };
  };
};

export const createModelCommandResponder = (
  runtimeTransport: RuntimeTransport,
): ModelCommandResponder => {
  const exchange = createRuntimeProtocolExchange({ transport: runtimeTransport });
  return async (run, response) => {
    const parsed = parseDurableOperationProtocolResponse(
      await exchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, response),
      }),
    );
    if (!parsed.success) throw new Error(parsed.error.error.message);
    if (isDurableOperationProtocolError(parsed.response))
      return { ok: false, message: parsed.response.error.message };
    const initial = parsed.response.snapshot;
    if (initial.interaction || ['completed', 'failed', 'cancelled'].includes(initial.status))
      return modelResultFromSnapshot(initial);
    if (!runtimeTransport.durableOperation)
      return { ok: false, message: 'The configured Runtime Transport cannot observe this run.' };
    for await (const snapshot of runtimeTransport.durableOperation.observe(run)) {
      if (snapshot.interaction || ['completed', 'failed', 'cancelled'].includes(snapshot.status))
        return modelResultFromSnapshot(snapshot);
    }
    return { ok: false, message: 'The model command observation ended before completion.' };
  };
};

export const submitModelCommand = async (
  request: ModelCommandRequest,
): Promise<ModelCommandSubmitResult> => {
  const response = await fetch('/model/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (!result || typeof result.ok !== 'boolean') throw new Error('Invalid model command response.');
  if (!result.ok)
    return typeof result.message === 'string'
      ? { ok: false, message: result.message }
      : { ok: false };
  const parsed = parseModelCommandProtocolResponse({
    version: 1,
    kind: 'model-command-result',
    result: result.value,
  });
  if (!parsed.success || parsed.response.kind !== 'model-command-result')
    throw new Error('Invalid model command response.');
  return { ok: true, value: parsed.response.result };
};
