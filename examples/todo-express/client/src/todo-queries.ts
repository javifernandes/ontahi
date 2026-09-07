import { defineClientEntity } from '@ontahi/core/data-graph';

import { Tag, TodoListSchema } from '../../src/generated/client-entities.js';

const OrderedTodoList = defineClientEntity(TodoListSchema);
const TodoListItem = OrderedTodoList.view('TodoListItem', {
  id: true,
  name: true,
  color: true,
  items: {
    id: true,
    list: true,
    title: true,
    completed: true,
    tags: { id: true, name: true, color: true },
  },
});
const TagItem = Tag.view('TagItem', { id: true, name: true, color: true });

export const todoListsQuery = OrderedTodoList.all()
  .as(TodoListItem)
  .orderBy(list => list.name);

export const tagsQuery = Tag.all()
  .as(TagItem)
  .orderBy(tag => tag.name);
