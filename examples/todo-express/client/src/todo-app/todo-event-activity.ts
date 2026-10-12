import type { EntityRef } from '@ontahi/core/data-graph';
import type { EventDelivery } from '@ontahi/core/runtime/server';
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

export const projectTodoEventActivity = (
  delivery: EventDelivery<TodoListCompletedPayload>,
): TodoEventActivity => ({
  id: delivery.occurrence.occurrenceId,
  kind: 'todo-list-completed',
  occurredAt: delivery.occurrence.occurredAt,
  list: delivery.occurrence.payload.list,
  completedCount: delivery.occurrence.payload.completedCount,
});
