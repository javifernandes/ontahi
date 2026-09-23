import {
  createRecursiveEntityView,
  field,
  graphSchema,
  query,
  safeParseGraphSchema,
  toGraphReadRequest,
  type GraphReadDispatcher,
} from '@ontahi/core/data-graph';
import {
  getCurrentInvocationContext,
  ModelInterpretationError as TodoCommandError,
} from '@ontahi/core/runtime/server';

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
  return async () => {
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
      throw new TodoCommandError('context_unavailable', 'Lists are not available to this session.');
    }
    const lists = safeParseGraphSchema(ContextLists, listResponse.value);
    if (!lists.success) {
      throw new TodoCommandError('context_unavailable', 'The available lists could not be read.');
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
      throw new TodoCommandError('context_unavailable', 'Items are unavailable to this session.');
    }
    const items = safeParseGraphSchema(ContextItems, itemResponse.value);
    if (!items.success) throw new TodoCommandError('context_unavailable', 'Invalid list context.');
    return {
      lists: lists.data,
      items: items.data.filter(item => lists.data.some(list => list.id === item.list.locator.id)),
      complete: items.data.length <= maxItems && lists.data.length <= 100,
    };
  };
};
