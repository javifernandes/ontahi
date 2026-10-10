import { describe, expect, it } from 'vitest';

import type { CommittedMutationSet, GraphReadRequest } from '../../data-graph/index.js';

import {
  createActiveGraphObservationRegistry,
  MAX_GRAPH_OBSERVATION_REFRESH_CAUSES,
} from './active-graph-observations.js';

const read = (id: string): GraphReadRequest => ({
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'Todo',
    expression: { kind: 'predicate', operator: 'eq', fieldName: 'id', value: id },
  },
  orderBy: [],
});

const changed = (id: string): CommittedMutationSet => ({
  precision: 'intensional',
  mutations: [
    {
      provenance: 'declared',
      effect: {
        kind: 'selection-change',
        selection: {
          kind: 'selection',
          entityName: 'Todo',
          expression: { kind: 'predicate', operator: 'eq', fieldName: 'id', value: id },
        },
      },
    },
  ],
});

let commitSequence = 0;
const commit = (mutations: CommittedMutationSet) => ({
  id: `commit-${(commitSequence += 1)}`,
  mutations,
});

describe('active Graph observation registry', () => {
  it('signals possible overlaps and skips provably disjoint mutations', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();
    let settled = false;
    const next = subscription.wait(controller.signal).then(value => {
      settled = true;
      return value;
    });

    registry.publish(commit(changed('todo-2')));
    await Promise.resolve();
    expect(settled).toBe(false);

    registry.publish({ id: 'matching-commit', mutations: changed('todo-1') });
    await expect(next).resolves.toEqual({
      kind: 'committed-mutations',
      commitIds: ['matching-commit'],
      overflow: false,
    });
  });

  it('coalesces repeated commits into one pending refresh', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();

    registry.publish({ id: 'commit-1', mutations: changed('todo-1') });
    registry.publish({ id: 'commit-2', mutations: changed('todo-1') });
    await expect(subscription.wait(controller.signal)).resolves.toEqual({
      kind: 'committed-mutations',
      commitIds: ['commit-1', 'commit-2'],
      overflow: false,
    });

    const next = subscription.wait(controller.signal);
    subscription.close();
    await expect(next).resolves.toBeUndefined();
  });

  it('releases a pending wait when the observation aborts', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();
    const next = subscription.wait(controller.signal);

    controller.abort();

    await expect(next).resolves.toBeUndefined();
    subscription.close();
    registry.publish(commit(changed('todo-1')));
    await expect(subscription.wait(new AbortController().signal)).resolves.toBeUndefined();
  });

  it('bounds coalesced causal identities and reports overflow', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();
    for (let index = 0; index < MAX_GRAPH_OBSERVATION_REFRESH_CAUSES + 3; index += 1) {
      registry.publish({ id: `bulk-${index}`, mutations: changed('todo-1') });
    }

    await expect(subscription.wait(controller.signal)).resolves.toEqual({
      kind: 'committed-mutations',
      commitIds: Array.from(
        { length: MAX_GRAPH_OBSERVATION_REFRESH_CAUSES },
        (_, index) => `bulk-${index}`,
      ),
      overflow: true,
    });
    subscription.close();
  });

  it('rejects concurrent waits from one observation consumer', () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();

    void subscription.wait(controller.signal);

    expect(() => subscription.wait(controller.signal)).toThrow(
      'An active Graph observation cannot wait concurrently.',
    );
    subscription.close();
  });
});
