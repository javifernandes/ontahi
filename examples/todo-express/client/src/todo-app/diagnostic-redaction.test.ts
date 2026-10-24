import { expect, it } from 'vitest';

import { redactTodoDiagnosticValue } from './diagnostic-redaction.js';

it('redacts credentials without hiding model usage measurements', () => {
  expect(
    redactTodoDiagnosticValue({
      authorization: 'Bearer secret',
      apiToken: 'secret',
      resourceUsage: {
        inputTokens: 120,
        outputTokens: 18,
        totalTokens: 138,
        cachedInputTokens: 40,
        reasoningTokens: 6,
      },
    }),
  ).toEqual({
    authorization: '[redacted]',
    apiToken: '[redacted]',
    resourceUsage: {
      inputTokens: 120,
      outputTokens: 18,
      totalTokens: 138,
      cachedInputTokens: 40,
      reasoningTokens: 6,
    },
  });
});
