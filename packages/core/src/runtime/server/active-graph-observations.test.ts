import { describe, expect, it } from 'vitest';

import type { CommittedMutationSet, GraphReadRequest } from '../../data-graph/index.js';

import { createActiveGraphObservationRegistry } from './active-graph-observations.js';

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

    registry.publish(changed('todo-2'));
    await Promise.resolve();
    expect(settled).toBe(false);

    registry.publish(changed('todo-1'));
    await expect(next).resolves.toBe(true);
  });

  it('coalesces repeated commits into one pending refresh', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();

    registry.publish(changed('todo-1'));
    registry.publish(changed('todo-1'));
    await expect(subscription.wait(controller.signal)).resolves.toBe(true);

    const next = subscription.wait(controller.signal);
    subscription.close();
    await expect(next).resolves.toBe(false);
  });

  it('releases a pending wait when the observation aborts', async () => {
    const registry = createActiveGraphObservationRegistry();
    const subscription = registry.register(read('todo-1'));
    const controller = new AbortController();
    const next = subscription.wait(controller.signal);

    controller.abort();

    await expect(next).resolves.toBe(false);
    subscription.close();
    registry.publish(changed('todo-1'));
    await expect(subscription.wait(new AbortController().signal)).resolves.toBe(false);
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
