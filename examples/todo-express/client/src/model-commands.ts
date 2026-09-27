import type { ModelCommandRequest, ModelCommandResult } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  parseModelCommandProtocolResponse,
  toModelCommandProtocolRequest,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';

export type ModelCommandSubmitResult =
  | { ok: true; value: ModelCommandResult }
  | { ok: false; message?: string };
export type ModelCommandSubmitter = (
  request: ModelCommandRequest,
) => Promise<ModelCommandSubmitResult>;

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
    return { ok: true, value: parsed.response.result };
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
