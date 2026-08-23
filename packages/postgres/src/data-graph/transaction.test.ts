import { Effect, Either } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createPostgresTransactionCapability } from './transaction.js';

const createHarness = () => {
  const statements: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (statement: string) => {
      statements.push(statement);
      return { rows: [], command: statement, rowCount: null, oid: 0, fields: [] };
    }),
    release,
  };
  const connect = vi.fn(async () => client);
  const runtime = { name: 'transaction-scoped' } as const;
  const capability = createPostgresTransactionCapability({ connect }, () => runtime);

  return { capability, connect, release, runtime, statements };
};

describe('PostgreSQL Data Graph transactions', () => {
  it('commits successful work and returns its value', async () => {
    const { capability, connect, release, runtime, statements } = createHarness();

    await expect(
      Effect.runPromise(
        capability.transaction(tx => {
          expect(tx).toBe(runtime);
          return Effect.succeed('committed');
        }),
      ),
    ).resolves.toBe('committed');

    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(connect).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back failed work without replacing its failure', async () => {
    const { capability, release, statements } = createHarness();
    const rejection = { code: 'domain_rejected' } as const;

    const result = await Effect.runPromise(
      capability.transaction(() => Effect.fail(rejection)).pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left).toBe(rejection);
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back defects and releases the checked-out connection', async () => {
    const { capability, release, statements } = createHarness();

    const exit = await Effect.runPromiseExit(
      capability.transaction(() => Effect.die(new Error('unexpected defect'))),
    );

    expect(exit._tag).toBe('Failure');
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });
});
