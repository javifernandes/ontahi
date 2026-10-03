import {
  isEntityRef,
  type AnyEntityRef,
  type AnyEntityDefinition,
  type EntityMutationCommand,
  type EntityMutationCommandPolicy,
  type WritableStoredFieldName,
} from '@ontahi/core/data-graph';
import {
  createModelEntityMutationExposure,
  type ModelGraphCommandExposure,
} from '@ontahi/core/runtime/server';

import { todoItemMutationPolicy, todoListMutationPolicy } from '../todo-command-policies.js';

import type { TodoModelContext } from './context.js';

type Context = TodoModelContext;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const words = (text: string) =>
  ` ${text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
// Speech recognition may choose capitalization the user did not explicitly control.
const includesRequestedValue = (text: string, value: string) =>
  value.trim().length > 0 && text.toLowerCase().includes(value.trim().toLowerCase());
const requestsBulkCompletion = (text: string) =>
  /^(?:please\s+)?(?:complete|finish|mark)\s+(?:all|every)\b/u.test(text.trim().toLowerCase()) ||
  /^(?:por\s+favor\s+)?(?:completa|completá|completar|termina|terminá|terminar|marca|marcá|marcar)\s+(?:todos|todas)\b/u.test(
    text.trim().toLowerCase(),
  );

export const todoGraphCommands = (
  context: Context,
  text: string,
  language = 'en-US',
): ModelGraphCommandExposure[] => {
  const es = language.toLowerCase().startsWith('es');
  const unresolved = es
    ? 'No pude identificar un único destino. Indicá el nombre actual y, para un ítem, su lista si hay varios iguales.'
    : 'I could not identify one target. Specify its current name and, for duplicate items, its list.';
  const bulkCompletion = requestsBulkCompletion(text);
  const exposure = <TEntity extends AnyEntityDefinition, TAuthority>(
    policy: EntityMutationCommandPolicy<TEntity, TAuthority>,
    key: WritableStoredFieldName<TEntity['fields']> & string,
    validateTarget: (target: AnyEntityRef, before: string, after: string) => boolean,
    description: string,
    message: string,
  ): ModelGraphCommandExposure =>
    createModelEntityMutationExposure(policy, {
      action: 'update',
      values: [key],
      condition: [key],
      description,
      validate: ({ command }) => {
        if (
          command.kind !== 'entity-mutation-command' ||
          command.action !== 'update' ||
          !isEntityRef(command.target)
        )
          return unresolved;
        return validateTarget(
          command.target,
          String(command.if?.[key]),
          String(command.values[key]),
        )
          ? undefined
          : unresolved;
      },
      message: () => message,
    });
  return [
    createModelEntityMutationExposure(todoListMutationPolicy, {
      action: 'create',
      values: ['name', 'color'],
      description: es ? 'Crear una lista nueva.' : 'Create a new list.',
      validate: ({ command }) => {
        const create = command as EntityMutationCommand;
        return create.kind === 'entity-mutation-command' &&
          create.action === 'create' &&
          typeof create.values.name === 'string' &&
          create.values.color === '#f5ddd5' &&
          includesRequestedValue(text, create.values.name)
          ? undefined
          : unresolved;
      },
      message: ({ command }) => {
        const name = command.action === 'create' ? String(command.values.name) : '';
        return es ? `Lista “${name}” creada.` : `List “${name}” created.`;
      },
    }),
    ...(bulkCompletion
      ? []
      : [
          createModelEntityMutationExposure(todoItemMutationPolicy, {
            action: 'create',
            values: ['list', 'title', 'completed'],
            valueLiterals: { completed: false },
            description: es ? 'Agregar un ítem a una lista.' : 'Add an item to a list.',
            validate: ({ command }, validation) => {
              const create = command as EntityMutationCommand;
              const list = create.action === 'create' ? create.values.list : undefined;
              if (
                create.kind !== 'entity-mutation-command' ||
                create.action !== 'create' ||
                !isEntityRef(list) ||
                typeof create.values.title !== 'string' ||
                create.values.completed !== false
              )
                return unresolved;
              const target = context.lists.find(candidate => candidate.id === list.locator.id);
              const mentioned = context.lists.filter(list =>
                words(text).includes(words(list.name)),
              );
              return target &&
                includesRequestedValue(text, create.values.title) &&
                (mentioned.some(list => list.id === target.id) ||
                  (mentioned.length === 0 && validation?.kind === 'choice-option'))
                ? undefined
                : unresolved;
            },
            message: () => (es ? 'Ítem agregado.' : 'Item added.'),
          }),
        ]),
    createModelEntityMutationExposure(todoItemMutationPolicy, {
      action: 'delete',
      condition: ['title'],
      description: es ? 'Borrar un ítem individual.' : 'Delete an individual item.',
      validate: ({ command }) => {
        if (
          command.kind !== 'entity-mutation-command' ||
          command.action !== 'delete' ||
          !isEntityRef(command.target)
        )
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
    }),
    createModelEntityMutationExposure(todoListMutationPolicy, {
      action: 'delete',
      condition: ['name'],
      description: es ? 'Borrar una lista y sus ítems.' : 'Delete a list and its items.',
      validate: ({ command }, validation) => {
        if (
          command.kind !== 'entity-mutation-command' ||
          command.action !== 'delete' ||
          !isEntityRef(command.target)
        )
          return unresolved;
        const targetRef = command.target;
        const name = String(command.if?.name);
        const matches = context.lists.filter(list => same(list.name, name));
        const target = matches.find(list => list.id === targetRef.locator.id);
        const mentioned = context.lists.filter(list => words(text).includes(words(list.name)));
        return target &&
          words(text).includes(words(name)) &&
          (mentioned.length === 1 || validation?.kind === 'choice-option') &&
          (matches.length === 1 || validation?.kind === 'choice-option')
          ? undefined
          : unresolved;
      },
      message: () => (es ? 'Lista borrada.' : 'List deleted.'),
    }),
    createModelEntityMutationExposure(todoItemMutationPolicy, {
      action: 'update',
      values: ['completed'],
      valueLiterals: { completed: true },
      condition: ['completed'],
      conditionLiterals: { completed: false },
      description: es ? 'Marcar un ítem como completado.' : 'Mark an item as completed.',
      validate: ({ command }, validation) => {
        if (
          command.kind !== 'entity-mutation-command' ||
          command.action !== 'update' ||
          !isEntityRef(command.target) ||
          command.values.completed !== true ||
          command.if?.completed !== false
        )
          return unresolved;
        const targetRef = command.target;
        const target = context.items.find(item => item.id === targetRef.locator.id);
        if (!target || target.completed || !words(text).includes(words(target.title))) {
          return unresolved;
        }
        const mentionedLists = context.lists.filter(list => words(text).includes(words(list.name)));
        const matches = context.items.filter(
          item =>
            !item.completed &&
            same(item.title, target.title) &&
            (!mentionedLists.length ||
              mentionedLists.some(list => list.id === item.list.locator.id)),
        );
        return matches.length === 1 || validation?.kind === 'choice-option'
          ? undefined
          : unresolved;
      },
      message: () => (es ? 'Ítem completado.' : 'Item completed.'),
    }),
    exposure(
      todoListMutationPolicy,
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
      todoItemMutationPolicy,
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
