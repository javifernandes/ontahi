import { describe, expect, it, vi } from 'vitest';

import { projectCurrentResourceEvidence, withResourceEvidence } from '../resource-evidence.js';
import {
  createSemanticExecutionContext,
  runWithSemanticExecutionContext,
  withSemanticExecutionActivity,
} from '../semantic-execution.js';

import { withServiceResourceAttempt } from './resource-attempt.js';
import { withServiceResourceLimits } from './resource-governance.js';

describe('service Resource attempt', () => {
  it('governs a paid HTTP service without exposing its static API key', async () => {
    const configuration = {
      endpoint: 'https://paid.example.test/suggestions',
      apiKey: 'secret-byok-value',
    };
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(configuration.endpoint);
      expect(init.headers).toEqual({ authorization: `Bearer ${configuration.apiKey}` });
      return { suggestion: 'Read the next chapter' };
    });

    const result = await runWithSemanticExecutionContext(
      createSemanticExecutionContext({ channel: 'web', surface: 'study-session' }),
      () =>
        withSemanticExecutionActivity({ kind: 'operation', id: 'Study.suggestNext' }, () =>
          withResourceEvidence('debug', () =>
            withServiceResourceLimits('paid-suggestions', { maxAttempts: 1 }, async () => {
              const value = await withServiceResourceAttempt(
                {
                  resourceId: 'paid-suggestions',
                  provider: 'fake-http',
                  action: 'suggest',
                },
                () =>
                  request(configuration.endpoint, {
                    headers: { authorization: `Bearer ${configuration.apiKey}` },
                  }),
              );
              return { value, evidence: projectCurrentResourceEvidence() };
            }),
          ),
        ),
    );

    expect(result.value).toEqual({ suggestion: 'Read the next chapter' });
    expect(request).toHaveBeenCalledOnce();
    expect(result.evidence).toMatchObject({
      visibility: 'debug',
      attempts: [
        {
          kind: 'service',
          resourceId: 'paid-suggestions',
          provider: 'fake-http',
          action: 'suggest',
          outcome: 'completed',
          activity: {
            owner: { kind: 'operation', id: 'Study.suggestNext' },
            origin: { channel: 'web', surface: 'study-session' },
            admission: { attempt: 1, maxAttempts: 1 },
          },
        },
      ],
    });
    expect(JSON.stringify(result.evidence)).not.toContain(configuration.apiKey);
    expect(JSON.stringify(result.evidence)).not.toContain(configuration.endpoint);
  });

  it('projects a provider-neutral summary and records failures', async () => {
    const evidence = await withResourceEvidence('summary', async () => {
      await expect(
        withServiceResourceAttempt({ resourceId: 'paid-suggestions' }, async () => {
          throw new Error('provider unavailable');
        }),
      ).rejects.toThrow('provider unavailable');
      return projectCurrentResourceEvidence();
    });

    expect(evidence).toMatchObject({
      visibility: 'summary',
      resources: [
        {
          kind: 'service',
          resourceId: 'paid-suggestions',
          attempts: 1,
          failedAttempts: 1,
        },
      ],
    });
  });

  it.each([
    [{ resourceId: '' }, 'resourceId'],
    [{ resourceId: 'valid', provider: '' }, 'provider'],
    [{ resourceId: 'valid', action: 'x'.repeat(257) }, 'action'],
  ])('rejects invalid evidence identity at registration: %j', async (options, name) => {
    await expect(withServiceResourceAttempt(options, async () => undefined)).rejects.toThrow(
      `${name} must contain between 1 and 256 characters.`,
    );
  });

  it('validates evidence identity before consuming the Resource attempt limit', async () => {
    await withServiceResourceLimits('paid-suggestions', { maxAttempts: 1 }, async () => {
      await expect(
        withServiceResourceAttempt(
          { resourceId: 'paid-suggestions', provider: '' },
          async () => undefined,
        ),
      ).rejects.toThrow('provider must contain between 1 and 256 characters.');

      await expect(
        withServiceResourceAttempt(
          { resourceId: 'paid-suggestions', provider: 'fake-http' },
          async admission => admission?.attempt,
        ),
      ).resolves.toBe(1);
    });
  });
});
