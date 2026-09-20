import type { GraphJsonSchema } from '@ontahi/core/data-graph';

// Keep operation choice explicit. Provider grammar is a hint; the runtime validates the
// chosen operation's actual input schema and scope before any dispatch.
export const commandProposalSchema = (
  listRef: unknown,
  newItemId: string,
  newListId: string,
  targets: readonly { selection: unknown }[],
): GraphJsonSchema => ({
  anyOf: [
    {
      type: 'object',
      properties: { status: { const: 'unresolved' }, reason: { type: 'string' } },
      required: ['status', 'reason'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { const: 'resolved' },
        invocation: {
          type: 'object',
          properties: {
            kind: { const: 'invoke' },
            operationId: {
              enum: listRef
                ? ['TodoItem.createItem', 'TodoItem.setCompleted', 'TodoList.createList']
                : ['TodoList.createList'],
            },
            input: {
              type: 'object',
              properties: {
                id: { enum: listRef ? [newItemId, newListId] : [newListId] },
                name: { type: 'string', minLength: 1, maxLength: 200 },
                color: { const: '#f5ddd5' },
                ...(listRef
                  ? {
                      list: { const: listRef },
                      title: { type: 'string', minLength: 1, maxLength: 500 },
                    }
                  : {}),
                ...(listRef && targets.length
                  ? {
                      todos: { enum: targets.map(item => item.selection) },
                      completed: { const: true },
                    }
                  : {}),
              },
              additionalProperties: false,
            },
          },
          required: ['kind', 'operationId', 'input'],
          additionalProperties: false,
        },
      },
      required: ['status', 'invocation'],
      additionalProperties: false,
    },
  ],
});
