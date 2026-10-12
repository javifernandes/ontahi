import type { EntityRef } from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import type { AnyEventDeclaration, EventDelivery } from '@ontahi/core/runtime/server';
import type { JsonValue } from '@ontahi/core/value/json';

export type TodoListCompletedPayload = {
  readonly list: EntityRef<'TodoList'>;
  readonly completedCount: number;
} & JsonValue;

export type TodoEventActivity = {
  readonly id: string;
  readonly kind: 'todo-list-completed';
  readonly occurredAt: string;
  readonly list: EntityRef<'TodoList'>;
  readonly completedCount: number;
};

// Event observation sends only this reflected wire identity. Keeping it client-local avoids
// bundling the server declaration runtime; generated client reflection can replace it later.
export const TodoListCompletedEventIdentity = {
  id: 'TodoListCompleted',
  version: 1,
} as AnyEventDeclaration;

export const projectTodoEventActivity = (
  delivery: EventDelivery<TodoListCompletedPayload>,
): TodoEventActivity => ({
  id: delivery.occurrence.occurrenceId,
  kind: 'todo-list-completed',
  occurredAt: delivery.occurrence.occurredAt,
  list: delivery.occurrence.payload.list,
  completedCount: delivery.occurrence.payload.completedCount,
});

export const observeTodoEventActivity = async (
  transport: RuntimeTransport,
  event: AnyEventDeclaration,
  onActivity: (activity: TodoEventActivity) => void,
  signal: AbortSignal,
): Promise<void> => {
  if (!transport.events) throw new Error('Todo Event observation is unavailable.');
  for await (const delivery of transport.events.observe(event, { signal })) {
    onActivity(projectTodoEventActivity(delivery as EventDelivery<TodoListCompletedPayload>));
  }
};
