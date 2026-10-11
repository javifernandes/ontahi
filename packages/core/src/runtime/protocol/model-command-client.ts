import type {
  ModelCommandRequest,
  ModelCommandResult,
  TaskInteractionResponse,
  TaskRunIdentity,
  TaskSnapshot,
} from '../contracts.js';

import {
  isDurableOperationProtocolError,
  parseDurableOperationProtocolResponse,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
} from './durable-operation.js';
import {
  parseModelCommandProtocolResponse,
  toModelCommandProtocolRequest,
  type ModelCommandCanonicalRequest,
  type ModelCommandReadResponse,
} from './model-command.js';
import { createRuntimeProtocolExecutionExchange, type RuntimeTransport } from './transport.js';

export type RuntimeModelCommandResult = ModelCommandResult<
  ModelCommandCanonicalRequest,
  ModelCommandReadResponse
>;

export type RuntimeModelCommandOutcome =
  | { readonly ok: true; readonly value: RuntimeModelCommandResult }
  | { readonly ok: false; readonly message: string };

export type RuntimeModelCommandClient = {
  submit(request: ModelCommandRequest): Promise<RuntimeModelCommandOutcome>;
  respond(
    run: TaskRunIdentity,
    response: TaskInteractionResponse,
  ): Promise<RuntimeModelCommandOutcome>;
};

const modelResultFromSnapshot = (snapshot: TaskSnapshot): RuntimeModelCommandOutcome => {
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

const inspectExecution = async (runtimeTransport: RuntimeTransport, run: TaskRunIdentity) => {
  try {
    const inspected = await createRuntimeProtocolExecutionExchange({
      transport: runtimeTransport,
    })({
      family: 'durable.operation',
      body: toDurableOperationProtocolRequest(run),
    });
    const parsed = parseDurableOperationProtocolResponse(inspected.body);
    return parsed.success && !isDurableOperationProtocolError(parsed.response);
  } catch {
    return false;
  }
};

const settleStartedOperation = async (
  runtimeTransport: RuntimeTransport,
  outcome: Extract<RuntimeModelCommandResult, { status: 'started' }>,
): Promise<RuntimeModelCommandOutcome> => {
  if (!runtimeTransport.durableOperation)
    return { ok: false, message: 'The configured Runtime Transport cannot observe this run.' };
  try {
    for await (const snapshot of runtimeTransport.durableOperation.observe(outcome.run)) {
      if (snapshot.interaction) return modelResultFromSnapshot(snapshot);
      if (snapshot.status === 'completed') {
        await inspectExecution(runtimeTransport, outcome.run);
        return {
          ok: true,
          value: { status: 'executed', message: outcome.message, request: outcome.request },
        };
      }
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

const settleModelCommandSnapshot = async (
  runtimeTransport: RuntimeTransport,
  snapshot: TaskSnapshot,
  executionWasInspected = false,
): Promise<RuntimeModelCommandOutcome> => {
  const result = modelResultFromSnapshot(snapshot);
  if (!result.ok) return result;
  if (result.value.status === 'started')
    return settleStartedOperation(runtimeTransport, result.value);
  if (result.value.status === 'executed' && !executionWasInspected)
    await inspectExecution(runtimeTransport, snapshot);
  return result;
};

export const createRuntimeModelCommandClient = (
  runtimeTransport: RuntimeTransport,
): RuntimeModelCommandClient => {
  const executionExchange = createRuntimeProtocolExecutionExchange({ transport: runtimeTransport });
  const pendingStartedOperations = new Map<
    string,
    Extract<RuntimeModelCommandResult, { status: 'started' }>
  >();
  const runKey = (run: TaskRunIdentity) => `${run.taskId}\0${run.runId}`;
  const retainPendingStartedOperation = (
    outcome: Extract<RuntimeModelCommandResult, { status: 'started' }>,
    result: RuntimeModelCommandOutcome,
  ) => {
    const key = runKey(outcome.run);
    if (result.ok && result.value.status === 'pending') pendingStartedOperations.set(key, outcome);
    else pendingStartedOperations.delete(key);
    return result;
  };

  return {
    submit: async request => {
      const execution = await executionExchange({
        family: 'model.command',
        body: toModelCommandProtocolRequest(request),
      });
      const parsed = parseModelCommandProtocolResponse(execution.body);
      if (!parsed.success) throw new Error(parsed.error.error.message);
      if (parsed.response.kind === 'protocol-error')
        return { ok: false, message: parsed.response.error.message };
      if (parsed.response.result.status !== 'started')
        return { ok: true, value: parsed.response.result };
      return retainPendingStartedOperation(
        parsed.response.result,
        await settleStartedOperation(runtimeTransport, parsed.response.result),
      );
    },
    respond: async (run, response) => {
      const execution = await executionExchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, response),
      });
      const parsed = parseDurableOperationProtocolResponse(execution.body);
      if (!parsed.success) throw new Error(parsed.error.error.message);
      if (isDurableOperationProtocolError(parsed.response))
        return { ok: false, message: parsed.response.error.message };
      const initial = parsed.response.snapshot;
      const startedOperation = pendingStartedOperations.get(runKey(run));
      if (startedOperation) {
        let result: RuntimeModelCommandOutcome;
        if (initial.interaction) result = modelResultFromSnapshot(initial);
        else if (initial.status === 'completed') {
          if (execution.metadata === undefined) await inspectExecution(runtimeTransport, run);
          result = {
            ok: true,
            value: {
              status: 'executed',
              message: startedOperation.message,
              request: startedOperation.request,
            },
          };
        } else if (initial.status === 'failed' || initial.status === 'cancelled')
          result = {
            ok: false,
            message: initial.error?.message ?? `Operation ${initial.status}.`,
          };
        else result = await settleStartedOperation(runtimeTransport, startedOperation);
        return retainPendingStartedOperation(startedOperation, result);
      }
      if (initial.interaction || ['completed', 'failed', 'cancelled'].includes(initial.status))
        return settleModelCommandSnapshot(
          runtimeTransport,
          initial,
          execution.metadata !== undefined,
        );
      if (!runtimeTransport.durableOperation)
        return { ok: false, message: 'The configured Runtime Transport cannot observe this run.' };
      for await (const snapshot of runtimeTransport.durableOperation.observe(run)) {
        if (snapshot.interaction || ['completed', 'failed', 'cancelled'].includes(snapshot.status))
          return settleModelCommandSnapshot(runtimeTransport, snapshot);
      }
      return { ok: false, message: 'The model command observation ended before completion.' };
    },
  };
};
