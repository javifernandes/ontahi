import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  isDataGraphTransactionCapability,
  type DataGraphTransactionCapability,
} from './transaction.js';

describe('Data Graph transaction capability', () => {
  it('distinguishes runtimes that can establish a shared transaction boundary', () => {
    const transaction = vi.fn();

    expect(isDataGraphTransactionCapability({ transaction })).toBe(true);
    expect(isDataGraphTransactionCapability({ runCommand: vi.fn() })).toBe(false);
    expect(isDataGraphTransactionCapability(null)).toBe(false);
  });

  it('preserves the transaction result and callback failure types', () => {
    type TransactionRuntime = { run: () => Effect.Effect<number> };
    type ProviderError = { code: 'provider_failed' };
    type DomainError = { code: 'domain_rejected' };

    const capability: DataGraphTransactionCapability<TransactionRuntime, ProviderError> = {
      transaction: work => work({ run: () => Effect.succeed(1) }),
    };
    const result = capability.transaction(
      (_runtime): Effect.Effect<string, DomainError> => Effect.succeed('committed'),
    );

    expectTypeOf(result).toEqualTypeOf<Effect.Effect<string, ProviderError | DomainError>>();
  });
});
