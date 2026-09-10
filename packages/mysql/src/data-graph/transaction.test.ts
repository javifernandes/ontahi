import { Cause, Effect, Exit } from 'effect';
import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';

import { createMysqlTransactionCapability } from './transaction.js';

const harness = (failure: string) => {
  const statements: string[] = [];
  const destroy = vi.fn();
  const release = vi.fn();
  // The driver has a large connection surface; these are the methods the transaction owns.
  const connection = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql === failure) throw new Error(`${sql} failed`);
      return [[], []];
    },
    destroy,
    release,
  } as unknown as PoolConnection;
  return {
    statements,
    destroy,
    release,
    capability: createMysqlTransactionCapability(
      { getConnection: async () => connection },
      () => ({}),
    ),
  };
};

describe('MySQL transaction failure cleanup', () => {
  it.each(['SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'START TRANSACTION', 'COMMIT'])(
    'rolls back and releases after %s fails',
    async statement => {
      const { capability, statements, destroy, release } = harness(statement);
      const work = vi.fn(() => Effect.succeed('value'));
      const exit = await Effect.runPromiseExit(capability.transaction(work));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(statements.at(-1)).toBe('ROLLBACK');
      expect(work).toHaveBeenCalledTimes(statement === 'COMMIT' ? 1 : 0);
      expect(destroy).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it('destroys a connection when rollback fails and retains both failures', async () => {
    const { capability, destroy, release } = harness('ROLLBACK');
    const exit = await Effect.runPromiseExit(
      capability.transaction(() => Effect.fail('work failed')),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.pretty(exit.cause)).toContain('work failed');
      expect(Array.from(Cause.defects(exit.cause))).toMatchObject([
        { reason: 'execution_failed', cause: { message: 'ROLLBACK failed' } },
      ]);
    }
    expect(destroy).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back a synchronous defect in the work callback', async () => {
    const { capability, statements, release } = harness('');
    const exit = await Effect.runPromiseExit(
      capability.transaction(() => {
        throw new Error('defect');
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });
});
