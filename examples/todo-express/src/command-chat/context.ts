import {
  createEntityRef,
  createRecursiveEntityView,
  field,
  graphSchema,
  query,
  safeParseGraphSchema,
  toGraphReadRequest,
  type GraphReadDispatcher,
} from '@ontahi/core/data-graph';
import { getCurrentInvocationContext } from '@ontahi/core/runtime/server';

import type { TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

import { TodoCommandError, type CommandInput } from './contracts.js';

const maxItems = 100;
const ContextLists = graphSchema.array(
  graphSchema.object({ id: field.id(), name: field.string() }),
);
const ContextItems = graphSchema.array(
  graphSchema.object({
    id: field.id(),
    title: field.string(),
    completed: field.boolean(),
  }),
);

export const createCommandContextReader = (read: GraphReadDispatcher<TodoGraphReadAuthority>) => {
  return async ({ text, listId }: CommandInput) => {
    if (!text.trim() || text.length > 2_000) {
      throw new TodoCommandError(
        'command_invalid',
        'Write a request between 1 and 2,000 characters.',
      );
    }
    if (listId === null) return { list: null, items: [], complete: true };
    const authority = { principal: getCurrentInvocationContext()?.principal ?? null };
    const listResponse = await read(
      toGraphReadRequest(
        query(TodoList)
          .where(list => list.id.eq(listId))
          .as(createRecursiveEntityView(TodoList, 'CommandList', { id: true, name: true }))
          .limit(1),
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
    if (!lists.success || lists.data.length !== 1) {
      throw new TodoCommandError(
        'context_unavailable',
        'The selected list no longer exists or is unavailable.',
      );
    }
    const itemResponse = await read(
      toGraphReadRequest(
        query(TodoItem)
          .where(item => item.list.eq(createEntityRef(TodoList, { id: listId })))
          .as(
            createRecursiveEntityView(TodoItem, 'CommandItems', {
              id: true,
              title: true,
              completed: true,
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
    return { list: lists.data[0]!, items: items.data, complete: items.data.length <= maxItems };
  };
};
