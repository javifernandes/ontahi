import { afterEach, expect, it, vi } from 'vitest';

import { configureServerRuntime, resetServerRuntimeForTests } from '../config.js';

import { withModelResourceAttempt } from './resource-attempt.js';
import { withModelResourceLimits } from './resource-governance.js';

afterEach(resetServerRuntimeForTests);

it('reports bounded model attempt outcomes without exposing provider exceptions to the span', async () => {
  const span = {};
  const markFailure = vi.fn();
  const markSuccess = vi.fn();
  configureServerRuntime({
    telemetry: {
      withSpan: async (name, options, run) => {
        expect(name).toBe('ontahi.runtime.model.attempt');
        expect(options).toEqual({});
        const callback = Promise.resolve().then(() => run(span));
        await expect(callback).resolves.toBeDefined();
        return callback;
      },
      getRuntimeAttributes: () => ({}),
      markFailure,
      markSuccess,
    },
  });

  const error = new Error('private provider response');
  const provider = vi.fn().mockResolvedValueOnce('response').mockRejectedValueOnce(error);

  await withModelResourceLimits({ maxAttempts: 2 }, async () => {
    await expect(withModelResourceAttempt(undefined, provider)).resolves.toBe('response');
    await expect(withModelResourceAttempt(undefined, provider)).rejects.toBe(error);
    await expect(withModelResourceAttempt(undefined, provider)).rejects.toMatchObject({
      code: 'model_resource_exhausted',
    });
  });

  expect(provider).toHaveBeenCalledTimes(2);
  expect(markSuccess.mock.calls).toEqual([[span]]);
  expect(markFailure.mock.calls).toEqual([
    [span, 'model_attempt_failed'],
    [span, 'model_admission_rejected'],
  ]);
});
