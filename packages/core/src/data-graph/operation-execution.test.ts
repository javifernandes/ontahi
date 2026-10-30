import { describe, expect, it } from 'vitest';

import {
  assertValidDomainOperationExecution,
  deriveOperationExecutionRequirements,
  resolveOperationExecutionAffordance,
} from './operation-execution.js';
import { defineDomainOperationMetadata, resolveDomainOperations } from './operations.js';

const atomicOperation = {
  authority: 'server',
  exposure: 'bridge',
  execution: { atomicity: 'required' },
} as const;

describe('Operation execution planning', () => {
  it('rejects immediate retry semantics on a durable Operation', () => {
    expect(() =>
      resolveDomainOperations('Document', {
        analyze: defineDomainOperationMetadata({
          durable: { runtime: 'in-process' },
          execution: { retry: { maxAttempts: 2, when: ['temporary'] } },
        }),
      }),
    ).toThrow('cannot declare immediate execution.retry');
  });

  it('accepts a bounded retry policy over explicit failure reasons', () => {
    expect(() =>
      assertValidDomainOperationExecution('Document.analyze', {
        retry: {
          maxAttempts: 3,
          when: ['dependency_unavailable', 'implementation_output_invalid'],
          backoff: { kind: 'exponential', initialMs: 100, multiplier: 2, maxMs: 1_000 },
        },
      }),
    ).not.toThrow();
  });

  it.each([
    [{ maxAttempts: 0, when: ['temporary'] }, 'maxAttempts'],
    [{ maxAttempts: 2, when: [] }, 'when'],
    [{ maxAttempts: 2, when: [''] }, 'when'],
    [{ maxAttempts: 2, when: ['temporary', 'temporary'] }, 'duplicate'],
    [{ maxAttempts: 2, when: ['temporary'], backoff: { kind: 'fixed', delayMs: -1 } }, 'delayMs'],
    [
      {
        maxAttempts: 2,
        when: ['temporary'],
        backoff: { kind: 'exponential', initialMs: -1, maxMs: 10 },
      },
      'initialMs',
    ],
    [
      {
        maxAttempts: 2,
        when: ['temporary'],
        backoff: { kind: 'exponential', initialMs: 1, multiplier: 0, maxMs: 10 },
      },
      'multiplier',
    ],
    [
      {
        maxAttempts: 2,
        when: ['temporary'],
        backoff: { kind: 'exponential', initialMs: 1, maxMs: -1 },
      },
      'maxMs',
    ],
  ] as const)('rejects an invalid retry policy: %j', (retry, message) => {
    expect(() =>
      assertValidDomainOperationExecution('Document.analyze', {
        retry,
      }),
    ).toThrow(message);
  });

  it('derives the atomic Data Graph capability from static Operation metadata', () => {
    expect(deriveOperationExecutionRequirements(atomicOperation)).toEqual([
      { kind: 'data-graph.atomicity' },
    ]);
  });

  it('prefers a compatible local binding without projecting topology into the Operation', () => {
    expect(
      resolveOperationExecutionAffordance(atomicOperation, {
        local: {
          runtime: 'postgres',
          capabilities: [{ kind: 'data-graph.atomicity' }],
        },
        bridge: { authority: 'server', bridge: 'fetch' },
      }),
    ).toEqual({ status: 'local', runtime: 'postgres' });
    expect(atomicOperation).toEqual({
      authority: 'server',
      exposure: 'bridge',
      execution: { atomicity: 'required' },
    });
  });

  it('routes through a configured bridge when the local runtime cannot satisfy atomicity', () => {
    expect(
      resolveOperationExecutionAffordance(atomicOperation, {
        local: { runtime: 'browser', capabilities: [] },
        bridge: { authority: 'server', bridge: 'fetch' },
      }),
    ).toEqual({ status: 'bridge', authority: 'server', bridge: 'fetch' });
  });

  it('reports the derived missing capability when no valid route exists', () => {
    expect(
      resolveOperationExecutionAffordance(
        { ...atomicOperation, exposure: 'server-only' },
        { local: { runtime: 'supabase', capabilities: [] } },
      ),
    ).toEqual({
      status: 'unavailable',
      missingCapabilities: [{ kind: 'data-graph.atomicity' }],
    });
  });
});
