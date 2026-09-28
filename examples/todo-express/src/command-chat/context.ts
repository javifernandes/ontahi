import {
  createRecursiveEntityView,
  field,
  graphSchema,
  query,
  safeParseGraphSchema,
  toGraphReadRequest,
  type InferGraphSchemaValue,
} from '@ontahi/core/data-graph';
import {
  ModelInterpretationError as TodoCommandError,
  type ApplicationModelScopeAccess,
} from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

const maxItems = 100;
const maxLists = 100;
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
const CommandListView = createRecursiveEntityView(TodoList, 'CommandList', {
  id: true,
  name: true,
});
const CommandItemView = createRecursiveEntityView(TodoItem, 'CommandItems', {
  id: true,
  title: true,
  completed: true,
  list: true,
});
const visibleListsRequest = toGraphReadRequest(
  query(TodoList)
    .as(CommandListView)
    .limit(maxLists + 1),
  'run',
);
const visibleItemsRequest = toGraphReadRequest(
  query(TodoItem)
    .as(CommandItemView)
    .limit(maxItems + 1),
  'run',
);

export type TodoModelContext = {
  lists: InferGraphSchemaValue<typeof ContextLists>;
  items: InferGraphSchemaValue<typeof ContextItems>;
  complete: boolean;
};

/** Todo's explicit model-visible projection; graph access and authorization come from Core. */
export const readTodoModelContext = async (
  read: NonNullable<ApplicationModelScopeAccess['read']>,
  signal: AbortSignal,
): Promise<TodoModelContext> => {
  const listResponse = await read(visibleListsRequest, signal);
  if (listResponse.kind !== 'graph-read-result') {
    throw new TodoCommandError('context_unavailable', 'Lists are not available to this session.');
  }
  const lists = safeParseGraphSchema(ContextLists, listResponse.value);
  if (!lists.success) {
    throw new TodoCommandError('context_unavailable', 'The available lists could not be read.');
  }
  const itemResponse = await read(visibleItemsRequest, signal);
  if (itemResponse.kind !== 'graph-read-result') {
    throw new TodoCommandError('context_unavailable', 'Items are unavailable to this session.');
  }
  const items = safeParseGraphSchema(ContextItems, itemResponse.value);
  if (!items.success) throw new TodoCommandError('context_unavailable', 'Invalid list context.');
  return {
    lists: lists.data,
    items: items.data.filter(item => lists.data.some(list => list.id === item.list.locator.id)),
    complete: items.data.length <= maxItems && lists.data.length <= maxLists,
  };
};
