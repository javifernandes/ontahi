import { describe, expect, it } from 'vitest';

import type { ModelResourceUsage } from '../contracts.js';

import {
  getCurrentResourceEvidenceDisclosure,
  projectCurrentResourceEvidence,
  projectResourceEvidence,
  recordModelResourceAttempt,
  recordModelResourceUsage,
  recordServiceResourceAttempt,
  withResourceEvidence,
} from './resource-evidence.js';

const usage: ModelResourceUsage = {
  provider: 'openai',
  model: 'gpt-test',
  totalTokens: 12,
  durationMs: 25,
};

describe('resource evidence', () => {
  it('defaults to no capture and exposes no evidence outside an invocation', () => {
    recordModelResourceUsage(usage);
    expect(getCurrentResourceEvidenceDisclosure()).toBe('none');
    expect(projectCurrentResourceEvidence()).toBeUndefined();
  });

  it('projects debug attempts and safe aggregate summaries', () => {
    expect(projectResourceEvidence([usage], 'debug')).toEqual({
      visibility: 'debug',
      model: { attempts: [usage] },
    });
    expect(projectResourceEvidence([usage], 'summary')).toEqual({
      visibility: 'summary',
      model: { attempts: 1, totalTokens: 12, durationMs: 25 },
    });
    expect(projectResourceEvidence([usage], 'none')).toBeUndefined();
    expect(projectResourceEvidence([], 'debug')).toBeUndefined();
  });

  it('does not claim incomplete aggregate metrics', () => {
    expect(
      projectResourceEvidence([usage, { provider: 'anthropic', model: 'claude-test' }], 'summary'),
    ).toEqual({ visibility: 'summary', model: { attempts: 2 } });
  });

  it('counts admitted attempts even when a failed attempt reports no usage', () => {
    withResourceEvidence('summary', () => {
      const failed = recordModelResourceAttempt({
        attemptId: 'attempt-1',
        correlationId: 'correlation-1',
        admission: { attempt: 1, maxAttempts: 3 },
      });
      failed('failed');
      const completed = recordModelResourceAttempt({
        attemptId: 'attempt-2',
        correlationId: 'correlation-1',
        admission: { attempt: 2, maxAttempts: 3 },
      });
      recordModelResourceUsage({
        ...usage,
        activity: {
          attemptId: 'attempt-2',
          correlationId: 'correlation-1',
          admission: { attempt: 2, maxAttempts: 3 },
        },
      });
      completed('completed');

      expect(projectCurrentResourceEvidence()).toEqual({
        visibility: 'summary',
        model: { attempts: 2, reportedAttempts: 1, failedAttempts: 1 },
      });
    });
  });

  it('keeps per-attempt outcomes in debug evidence', () => {
    withResourceEvidence('debug', () => {
      const complete = recordModelResourceAttempt({
        attemptId: 'attempt-1',
        correlationId: 'correlation-1',
      });
      complete('failed');

      expect(projectCurrentResourceEvidence()).toEqual({
        visibility: 'debug',
        model: {
          attempts: [],
          attemptOutcomes: [
            {
              outcome: 'failed',
              usageReported: false,
              activity: { attemptId: 'attempt-1', correlationId: 'correlation-1' },
            },
          ],
        },
      });
    });
  });

  it('shares captured attempts across nested scopes while preventing wider disclosure', () => {
    withResourceEvidence('debug', () => {
      recordModelResourceUsage(usage);
      withResourceEvidence('summary', () => {
        expect(getCurrentResourceEvidenceDisclosure()).toBe('summary');
        recordModelResourceUsage({ provider: 'anthropic', model: 'claude-test' });
        expect(projectCurrentResourceEvidence()).toEqual({
          visibility: 'summary',
          model: { attempts: 2 },
        });
      });
      withResourceEvidence('debug', () => {
        expect(projectCurrentResourceEvidence()).toEqual({
          visibility: 'debug',
          model: {
            attempts: [usage, { provider: 'anthropic', model: 'claude-test' }],
          },
        });
      });
    });
  });

  it('withholds outer aggregates when a nested scope suppresses an attempt', () => {
    withResourceEvidence('summary', () => {
      recordModelResourceUsage(usage);
      withResourceEvidence('none', () => {
        const complete = recordModelResourceAttempt({
          attemptId: 'suppressed-attempt',
          correlationId: 'correlation-1',
        });
        recordModelResourceUsage({ provider: 'anthropic', model: 'claude-test', totalTokens: 8 });
        complete('completed');
      });

      expect(projectCurrentResourceEvidence()).toEqual({
        visibility: 'summary',
        model: { attempts: 1 },
      });
    });
  });

  it('inherits a parent policy when a nested scope does not specify one', () => {
    withResourceEvidence('summary', () =>
      withResourceEvidence(undefined, () =>
        expect(getCurrentResourceEvidenceDisclosure()).toBe('summary'),
      ),
    );
  });

  it('keeps the parent disclosure when a nested scope requests wider disclosure', () => {
    withResourceEvidence('summary', () =>
      withResourceEvidence('debug', () => {
        expect(getCurrentResourceEvidenceDisclosure()).toBe('summary');
        recordModelResourceUsage(usage);
        expect(projectCurrentResourceEvidence()).toEqual({
          visibility: 'summary',
          model: { attempts: 1, totalTokens: 12, durationMs: 25 },
        });
      }),
    );
  });

  it('combines supplied and invocation-captured usage in one projection', () => {
    withResourceEvidence('debug', () => {
      recordModelResourceUsage({ provider: 'anthropic', model: 'claude-test' });
      expect(projectCurrentResourceEvidence([usage])).toEqual({
        visibility: 'debug',
        model: {
          attempts: [usage, { provider: 'anthropic', model: 'claude-test' }],
        },
      });
    });
  });

  it('projects service attempts independently from model-specific usage', () => {
    withResourceEvidence('summary', () => {
      const complete = recordServiceResourceAttempt({ resourceId: 'paid-search' });
      complete('completed', 12);
      const fail = recordServiceResourceAttempt({ resourceId: 'paid-search' });
      fail('failed', 8);
      const other = recordServiceResourceAttempt({ resourceId: 'shipping' });
      other('completed', 5);

      expect(projectCurrentResourceEvidence()).toEqual({
        visibility: 'summary',
        services: [
          { resourceId: 'paid-search', attempts: 2, failedAttempts: 1, durationMs: 20 },
          { resourceId: 'shipping', attempts: 1, durationMs: 5 },
        ],
      });
    });
  });

  it('does not expose or overstate service evidence suppressed by a nested scope', () => {
    withResourceEvidence('summary', () => {
      const visible = recordServiceResourceAttempt({ resourceId: 'paid-search' });
      visible('completed', 12);
      withResourceEvidence('none', () => {
        const hidden = recordServiceResourceAttempt({ resourceId: 'paid-search' });
        hidden('completed', 8);
      });

      expect(projectCurrentResourceEvidence()).toEqual({
        visibility: 'summary',
        services: [{ resourceId: 'paid-search', attempts: 1 }],
      });
    });
  });
});
