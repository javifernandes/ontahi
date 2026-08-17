import type { GraphReadPolicy } from '@ontahi/core/data-graph';
import type { Principal } from '@ontahi/core/runtime/server';

import { Tag, TodoItem, TodoList, TodoTag } from './todo.js';

export type TodoGraphReadAuthority = {
  principal: Principal | null;
};

// Reads are deliberately public in this portability example. Each policy still opts into that
// scope explicitly; an omitted Entity or surface remains denied by the dispatcher.

const TodoListReadPolicy = {
  entity: TodoList,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 200,
  fields: {
    id: { select: true, filter: ['eq', 'in'] },
    name: { select: true, filter: ['eq'], order: true },
  },
  scope: 'all',
} satisfies GraphReadPolicy<typeof TodoList, TodoGraphReadAuthority>;

const TagReadPolicy = {
  entity: Tag,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 200,
  fields: {
    id: { select: true, filter: ['eq', 'in'] },
    name: { select: true, filter: ['eq'], order: true },
    color: { select: true },
  },
  scope: 'all',
} satisfies GraphReadPolicy<typeof Tag, TodoGraphReadAuthority>;

const TodoTagReadPolicy = {
  entity: TodoTag,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 500,
  fields: {
    todoId: { select: true, filter: ['eq', 'in'], order: true },
    tagId: { select: true, filter: ['eq', 'in'] },
  },
  scope: 'all',
} satisfies GraphReadPolicy<typeof TodoTag, TodoGraphReadAuthority>;

const TodoItemReadPolicy = {
  entity: TodoItem,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 500,
  fields: {
    id: { select: true, filter: ['eq', 'in'] },
    list: { select: true, filter: ['eq', 'in'] },
    title: { select: true, filter: ['eq'], order: true },
    completed: { select: true, filter: ['eq'] },
  },
  scope: 'all',
} satisfies GraphReadPolicy<typeof TodoItem, TodoGraphReadAuthority>;

export const todoGraphReadPolicies = [
  TodoListReadPolicy,
  TagReadPolicy,
  TodoTagReadPolicy,
  TodoItemReadPolicy,
] as const;
