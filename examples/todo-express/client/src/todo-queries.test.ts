import { toGraphReadRequest } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { TodoItem, TodoList } from '../../src/generated/client-entities.js';

import { todoItemsQuery } from './todo-queries.js';

describe('Todo client Queries', () => {
  it('keeps the Todo item list Query transport-safe when it projects tags', () => {
    const visibleTodos = TodoItem.selection(todo => todo.list.eq(TodoList.refById('list-1')));

    expect(toGraphReadRequest(todoItemsQuery(visibleTodos).build(), 'run')).toMatchObject({
      kind: 'graph-read',
      view: {
        name: 'TodoItemListItem',
        fields: {
          tags: expect.objectContaining({ kind: 'relation-view' }),
        },
      },
    });
  });
});
