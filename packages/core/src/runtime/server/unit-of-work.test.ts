import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { getRequiredUnitOfWork, runServerEffect, withChildUnitOfWork } from './index.js';

describe('server UnitOfWork', () => {
  it('does not share UnitOfWork identity across separate top-level operations', async () => {
    const readUnitOfWork = () =>
      runServerEffect(
        Effect.sync(() => getRequiredUnitOfWork()),
        {
          scope: 'tests.unit-of-work.top-level',
        },
      );

    const first = await readUnitOfWork();
    const second = await readUnitOfWork();

    expect(second).not.toBe(first);
  });

  it('reuses one UnitOfWork across normally nested server operations', async () => {
    const result = await runServerEffect(
      Effect.gen(function* () {
        const outer = getRequiredUnitOfWork();
        const inner = yield* Effect.promise(() =>
          runServerEffect(
            Effect.sync(() => getRequiredUnitOfWork()),
            {
              scope: 'tests.unit-of-work.inner',
            },
          ),
        );

        return { outer, inner };
      }),
      { scope: 'tests.unit-of-work.outer' },
    );

    expect(result.inner).toBe(result.outer);
  });

  it('inherits resources in an isolated child without mutating its parent', async () => {
    const result = await runServerEffect(
      Effect.gen(function* () {
        const parent = getRequiredUnitOfWork();
        parent.resources.set('tenant', 'bookops');
        parent.resources.set('scoped-cache', { value: 'parent' });

        const child = yield* withChildUnitOfWork(
          Effect.sync(() => {
            const current = getRequiredUnitOfWork();
            const inherited = current.resources.get<string>('tenant');
            current.resources.set('local-only', true);
            return { current, inherited };
          }),
          { isolatedResources: ['scoped-cache'] },
        );

        return {
          parent,
          child,
          leaked: parent.resources.has('local-only'),
        };
      }),
      { scope: 'tests.unit-of-work.child' },
    );

    expect(result.child.current).not.toBe(result.parent);
    expect(result.child.inherited).toBe('bookops');
    expect(result.child.current.resources.has('scoped-cache')).toBe(false);
    expect(result.leaked).toBe(false);
  });

  it('isolates concurrent child resource overrides and restores the parent', async () => {
    const result = await runServerEffect(
      Effect.gen(function* () {
        const parent = getRequiredUnitOfWork();
        parent.resources.set('runtime', 'parent');

        const readChildRuntime = (runtime: string, delay: number) =>
          withChildUnitOfWork(
            Effect.sleep(delay).pipe(
              Effect.map(() => getRequiredUnitOfWork().resources.get<string>('runtime')),
            ),
            { resources: [['runtime', runtime]] },
          );

        const children = yield* Effect.all(
          [readChildRuntime('first', 10), readChildRuntime('second', 1)],
          { concurrency: 'unbounded' },
        );

        return {
          children,
          restored: getRequiredUnitOfWork().resources.get<string>('runtime'),
        };
      }),
      { scope: 'tests.unit-of-work.concurrent' },
    );

    expect(result).toEqual({
      children: ['first', 'second'],
      restored: 'parent',
    });
  });

  it('restores the parent after a typed failure or defect in the child', async () => {
    const result = await runServerEffect(
      Effect.gen(function* () {
        const parent = getRequiredUnitOfWork();
        const rejection = { code: 'rejected' } as const;
        const failed = yield* withChildUnitOfWork(Effect.fail(rejection)).pipe(Effect.either);
        const afterFailure = getRequiredUnitOfWork();
        const defect = yield* withChildUnitOfWork(Effect.die(new Error('unexpected defect'))).pipe(
          Effect.exit,
        );

        return {
          afterDefect: getRequiredUnitOfWork(),
          afterFailure,
          defect,
          failed,
          parent,
          rejection,
        };
      }),
      { scope: 'tests.unit-of-work.restoration' },
    );

    expect(result.failed._tag).toBe('Left');
    if (result.failed._tag === 'Left') expect(result.failed.left).toBe(result.rejection);
    expect(result.defect._tag).toBe('Failure');
    expect(result.afterFailure).toBe(result.parent);
    expect(result.afterDefect).toBe(result.parent);
  });
});
