import type { EntityMutationCommand, GraphCommandDispatchContext } from '@ontahi/core/data-graph';

import { todoAuthenticationMode } from './authentication-mode.js';
import type { TodoGraphReadAuthority } from './todo-read-policies.js';
import { Tag, TodoItem, TodoList } from './todo.js';

const authorizeCompletion = (
  command: EntityMutationCommand,
  { authority }: GraphCommandDispatchContext<unknown>,
) => {
  const { principal } = authority as TodoGraphReadAuthority;
  return (
    command.action !== 'update' ||
    !Object.prototype.hasOwnProperty.call(command.values, 'completed') ||
    todoAuthenticationMode === 'disabled' ||
    principal !== null
  );
};

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
      delete: {
        if: ['title'],
        result: ['id', 'list', 'title'],
        selection: { fields: { id: ['eq'], title: ['eq'] }, allowAll: true },
      },
      update: {
        fields: ['list', 'title', 'completed'],
        if: ['title', 'completed'],
        result: ['id', 'list', 'title', 'completed'],
        selection: { fields: { id: ['eq'], title: ['eq'] }, allowAll: true },
        authorize: authorizeCompletion,
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
      delete: { if: ['name'], result: ['id', 'name', 'color'] },
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
