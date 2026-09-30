import { Tag, TodoItem, TodoList } from './todo.js';

export const todoGraphCommandPolicies = [
  { entity: TodoList, relationName: 'items', actions: ['move'] },
  { entity: TodoItem, relationName: 'tags', actions: ['link', 'unlink'] },
  {
    entity: TodoItem,
    scope: 'all',
    actions: {
      create: {
        fields: ['list', 'title', 'completed'],
        result: ['id', 'list', 'title', 'completed'],
      },
      delete: { if: ['title'], result: ['id', 'list', 'title'] },
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
      create: {
        fields: ['name', 'color'],
        result: ['id', 'name', 'color'],
      },
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
        selection: { fields: { name: ['eq'] } },
      },
      delete: {
        result: ['id', 'name', 'color'],
        selection: { fields: { name: ['eq'] } },
      },
    },
  },
] as const;
