import { describe, expect, it } from 'vitest';

import { cloudModelUsage, ollamaModelUsage } from './usage.js';

describe('model provider usage normalization', () => {
  it('returns provider identity and duration when cloud usage is unavailable', () => {
    expect(
      cloudModelUsage({ provider: 'openai', model: 'gpt-test', usage: null, durationMs: 3 }),
    ).toEqual({ provider: 'openai', model: 'gpt-test', durationMs: 3 });
  });

  it('normalizes legacy cloud aliases and derives totals', () => {
    expect(
      cloudModelUsage({
        provider: 'anthropic',
        model: 'claude-test',
        durationMs: 7,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          prompt_tokens_details: { cached_tokens: 2 },
          completion_tokens_details: { reasoning_tokens: 1 },
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 3,
        },
      }),
    ).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      inputTokens: 15,
      outputTokens: 4,
      totalTokens: 19,
      cachedInputTokens: 2,
      cacheWriteInputTokens: 3,
      reasoningTokens: 1,
      durationMs: 7,
    });
  });

  it('omits invalid and incomplete cloud measurements', () => {
    expect(
      cloudModelUsage({
        provider: 'deepseek',
        model: 'deepseek-test',
        durationMs: 5,
        usage: {
          input_tokens: -1,
          output_tokens: Number.NaN,
          total_tokens: Number.POSITIVE_INFINITY,
          input_tokens_details: 'invalid',
          output_tokens_details: { reasoning_tokens: -2 },
        },
      }),
    ).toEqual({ provider: 'deepseek', model: 'deepseek-test', durationMs: 5 });
  });

  it('normalizes complete and partial Ollama measurements', () => {
    expect(
      ollamaModelUsage({
        model: 'llama-test',
        envelope: { prompt_eval_count: 8, eval_count: 3, prompt_eval_cached_count: 5 },
        durationMs: 11,
      }),
    ).toEqual({
      provider: 'ollama',
      model: 'llama-test',
      inputTokens: 8,
      outputTokens: 3,
      totalTokens: 11,
      cachedInputTokens: 5,
      durationMs: 11,
    });
    expect(
      ollamaModelUsage({
        model: 'llama-test',
        envelope: { prompt_eval_count: 8 },
        durationMs: 2,
      }),
    ).toEqual({
      provider: 'ollama',
      model: 'llama-test',
      inputTokens: 8,
      durationMs: 2,
    });
  });
});
