import {
  createRecursiveEntityView,
  field,
  graphSchema,
  query,
  safeParseGraphSchema,
  toGraphReadRequest,
  type GraphReadDispatcher,
} from '@ontahi/core/data-graph';
import type { ModelCommandRequest } from '@ontahi/core/runtime/contracts';
import {
  getCurrentInvocationContext,
  ModelInterpretationError as TodoCommandError,
} from '@ontahi/core/runtime/server';
import { isRecord } from '@ontahi/core/value/object';

import type { TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

const maxItems = 100;
const ContextLists = graphSchema.array(
  graphSchema.object({ id: field.id(), name: field.string() }),
);
const ContextItems = graphSchema.array(
  graphSchema.object({
    id: field.id(),
    title: field.string(),
    list: graphSchema.ref(TodoList),
    completed: field.boolean(),
  }),
);

export const createCommandContextReader = (read: GraphReadDispatcher<TodoGraphReadAuthority>) => {
  return async ({ text, context }: ModelCommandRequest) => {
    if (
      context !== undefined &&
      (!isRecord(context) ||
        Object.keys(context).some(key => key !== 'focus') ||
        (context.focus !== undefined &&
          (!isRecord(context.focus) ||
            context.focus.kind !== 'entity-ref' ||
            context.focus.entityName !== 'TodoList' ||
            !isRecord(context.focus.locator) ||
            typeof context.focus.locator.id !== 'string')))
    )
      throw new TodoCommandError('command_invalid', 'Invalid interaction context.');
    const listId =
      isRecord(context) && isRecord(context.focus) && isRecord(context.focus.locator)
        ? String(context.focus.locator.id)
        : null;
    if (!text.trim() || text.length > 2_000) {
      throw new TodoCommandError(
        'command_invalid',
        'Write a request between 1 and 2,000 characters.',
      );
    }
    const authority = { principal: getCurrentInvocationContext()?.principal ?? null };
    const listResponse = await read(
      toGraphReadRequest(
        query(TodoList)
          .as(createRecursiveEntityView(TodoList, 'CommandList', { id: true, name: true }))
          .limit(101),
        'run',
      ),
      { authority },
    );
    if (listResponse.kind !== 'graph-read-result') {
      throw new TodoCommandError(
        'context_unavailable',
        'The current list is not available to this session.',
      );
    }
    const lists = safeParseGraphSchema(ContextLists, listResponse.value);
    if (!lists.success || (listId !== null && !lists.data.some(list => list.id === listId))) {
      throw new TodoCommandError(
        'context_unavailable',
        'The selected list no longer exists or is unavailable.',
      );
    }
    const itemResponse = await read(
      toGraphReadRequest(
        query(TodoItem)
          .as(
            createRecursiveEntityView(TodoItem, 'CommandItems', {
              id: true,
              title: true,
              completed: true,
              list: true,
            }),
          )
          .limit(maxItems + 1),
        'run',
      ),
      { authority },
    );
    if (itemResponse.kind !== 'graph-read-result') {
      throw new TodoCommandError(
        'context_unavailable',
        'The current list items are unavailable to this session.',
      );
    }
    const items = safeParseGraphSchema(ContextItems, itemResponse.value);
    if (!items.success) throw new TodoCommandError('context_unavailable', 'Invalid list context.');
    return {
      list: lists.data.find(list => list.id === listId) ?? null,
      lists: lists.data,
      items: items.data.filter(item => lists.data.some(list => list.id === item.list.locator.id)),
      complete: items.data.length <= maxItems && lists.data.length <= 100,
    };
  };
};
