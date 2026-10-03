import {
  modelCommandProtocolError,
  modelCommandProtocolResult,
  type ModelCommandProtocolRequestV1,
  type ModelCommandProtocolResponse,
} from '../../../protocol/model-command.js';
import { ModelInterpretationError } from '../interpretation.js';

import type { ModelCommandRuntime } from './runtime.js';

const neverAbortedSignal = new AbortController().signal;

export const submitModelCommandProtocol = async (
  runtime: ModelCommandRuntime,
  request: ModelCommandProtocolRequestV1,
  signal: AbortSignal = neverAbortedSignal,
): Promise<ModelCommandProtocolResponse> => {
  try {
    const result = await runtime.submit(
      {
        text: request.text,
        ...(request.language === undefined ? {} : { language: request.language }),
        ...(request.context === undefined ? {} : { context: request.context }),
      },
      signal,
    );
    return modelCommandProtocolResult(result);
  } catch (error) {
    if (error instanceof ModelInterpretationError)
      return modelCommandProtocolError(error.code, error.message);
    throw error;
  }
};
