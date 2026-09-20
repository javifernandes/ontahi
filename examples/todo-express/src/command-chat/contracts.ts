import { field, graphSchema, type InferGraphSchemaValue } from '@ontahi/core/data-graph';

export const CommandInterpretation = graphSchema.union([
  graphSchema.object(
    {
      status: graphSchema.literal('resolved'),
      invocation: graphSchema.object(
        {
          kind: graphSchema.literal('invoke'),
          operationId: field.enum([
            'TodoList.createList',
            'TodoItem.createItem',
            'TodoItem.setCompleted',
          ] as const),
          input: field.json(),
        },
        { unknownKeys: 'strict' },
      ),
    },
    { unknownKeys: 'strict' },
  ),
  graphSchema.object(
    {
      status: graphSchema.literal('unresolved'),
      reason: field.nonEmptyString(),
    },
    { unknownKeys: 'strict' },
  ),
]);

export type CommandInterpretationValue = InferGraphSchemaValue<typeof CommandInterpretation>;

export const CommandSubmission = graphSchema.object({
  status: field.enum(['executed', 'unresolved'] as const),
  message: field.nonEmptyString(),
});
export type CommandSubmissionValue = InferGraphSchemaValue<typeof CommandSubmission>;

export type CommandInput = { text: string; listId: string | null };
export type TodoCommandService = {
  interpret(input: CommandInput, signal: AbortSignal): Promise<CommandInterpretationValue>;
  submit(input: CommandInput, signal: AbortSignal): Promise<CommandSubmissionValue>;
};

export class TodoCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TodoCommandError';
  }
}
