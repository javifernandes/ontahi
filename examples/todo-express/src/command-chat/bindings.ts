import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual as sameJson } from 'node:util';

import { createEntityRef, field, graphSchema, Selection } from '@ontahi/core/data-graph';
import { ModelInterpretationError, type ModelCommandBinding } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

import type { createCommandContextReader } from './context.js';

type Context = Awaited<ReturnType<ReturnType<typeof createCommandContextReader>>>;
const itemSelection = (id: string) =>
  Selection.references(TodoItem, [createEntityRef(TodoItem, { id })]).toJSON();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const strict = (fields: Parameters<typeof graphSchema.object>[0]) =>
  graphSchema.object(fields, { unknownKeys: 'strict' });
const outside = (): never => {
  throw new ModelInterpretationError(
    'proposal_out_of_scope',
    'The proposal is outside the current command scope.',
  );
};

// Model argument projections and scope policy, not a second operation catalog.
export const todoCommandBindings = (context: Context): Record<string, ModelCommandBinding> => {
  const namedList = (name: unknown) => {
    if (name === undefined) return context.list;
    const targets = context.lists.filter(list => sameName(list.name, String(name)));
    return targets.length === 1 ? targets[0]! : null;
  };
  const listForRef = (ref: unknown) =>
    context.lists.find(list => sameJson(ref, createEntityRef(TodoList, { id: list.id })));
  return {
    'TodoList.createList': {
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
    'TodoItem.deleteList': {
      arguments: strict({ name: field.nonEmptyString() }),
      prepare: args => {
        const list = namedList(args.name);
        return list ? { list: createEntityRef(TodoList, { id: list.id }) } : null;
      },
      validate: value => {
        if (Object.keys(value).length !== 1) outside();
        const list = listForRef(value.list);
        return !list || context.lists.filter(other => sameName(other.name, list.name)).length !== 1
          ? 'No unique list target is available.'
          : undefined;
      },
      message: () => 'List deleted.',
    },
    'TodoItem.createItem': {
      arguments: strict({
        title: field.nonEmptyString(),
        listName: graphSchema.optional(field.nonEmptyString()),
      }),
      prepare: args => {
        const list = namedList(args.listName);
        return list
          ? {
              id: randomUUID(),
              title: args.title,
              list: createEntityRef(TodoList, { id: list.id }),
            }
          : null;
      },
      validate: value => {
        if (
          Object.keys(value).length !== 3 ||
          !listForRef(value.list) ||
          typeof value.title !== 'string' ||
          !value.title.trim() ||
          value.title.length > 500
        )
          outside();
        return undefined;
      },
      message: () => 'Item added.',
    },
    'TodoItem.setCompleted': {
      arguments: strict({
        title: field.nonEmptyString(),
        listName: graphSchema.optional(field.nonEmptyString()),
      }),
      prepare: args => {
        const list = namedList(args.listName);
        if (args.listName !== undefined && !list) return null;
        const targets = context.items.filter(
          item =>
            !item.completed &&
            sameName(item.title, String(args.title)) &&
            (!list || item.list.locator.id === list.id),
        );
        return targets.length === 1
          ? { todos: itemSelection(targets[0]!.id), completed: true }
          : null;
      },
      validate: value => {
        if (Object.keys(value).length !== 2 || value.completed !== true) outside();
        const target = context.items.find(item => sameJson(value.todos, itemSelection(item.id)));
        return !target ||
          target.completed ||
          context.items.filter(
            item =>
              !item.completed &&
              sameName(item.title, target.title) &&
              sameJson(item.list, target.list),
          ).length !== 1
          ? 'No unique unfinished item target is available.'
          : undefined;
      },
      message: () => 'Item completed.',
    },
  };
};
export const todoCommandInstructions =
  'The selected list is context.list. When it exists, adding an item requires ONLY a title. Never ask for a list ID. "add item buy hamburgers" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.createItem","input":{"title":"buy hamburgers"}}}. Use listName to identify a list named in the request. If omitted, context.list is the optional selected list. Creating an item requires a named or selected list. Completing an item may resolve a unique title across lists when none is selected. The runtime supplies IDs and references. Example: "add buy bread to Groceries" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.createItem","input":{"title":"buy bread","listName":"Groceries"}}}. "complete buy bread" uses TodoItem.setCompleted with input {"title":"buy bread"}. For deletion, copy the list name from the request into input.name. The user does not need to supply JSON or say the word "name". For example "delete list Groceries" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.deleteList","input":{"name":"Groceries"}}}. Check names against context.lists, including non-English names. A request naming ONE list is ONE action even when context.lists contains many lists. Other context lists are not requested actions. If a request names more than one deletion target, return {"status":"unresolved","reason":"Only one action per message is supported. Delete each list in a separate message."}. Never execute only part of the request. "create list Holidays" uses TodoList.createList with input {"name":"Holidays"}.';
