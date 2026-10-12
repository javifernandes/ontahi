import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import type { EventDelivery } from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { observeTodoEventActivity, TodoListCompletedEventIdentity } from './todo-event-activity.js';

describe('Todo Event activity observation', () => {
  it('subscribes through the Runtime Transport and projects live deliveries', async () => {
    const delivery: EventDelivery = {
      kind: 'event-delivery',
      deliveryId: 'delivery-1',
      subscriptionId: 'subscription-1',
      attempt: 1,
      occurrence: {
        kind: 'event-occurrence',
        occurrenceId: 'occurrence-1',
        eventId: 'TodoListCompleted',
        eventVersion: 1,
        occurredAt: '2026-10-12T00:00:00.000Z',
        payload: {
          list: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-1' } },
          completedCount: 2,
        },
      },
    };
    const observe = vi.fn(async function* () {
      yield delivery;
    });
    const onActivity = vi.fn();

    await observeTodoEventActivity(
      { request: vi.fn(), events: { observe } } as RuntimeTransport,
      TodoListCompletedEventIdentity,
      onActivity,
      new AbortController().signal,
    );

    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TodoListCompleted', version: 1 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onActivity).toHaveBeenCalledWith({
      id: 'occurrence-1',
      kind: 'todo-list-completed',
      occurredAt: '2026-10-12T00:00:00.000Z',
      list: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-1' } },
      completedCount: 2,
    });
  });
});
