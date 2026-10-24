import { isRecord } from '../../../../value/object.js';
import type { ModelResourceUsage } from '../../../contracts.js';

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

export const cloudModelUsage = ({
  provider,
  model,
  usage,
  durationMs,
}: {
  provider: string;
  model: string;
  usage: unknown;
  durationMs: number;
}): ModelResourceUsage => {
  const source = isRecord(usage) ? usage : {};
  const inputDetails = isRecord(source.input_tokens_details)
    ? source.input_tokens_details
    : isRecord(source.prompt_tokens_details)
      ? source.prompt_tokens_details
      : {};
  const outputDetails = isRecord(source.output_tokens_details)
    ? source.output_tokens_details
    : isRecord(source.completion_tokens_details)
      ? source.completion_tokens_details
      : {};
  const reportedInputTokens = finiteNumber(source.input_tokens ?? source.prompt_tokens);
  const cachedInputTokens = finiteNumber(
    inputDetails.cached_tokens ?? source.cache_read_input_tokens,
  );
  const cacheWriteInputTokens = finiteNumber(source.cache_creation_input_tokens);
  const inputTokens =
    reportedInputTokens === undefined
      ? undefined
      : reportedInputTokens +
        (source.cache_read_input_tokens === undefined ? 0 : (cachedInputTokens ?? 0)) +
        (cacheWriteInputTokens ?? 0);
  const outputTokens = finiteNumber(source.output_tokens ?? source.completion_tokens);
  return {
    provider,
    model,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(finiteNumber(source.total_tokens) === undefined
      ? inputTokens === undefined || outputTokens === undefined
        ? {}
        : { totalTokens: inputTokens + outputTokens }
      : { totalTokens: finiteNumber(source.total_tokens) }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(cacheWriteInputTokens === undefined ? {} : { cacheWriteInputTokens }),
    ...(finiteNumber(outputDetails.reasoning_tokens) === undefined
      ? {}
      : { reasoningTokens: finiteNumber(outputDetails.reasoning_tokens) }),
    durationMs,
  };
};

export const ollamaModelUsage = ({
  model,
  envelope,
  durationMs,
}: {
  model: string;
  envelope: Record<string, unknown>;
  durationMs: number;
}): ModelResourceUsage => {
  const inputTokens = finiteNumber(envelope.prompt_eval_count);
  const outputTokens = finiteNumber(envelope.eval_count);
  return {
    provider: 'ollama',
    model,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(inputTokens === undefined || outputTokens === undefined
      ? {}
      : { totalTokens: inputTokens + outputTokens }),
    ...(finiteNumber(envelope.prompt_eval_cached_count) === undefined
      ? {}
      : { cachedInputTokens: finiteNumber(envelope.prompt_eval_cached_count) }),
    durationMs,
  };
};
