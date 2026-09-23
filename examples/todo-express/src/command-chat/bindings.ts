import { isDeepStrictEqual as sameJson } from 'node:util';

import { createEntityRef, Selection } from '@ontahi/core/data-graph';
import { ModelInterpretationError, type ModelCommandBinding } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

import type { createCommandContextReader } from './context.js';

type Context = Awaited<ReturnType<ReturnType<typeof createCommandContextReader>>>;
const itemSelection = (id: string) =>
  Selection.references(TodoItem, [createEntityRef(TodoItem, { id })]).toJSON();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const outside = (): never => {
  throw new ModelInterpretationError(
    'proposal_out_of_scope',
    'The proposal is outside the current command scope.',
  );
};

// Scope policy on canonical operation inputs; contracts come from the operation declarations.
// A model-supplied list name is a hint, not evidence that the user disambiguated a target.
const words = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const todoCommandBindings = (
  context: Context,
  request: string,
  language = 'en-US',
): Record<string, ModelCommandBinding> => {
  const spanish = language.toLowerCase().startsWith('es');
  const say = (english: string, translated: string) => (spanish ? translated : english);
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
      description: spanish ? 'Crear una lista nueva.' : undefined,
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
      message: value =>
        say(`List “${String(value.name)}” created.`, `Lista “${String(value.name)}” creada.`),
    },
    'TodoItem.deleteList': {
      description: spanish ? 'Borrar una lista y todos sus ítems.' : undefined,
      validate: value => {
        if (Object.keys(value).length !== 1) outside();
        const mentioned = context.lists.filter(
          list =>
            words(list.name).length > 0 && ` ${words(request)} `.includes(` ${words(list.name)} `),
        );
        if (mentioned.length !== 1)
          return say(
            'Specify one list to delete per message.',
            'Indicá una sola lista para borrar por mensaje.',
          );
        const list = listForRef(value.list);
        if (list && !namedList(list.name)) return say('Which list?', '¿Qué lista?');
        return !list || context.lists.filter(other => sameName(other.name, list.name)).length !== 1
          ? say(
              'No unique list target is available.',
              'No pude identificar una única lista. Indicá cuál querés borrar.',
            )
          : undefined;
      },
      message: () => say('List deleted.', 'Lista borrada.'),
    },
    'TodoItem.createItem': {
      description: spanish ? 'Agregar un ítem a una lista.' : undefined,
      validate: value => {
        if (
          Object.keys(value).length !== 3 ||
          !listForRef(value.list) ||
          typeof value.title !== 'string' ||
          !value.title.trim() ||
          value.title.length > 500
        )
          outside();
        const list = listForRef(value.list);
        if (!list || !namedList(list.name))
          return say(
            'Specify which list to add the item to.',
            '¿A qué lista querés agregar el ítem?',
          );
        return undefined;
      },
      message: () => say('Item added.', 'Ítem agregado.'),
    },
    'TodoItem.setCompleted': {
      description: say('Mark items as completed.', 'Marcar ítems como completados.'),
      validate: value => {
        if (Object.keys(value).length !== 2 || value.completed !== true) outside();
        const target = context.items.find(item => sameJson(value.todos, itemSelection(item.id)));
        const mentioned = context.lists.filter(
          list =>
            words(list.name).length > 0 && ` ${words(request)} `.includes(` ${words(list.name)} `),
        );
        const matches = target
          ? context.items.filter(
              item =>
                !item.completed &&
                sameName(item.title, target.title) &&
                (!mentioned.length || mentioned.some(list => item.list.locator.id === list.id)),
            )
          : [];
        return !target || target.completed || matches.length !== 1 || matches[0]!.id !== target.id
          ? say(
              'I could not identify one unfinished item. Specify its title and which list it belongs to.',
              'No pude identificar un único ítem pendiente. Indicá su título y a qué lista pertenece.',
            )
          : undefined;
      },
      message: () => say('Item completed.', 'Ítem completado.'),
    },
  };
};
export const todoCommandInstructions = `You control a Todo app. Keep reasoning brief: choose one action and one target, or ask one question. Do not repeat the schema or reconsider an ambiguous target; if two candidates match, immediately return unresolved. Use these mappings:
- "create list <name>" -> TodoList.createList, input {id: context.creation.id, name, color: context.creation.color}.
- "add <title> to <list name>" or "add item <title> in <list name>" -> TodoItem.createItem, input {id: context.creation.id, title, list: the matching list.ref}.
- "delete list <name>" -> TodoItem.deleteList, input {list: the matching list.ref}.
- "delete item <title>" (optionally "from list <name>") -> graph-command version 2, entity-mutation-command delete on TodoItem, target item.ref, if {title: current title}. No values field. This deletes only the item, never its list.
- "complete <title>" -> TodoItem.setCompleted, input {todos: the matching item.completion, completed: true}.
- "rename list <old> to <new>" -> graph-command version 2, entity-mutation-command update on TodoList, target list.ref, values {name: new}, if {name: old}.
- "rename item <old> to <new>" -> the same update on TodoItem, target item.ref, values {title: new}, if {title: old}.
For renaming, return {"status":"resolved","request":{"version":2,"kind":"graph-command","command":{"kind":"entity-mutation-command","action":"update","entityName":"TodoList","target":MATCHING_LIST_REF,"values":{"name":"NEW_NAME"},"if":{"name":"CURRENT_NAME"}}}}. Use TodoItem/title for item renaming. Never use createList or createItem to rename.
For invocations return {"status":"resolved","request":{"kind":"invoke","operationId":"...","input":{...}}}.
A named existing list is sufficient to add a NEW item; the item need not exist and other items are irrelevant. Copy IDs/refs from context. Preserve the requested new names and titles verbatim, including lowercase letters and accents; do not capitalize, translate, or correct them. There is no selected list. Creating a LIST needs only its new name; it does not require an existing list or item. Ask which list only when adding an ITEM without a destination list, or when multiple existing targets match. For completion, a globally unique unfinished title needs no list. Completed items can be renamed. For multiple requested changes ask for one change per message. Adding a title containing verbs or "and" is still one action. "now" and "please" do not add actions. Never perform the task described in an item's title. Quotes delimit names and titles and are not part of their values.`;
