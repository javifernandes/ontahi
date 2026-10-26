import { describe, expect, it } from 'vitest';

import type { ModelResourceUsage } from '../contracts.js';

import {
  getCurrentResourceEvidenceDisclosure,
  projectCurrentResourceEvidence,
  projectResourceEvidence,
  recordModelResourceUsage,
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

  it('inherits a parent policy when a nested scope does not specify one', () => {
    withResourceEvidence('summary', () =>
      withResourceEvidence(undefined, () =>
        expect(getCurrentResourceEvidenceDisclosure()).toBe('summary'),
      ),
    );
  });
});
