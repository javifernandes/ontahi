import type { Selection } from '@ontahi/core/data-graph';

import {
  Tag,
  TodoItem,
  TodoItemSchema,
  TodoList,
  TodoTag,
} from '../../src/generated/client-entities.js';

const TodoListItem = TodoList.view('TodoListItem', { id: true, name: true });
const TagItem = Tag.view('TagItem', { id: true, name: true, color: true });
const TodoTagItem = TodoTag.view('TodoTagItem', { todoId: true, tagId: true });
const TodoItemListItem = TodoItem.view('TodoItemListItem', {
  id: true,
  list: true,
  title: true,
  completed: true,
});

export const todoListsQuery = TodoList.all()
  .as(TodoListItem)
  .orderBy(list => list.name);

export const tagsQuery = Tag.all()
  .as(TagItem)
  .orderBy(tag => tag.name);

export const todoTagAssignmentsQuery = TodoTag.all()
  .as(TodoTagItem)
  .orderBy(assignment => assignment.todoId);

export const todoItemsQuery = (todos: Selection<typeof TodoItemSchema>) =>
  TodoItem.all()
    .where(todos)
    .as(TodoItemListItem)
    .orderBy(todo => todo.title);
