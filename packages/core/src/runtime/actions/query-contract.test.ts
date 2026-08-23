import { describe, expect, it } from 'vitest';

import {
  attachActionRuntime,
  createFeatureAllQueryTarget,
  getActionInvalidationQueryKeys,
  getActionQueryKey,
  getActionRuntime,
  resolveInvalidationTarget,
} from './query-contract.js';

describe('action query contract', () => {
  it('attaches non-enumerable runtime metadata to actions', async () => {
    const action = attachActionRuntime(async (input: { id: string }) => ({ data: input.id }), {
      actionName: 'getThing',
      feature: 'things',
      queryKeyPrefix: ['things', 'getThing'],
      requiresAuth: false,
    });

    expect(await action({ id: 'thing-1' })).toEqual({ data: 'thing-1' });
    expect(getActionRuntime(action)).toEqual(
      expect.objectContaining({
        actionName: 'getThing',
        feature: 'things',
      }),
    );
    expect(Object.keys(action)).not.toContain('__actionRuntime');
  });

  it('resolves query specs and invalidation targets', () => {
    const listAction = attachActionRuntime(async () => ({ data: [] }), {
      actionName: 'listThings',
      feature: 'things',
      queryKeyPrefix: ['things', 'listThings'],
      querySpec: ['things', 'list', (input: { ownerId: string }) => input.ownerId],
      requiresAuth: true,
    });
    const mutation = attachActionRuntime<{ ownerId: string }, { ownerId: string }>(
      async (input: { ownerId: string }) => ({ data: input }),
      {
        actionName: 'createThing',
        feature: 'things',
        getAffectedQueryKeys: ({ input }) => [
          ...resolveInvalidationTarget(listAction),
          ...resolveInvalidationTarget(createFeatureAllQueryTarget('things')),
          ['owners', input.ownerId],
        ],
        queryKeyPrefix: ['things', 'createThing'],
        requiresAuth: true,
      },
    );

    expect(getActionQueryKey(listAction, { ownerId: 'owner-1' })).toEqual([
      'things',
      'list',
      'owner-1',
    ]);
    expect(
      getActionInvalidationQueryKeys(mutation, {
        input: { ownerId: 'owner-1' },
        data: { ownerId: 'owner-1' },
      }),
    ).toEqual([['things', 'listThings'], ['things'], ['owners', 'owner-1']]);
  });

  it('rejects legacy getQueryKey callbacks that return non-array values', () => {
    const action = attachActionRuntime(async () => ({ data: [] }), {
      actionName: 'listThings',
      feature: 'things',
      getQueryKey: (() => 'invalid-key') as any,
      queryKeyPrefix: ['things', 'listThings'],
      requiresAuth: true,
    });

    expect(() => getActionQueryKey(action, undefined)).toThrow(
      'things.listThings getQueryKey must resolve to an array query key.',
    );
  });
});
