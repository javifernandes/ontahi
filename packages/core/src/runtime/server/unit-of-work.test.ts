import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createEntityRef } from '../../data-graph/index.js';

import { getRequiredUnitOfWork, runServerEffect, withChildUnitOfWork } from './index.js';

describe('server UnitOfWork', () => {
  it('coalesces concurrent resolution for equivalent normalized Refs', async () => {
    const load = vi.fn(async () => ({ title: 'Programming Book' }));
    const result = await runServerEffect(
      Effect.promise(async () => {
        const unitOfWork = getRequiredUnitOfWork();
        const first = unitOfWork.refs.resolve(
          createEntityRef('Book', { tenant: { id: 'bookops', region: 'ar' }, slug: 'progbook' }),
          { load },
        );
        const second = unitOfWork.refs.resolve(
          createEntityRef('Book', { slug: 'progbook', tenant: { region: 'ar', id: 'bookops' } }),
          { load },
        );

        expect(second).toBe(first);
        return Promise.all([first, second]);
      }),
      { scope: 'tests.unit-of-work.ref-resolution' },
    );

    expect(result[0]).toBe(result[1]);
    expect(load).toHaveBeenCalledOnce();
  });

  it('invalidates every cached representation of one Ref', async () => {
    const ref = createEntityRef('Book', { slug: 'progbook' });
    const summaryLoad = vi.fn(() => ({
      projection: 'summary',
      sequence: summaryLoad.mock.calls.length,
    }));
    const detailLoad = vi.fn(() => ({
      projection: 'detail',
      sequence: detailLoad.mock.calls.length,
    }));

    const result = await runServerEffect(
      Effect.sync(() => {
        const unitOfWork = getRequiredUnitOfWork();
        const firstSummary = unitOfWork.refs.resolve(ref, { key: 'summary', load: summaryLoad });
        const firstDetail = unitOfWork.refs.resolve(ref, { key: 'detail', load: detailLoad });
        unitOfWork.refs.invalidate(ref);
        const secondSummary = unitOfWork.refs.resolve(ref, { key: 'summary', load: summaryLoad });
        const secondDetail = unitOfWork.refs.resolve(ref, { key: 'detail', load: detailLoad });
        return { firstDetail, firstSummary, secondDetail, secondSummary };
      }),
      { scope: 'tests.unit-of-work.ref-invalidation' },
    );

    expect(result).toEqual({
      firstDetail: { projection: 'detail', sequence: 1 },
      firstSummary: { projection: 'summary', sequence: 1 },
      secondDetail: { projection: 'detail', sequence: 2 },
      secondSummary: { projection: 'summary', sequence: 2 },
    });
  });

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

  it('isolates Ref resolutions in a child and restores the parent store', async () => {
    const ref = createEntityRef('Book', { slug: 'progbook' });
    const result = await runServerEffect(
      Effect.gen(function* () {
        const parent = getRequiredUnitOfWork();
        const parentValue = parent.refs.resolve(ref, { load: () => ({ scope: 'parent' }) });
        const childValue = yield* withChildUnitOfWork(
          Effect.sync(() =>
            getRequiredUnitOfWork().refs.resolve(ref, { load: () => ({ scope: 'child' }) }),
          ),
        );
        const restoredValue = getRequiredUnitOfWork().refs.resolve(ref, {
          load: () => ({ scope: 'unexpected' }),
        });

        return { childValue, parentValue, restoredValue };
      }),
      { scope: 'tests.unit-of-work.ref-child' },
    );

    expect(result).toEqual({
      childValue: { scope: 'child' },
      parentValue: { scope: 'parent' },
      restoredValue: { scope: 'parent' },
    });
    expect(result.restoredValue).toBe(result.parentValue);
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
