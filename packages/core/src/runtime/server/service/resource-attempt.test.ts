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
      services: [
        {
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
      services: [{ resourceId: 'paid-suggestions', attempts: 1, failedAttempts: 1 }],
    });
  });
});
