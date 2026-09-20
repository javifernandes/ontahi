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
// A model-supplied list name is a hint, not evidence that the user disambiguated a target.
const words = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const todoCommandBindings = (
  context: Context,
  request: string,
): Record<string, ModelCommandBinding> => {
  const namedList = (name: unknown) => {
    if (name === undefined) return null;
    const targets = context.lists.filter(
      list =>
        sameName(list.name, String(name)) &&
        words(list.name).length > 0 &&
        ` ${words(request)} `.includes(` ${words(list.name)} `),
    );
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
      unresolvedReason: 'Specify which list to add the item to.',
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
      unresolvedReason:
        'I could not identify one unfinished item. Specify its title and which list it belongs to.',
      arguments: strict({
        title: field.nonEmptyString(),
        listName: graphSchema.optional(field.nonEmptyString()),
      }),
      prepare: args => {
        const list = namedList(args.listName);
        // Ignore an invented qualifier when the user named no list: resolve globally instead.
        const hasNamedList = context.lists.some(
          candidate =>
            words(candidate.name).length > 0 &&
            ` ${words(request)} `.includes(` ${words(candidate.name)} `),
        );
        if (hasNamedList && !list) return null;
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
  'There is no selected list. Resolve unfinished items across all visible lists. If exactly one item matches, complete it without asking for a list. If multiple items match, ask the user to specify the list; never guess one. Only set listName when the user names a list in the message. Creating an item requires a list name; ask which list if it is absent. The runtime supplies IDs and references. Example: "add buy bread to Groceries" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.createItem","input":{"title":"buy bread","listName":"Groceries"}}}. "complete buy bread" uses TodoItem.setCompleted with input {"title":"buy bread"}. For deletion, copy the list name from the request into input.name. The user does not need to supply JSON or say the word "name". For example "delete list Groceries" returns {"status":"resolved","invocation":{"kind":"invoke","operationId":"TodoItem.deleteList","input":{"name":"Groceries"}}}. Check names against context.lists, including non-English names. A request naming ONE list is ONE action even when context.lists contains many lists. Other context lists are not requested actions. If a request names more than one deletion target, return {"status":"unresolved","reason":"Only one action per message is supported. Delete each list in a separate message."}. Never execute only part of the request. "create list Holidays" uses TodoList.createList with input {"name":"Holidays"}.';
