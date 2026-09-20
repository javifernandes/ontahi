import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual as sameJson } from 'node:util';

import { createEntityRef, field, graphSchema, Selection } from '@ontahi/core/data-graph';
import type { ModelOperationExposure } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

import type { createCommandContextReader } from './context.js';
import { TodoCommandError } from './contracts.js';

type Context = Awaited<ReturnType<ReturnType<typeof createCommandContextReader>>>;
const itemSelection = (id: string) =>
  Selection.references(TodoItem, [createEntityRef(TodoItem, { id })]).toJSON();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const outside = (): never => {
  throw new TodoCommandError(
    'proposal_out_of_scope',
    'The proposal is outside the current command scope.',
  );
};
const strict = (fields: Parameters<typeof graphSchema.object>[0]) =>
  graphSchema.object(fields, { unknownKeys: 'strict' });
export type TodoCommandExposure = ModelOperationExposure & {
  message: (input: Record<string, unknown>) => string;
};

// These are application choices: exposed actions, argument projections, bindings, and scope.
export const todoCommandOperations = (context: Context): TodoCommandExposure[] => [
  {
    operationId: 'TodoList.createList',
    description: 'Create a new list. Example: create list Groceries -> {name:"Groceries"}.',
    arguments: strict({ name: field.nonEmptyString() }),
    prepare: args => ({ id: randomUUID(), name: args.name, color: '#f5ddd5' }),
    validate: value => {
      if (
        Object.keys(value).length !== 3 ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 200 ||
        value.color !== '#f5ddd5'
      )
        outside();
      return undefined;
    },
    message: value => `List “${String(value.name)}” created.`,
  },
  {
    operationId: 'TodoItem.deleteList',
    description:
      'Delete an existing list and ALL its items. Use the exact list name from context.lists. Example: delete list Groceries -> {name:"Groceries"}.',
    arguments: strict({ name: field.nonEmptyString() }),
    prepare: args => {
      const targets = context.lists.filter(list => sameName(list.name, String(args.name)));
      return targets.length === 1
        ? { list: createEntityRef(TodoList, { id: targets[0]!.id }) }
        : null;
    },
    validate: value => {
      if (Object.keys(value).length !== 1) outside();
      const target = context.lists.find(list =>
        sameJson(value.list, createEntityRef(TodoList, { id: list.id })),
      );
      if (!context.complete || !target)
        return 'The list is missing or no longer available. Submit a new request.';
      if (context.lists.filter(list => sameName(list.name, target.name)).length !== 1)
        return 'More than one list has that name. Rename one to distinguish them.';
      return undefined;
    },
    message: () => 'List deleted.',
  },
  ...(context.list
    ? [
        {
          operationId: 'TodoItem.createItem',
          description:
            'Add an item to the selected list. Example: add item buy hamburgers -> {title:"buy hamburgers"}. The runtime supplies its ID and list.',
          arguments: strict({ title: field.nonEmptyString() }),
          prepare: (args: Record<string, unknown>) => ({
            id: randomUUID(),
            list: createEntityRef(TodoList, { id: context.list!.id }),
            title: args.title,
          }),
          validate: (value: Record<string, unknown>) => {
            if (
              Object.keys(value).length !== 3 ||
              !sameJson(value.list, createEntityRef(TodoList, { id: context.list!.id })) ||
              typeof value.title !== 'string' ||
              !value.title.trim() ||
              value.title.length > 500
            )
              outside();
            return undefined;
          },
          message: () => 'Item added.',
        },
        {
          operationId: 'TodoItem.setCompleted',
          description:
            'Complete an existing unfinished item in the selected list. Use its exact title from context.items. Example: complete buy bread -> {title:"buy bread"}.',
          arguments: strict({ title: field.nonEmptyString() }),
          prepare: (args: Record<string, unknown>) => {
            const targets = context.items.filter(
              item => !item.completed && sameName(item.title, String(args.title)),
            );
            return targets.length === 1
              ? { todos: itemSelection(targets[0]!.id), completed: true }
              : null;
          },
          validate: (value: Record<string, unknown>) => {
            if (Object.keys(value).length !== 2 || value.completed !== true) outside();
            const target = context.items.find(item =>
              sameJson(value.todos, itemSelection(item.id)),
            );
            if (!context.complete || !target || target.completed)
              return 'No matching unfinished item is available in this list.';
            if (
              context.items.filter(item => !item.completed && sameName(item.title, target.title))
                .length !== 1
            )
              return 'More than one unfinished item has that title. Rename one to distinguish them.';
            return undefined;
          },
          message: () => 'Item completed.',
        },
      ]
    : []),
];

export const todoCommandInstructions =
  'The selected list is context.list. When it exists, adding an item requires ONLY a title. Never ask for a list ID. For example "add item buy hamburgers" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.createItem","input":{"title":"buy hamburgers"}}}. "complete buy bread" uses TodoItem.setCompleted with input {"title":"buy bread"}. "delete list Groceries" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.deleteList","input":{"name":"Groceries"}}}. The target list may differ from the selected list. "create list Holidays" uses TodoList.createList with input {"name":"Holidays"}.';
