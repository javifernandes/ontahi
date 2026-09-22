import { Tag, TodoItem, TodoList } from './todo.js';

export const todoGraphCommandPolicies = [
  { entity: TodoList, relationName: 'items', actions: ['move'] },
  { entity: TodoItem, relationName: 'tags', actions: ['link', 'unlink'] },
  {
    entity: TodoItem,
    scope: 'all',
    actions: {
      update: {
        fields: ['list', 'title', 'completed'],
        if: ['title'],
        result: ['id', 'list', 'title', 'completed'],
      },
    },
  },
  {
    entity: TodoList,
    scope: 'all',
    actions: {
      update: {
        fields: ['name', 'color'],
        if: ['name'],
        result: ['id', 'name', 'color'],
      },
    },
  },
  {
    entity: Tag,
    scope: 'all',
    actions: {
      create: {
        fields: ['id', 'name', 'color'],
        result: ['id', 'name', 'color'],
      },
      update: {
        fields: ['name', 'color'],
        result: ['id', 'name', 'color'],
      },
      delete: { result: ['id', 'name', 'color'] },
    },
  },
] as const;
