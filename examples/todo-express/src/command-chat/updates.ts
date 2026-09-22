import {
  createEntityRef,
  field,
  graphSchema,
  type UpdateEntityMutationCommand,
} from '@ontahi/core/data-graph';
import type { ModelUpdateBinding } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

import type { createCommandContextReader } from './context.js';

type Context = Awaited<ReturnType<ReturnType<typeof createCommandContextReader>>>;
const same = (a: string, b: unknown) => a.trim().toLowerCase() === String(b).trim().toLowerCase();
const strict = (fields: Parameters<typeof graphSchema.object>[0]) =>
  graphSchema.object(fields, { unknownKeys: 'strict' });

export const todoCommandUpdates = (
  context: Context,
  request: string,
  language = 'en-US',
): Record<string, ModelUpdateBinding> => {
  const es = language.toLowerCase().startsWith('es');
  const unresolved = es
    ? 'No pude identificar un único destino. Indicá el nombre actual y, para un ítem, su lista si hay varios iguales.'
    : 'I could not identify one target. Specify its current name and, for duplicate items, its list.';
  const stale = es
    ? 'El destino cambió. Volvé a indicar qué querés renombrar.'
    : 'The target changed. Specify what you want to rename again.';
  const matchesList = (name: unknown) => context.lists.filter(list => same(list.name, name));
  const currentValueMatches = (
    command: UpdateEntityMutationCommand,
    rows: readonly { id: string; [key: string]: unknown }[],
    key: string,
  ) => rows.some(row => row.id === command.target.locator.id && row[key] === command.if?.[key]);
  return {
    TodoList: {
      description: es ? 'Renombrar una lista.' : 'Rename a list.',
      target: strict({ name: field.nonEmptyString() }),
      values: strict({ name: TodoList.fields.name }),
      unresolvedReason: unresolved,
      prepare: (target, values) => {
        const matches = matchesList(target.name);
        const list = matches.length === 1 ? matches[0] : undefined;
        return list
          ? {
              kind: 'entity-mutation-command',
              action: 'update',
              entityName: 'TodoList',
              target: createEntityRef(TodoList, { id: list.id }),
              values,
              if: { name: list.name },
            }
          : null;
      },
      validate: command =>
        currentValueMatches(command, context.lists, 'name') &&
        matchesList(command.if?.name).length === 1
          ? undefined
          : stale,
      message: () => (es ? 'Lista renombrada.' : 'List renamed.'),
    },
    TodoItem: {
      description: es ? 'Renombrar un ítem.' : 'Rename an item.',
      target: strict({
        title: field.nonEmptyString(),
        listName: graphSchema.optional(field.nonEmptyString()),
      }),
      values: strict({ title: TodoItem.fields.title }),
      unresolvedReason: unresolved,
      prepare: (target, values) => {
        // Resolve an explicit list qualifier even if the model omits the optional argument.
        const normalized = ` ${request
          .toLowerCase()
          .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()} `;
        const replacement = ` ${String(values.title)
          .toLowerCase()
          .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()} `;
        const replacementAt = normalized.lastIndexOf(replacement);
        // A list mentioned only inside the new title cannot disambiguate the old item.
        const text = replacementAt >= 0 ? normalized.slice(0, replacementAt + 1) : normalized;
        const mentioned = context.lists.filter(list => {
          const name = list.name
            .toLowerCase()
            .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
          return name && (text.includes(` in ${name} `) || text.includes(` en ${name} `));
        });
        if (
          target.listName !== undefined &&
          !mentioned.some(list => same(list.name, target.listName))
        )
          return null;
        const lists =
          target.listName === undefined
            ? mentioned.length
              ? mentioned
              : context.lists
            : matchesList(target.listName);
        if (mentioned.length > 1 || (target.listName !== undefined && lists.length !== 1))
          return null;
        const matches = context.items.filter(
          item =>
            same(item.title, target.title) && lists.some(list => list.id === item.list.locator.id),
        );
        const item = matches.length === 1 ? matches[0] : undefined;
        return item
          ? {
              kind: 'entity-mutation-command',
              action: 'update',
              entityName: 'TodoItem',
              target: createEntityRef(TodoItem, { id: item.id }),
              values,
              if: { title: item.title },
            }
          : null;
      },
      validate: command =>
        currentValueMatches(command, context.items, 'title') ? undefined : stale,
      message: () => (es ? 'Ítem renombrado.' : 'Item renamed.'),
    },
  };
};
