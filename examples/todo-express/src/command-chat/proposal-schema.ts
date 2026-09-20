import type { GraphJsonSchema } from '@ontahi/core/data-graph';

// Narrow the reflected operation inputs to the exact effects this proof permits.
export const commandProposalSchema = (
  listRef: unknown,
  newItemId: string,
  targets: readonly { selection: unknown }[],
): GraphJsonSchema => {
  return {
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
              operationId: { const: 'TodoItem.createItem' },
              input: {
                type: 'object',
                properties: {
                  id: { const: newItemId },
                  list: { const: listRef },
                  title: { type: 'string', minLength: 1, maxLength: 500 },
                },
                required: ['id', 'list', 'title'],
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
      ...(targets.length
        ? [
            {
              type: 'object',
              properties: {
                status: { const: 'resolved' },
                invocation: {
                  type: 'object',
                  properties: {
                    kind: { const: 'invoke' },
                    operationId: { const: 'TodoItem.setCompleted' },
                    input: {
                      type: 'object',
                      properties: {
                        todos: { enum: targets.map(item => item.selection) },
                        completed: { const: true },
                      },
                      required: ['todos', 'completed'],
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
          ]
        : []),
    ],
  };
};
