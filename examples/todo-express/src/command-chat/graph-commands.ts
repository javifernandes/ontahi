import { graphSchema, type AnyEntityRef } from '@ontahi/core/data-graph';
import type { ModelGraphCommandExposure } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

import type { createCommandContextReader } from './context.js';

type Context = Awaited<ReturnType<ReturnType<typeof createCommandContextReader>>>;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const strict = (fields: Parameters<typeof graphSchema.object>[0]) =>
  graphSchema.object(fields, { unknownKeys: 'strict' });
const words = (text: string) =>
  ` ${text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
// Speech recognition may choose capitalization the user did not explicitly control.
const includesRequestedValue = (text: string, value: string) =>
  value.trim().length > 0 && text.toLowerCase().includes(value.trim().toLowerCase());

export const todoGraphCommands = (
  context: Context,
  text: string,
  language = 'en-US',
): ModelGraphCommandExposure[] => {
  const es = language.toLowerCase().startsWith('es');
  const unresolved = es
    ? 'No pude identificar un único destino. Indicá el nombre actual y, para un ítem, su lista si hay varios iguales.'
    : 'I could not identify one target. Specify its current name and, for duplicate items, its list.';
  const exposure = (
    entity: typeof TodoList | typeof TodoItem,
    key: 'name' | 'title',
    validateTarget: (target: AnyEntityRef, before: string, after: string) => boolean,
    description: string,
    message: string,
  ): ModelGraphCommandExposure => ({
    description,
    request: strict({
      version: graphSchema.literal(2),
      kind: graphSchema.literal('graph-command'),
      command: strict({
        kind: graphSchema.literal('entity-mutation-command'),
        action: graphSchema.literal('update'),
        entityName: graphSchema.literal(entity.name),
        target: graphSchema.ref(entity),
        values: strict({ [key]: key === 'name' ? TodoList.fields.name : TodoItem.fields.title }),
        if: strict({ [key]: key === 'name' ? TodoList.fields.name : TodoItem.fields.title }),
      }),
    }),
    validate: ({ command }) => {
      if (command.kind !== 'entity-mutation-command' || command.action !== 'update')
        return unresolved;
      return validateTarget(command.target, String(command.if?.[key]), String(command.values[key]))
        ? undefined
        : unresolved;
    },
    message: () => message,
  });
  return [
    {
      description: es ? 'Borrar un ítem individual.' : 'Delete an individual item.',
      request: strict({
        version: graphSchema.literal(2),
        kind: graphSchema.literal('graph-command'),
        command: strict({
          kind: graphSchema.literal('entity-mutation-command'),
          action: graphSchema.literal('delete'),
          entityName: graphSchema.literal('TodoItem'),
          target: graphSchema.ref(TodoItem),
          if: strict({ title: TodoItem.fields.title }),
        }),
      }),
      validate: ({ command }) => {
        if (command.kind !== 'entity-mutation-command' || command.action !== 'delete')
          return unresolved;
        const before = String(command.if?.title);
        // Remove the title before looking for a list qualifier: a list name inside
        // the item's own title cannot disambiguate duplicate items.
        const source = words(text).replace(words(before), ' ');
        const mentioned = context.lists.filter(list =>
          [
            'in',
            'in list',
            'from',
            'from list',
            'en',
            'en lista',
            'en la lista',
            'de',
            'de lista',
            'de la lista',
          ].some(prefix => source.includes(` ${prefix}${words(list.name)}`)),
        );
        const matches = context.items.filter(
          item =>
            same(item.title, before) &&
            (!mentioned.length || mentioned.some(list => list.id === item.list.locator.id)),
        );
        return mentioned.length <= 1 &&
          matches.length === 1 &&
          matches[0]!.id === command.target.locator.id &&
          matches[0]!.title === before &&
          words(text).includes(words(before))
          ? undefined
          : unresolved;
      },
      message: () => (es ? 'Ítem borrado.' : 'Item deleted.'),
    },
    exposure(
      TodoList,
      'name',
      (target, before, after) => {
        const matches = context.lists.filter(list => same(list.name, before));
        return (
          matches.length === 1 &&
          matches[0]!.id === target.locator.id &&
          matches[0]!.name === before &&
          words(text).includes(words(before)) &&
          includesRequestedValue(text, after)
        );
      },
      es ? 'Renombrar una lista.' : 'Rename a list.',
      es ? 'Lista renombrada.' : 'List renamed.',
    ),
    exposure(
      TodoItem,
      'title',
      (target, before, after) => {
        // A list mentioned inside the replacement title does not disambiguate the old item.
        const normalized = words(text);
        const replacementAt = normalized.lastIndexOf(words(after));
        if (replacementAt < 0 || !includesRequestedValue(text, after)) return false;
        const source = normalized.slice(0, replacementAt + 1);
        const mentioned = context.lists.filter(
          list =>
            source.includes(` in${words(list.name)}`) || source.includes(` en${words(list.name)}`),
        );
        if (mentioned.length > 1) return false;
        const matches = context.items.filter(
          item =>
            same(item.title, before) &&
            (!mentioned.length || mentioned[0]!.id === item.list.locator.id),
        );
        return (
          matches.length === 1 &&
          matches[0]!.id === target.locator.id &&
          matches[0]!.title === before &&
          source.includes(words(before))
        );
      },
      es ? 'Renombrar un ítem.' : 'Rename an item.',
      es ? 'Ítem renombrado.' : 'Item renamed.',
    ),
  ];
};
