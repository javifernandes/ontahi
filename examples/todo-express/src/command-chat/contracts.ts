import { field, graphSchema, type InferGraphSchemaValue } from '@ontahi/core/data-graph';
import type { ModelInterpretationValue } from '@ontahi/core/runtime/server';

export { ModelInterpretationError as TodoCommandError } from '@ontahi/core/runtime/server';
// Kept inline for static client codegen, which cannot yet follow imported Core schema values.
export const CommandInterpretation = graphSchema.union([
  graphSchema.object(
    {
      status: graphSchema.literal('resolved'),
      invocation: graphSchema.object(
        {
          kind: graphSchema.literal('invoke'),
          operationId: field.nonEmptyString(),
          input: field.json(),
        },
        { unknownKeys: 'strict' },
      ),
    },
    { unknownKeys: 'strict' },
  ),
  graphSchema.object(
    { status: graphSchema.literal('unresolved'), reason: field.nonEmptyString() },
    { unknownKeys: 'strict' },
  ),
]);

export type CommandInterpretationValue = ModelInterpretationValue;

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
