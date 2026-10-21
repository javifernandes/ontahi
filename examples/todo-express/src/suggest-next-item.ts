import {
  field,
  graphSchema,
  type EntityRef,
  type InferGraphSchemaValue,
} from '@ontahi/core/data-graph';
import {
  createModelOperationExecutor,
  type ModelOperationContract,
  type ModelOperationExecutionFailure,
  type ModelProvider,
  type OperationFailure,
} from '@ontahi/core/runtime/server';
import type { JsonValue } from '@ontahi/core/value/json';
import { Effect } from 'effect';

export const TodoItemSuggestion = graphSchema.object({
  title: field.nonEmptyString({ trim: true }),
  reason: field.optional(field.nonEmptyString({ trim: true })),
});

export type TodoItemSuggestionValue = InferGraphSchemaValue<typeof TodoItemSuggestion>;

export type TodoSuggestionContext = {
  readonly list: { readonly id: string; readonly name: string };
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly completed: boolean;
  }>;
};

export type SuggestNextItemInput = { readonly list: EntityRef };

export type SuggestNextItemExecution = {
  readonly operation: ModelOperationContract<typeof TodoItemSuggestion>;
  readonly input: SuggestNextItemInput;
  readonly context: TodoSuggestionContext;
};

export type TodoSuggestionExecutor = {
  suggestNextItem(
    execution: SuggestNextItemExecution,
  ): Effect.Effect<TodoItemSuggestionValue, ModelOperationExecutionFailure | OperationFailure>;
};

const normalizedTitles = (context: TodoSuggestionContext) =>
  new Set(context.items.map(item => item.title.trim().toLocaleLowerCase()));

export const isDuplicateTodoSuggestion = (
  suggestion: TodoItemSuggestionValue,
  context: TodoSuggestionContext,
) => normalizedTitles(context).has(suggestion.title.trim().toLocaleLowerCase());

export const codeBackedTodoSuggestionExecutor: TodoSuggestionExecutor = {
  suggestNextItem: ({ context }) => {
    const existing = normalizedTitles(context);
    const candidates = [
      `Review ${context.list.name} priorities`,
      `Plan the next ${context.list.name} step`,
      `Finish the next ${context.list.name} task`,
    ];
    const available = candidates.find(candidate => !existing.has(candidate.toLocaleLowerCase()));
    const fallback = `Add another ${context.list.name} task`;
    let title = available ?? fallback;
    for (let suffix = 2; existing.has(title.toLocaleLowerCase()); suffix += 1)
      title = `${fallback} ${suffix}`;
    return Effect.succeed({
      title,
      reason: `Suggested from the current ${context.list.name} list.`,
    });
  },
};

export const createModelBackedTodoSuggestionExecutor = (
  provider: ModelProvider,
): TodoSuggestionExecutor => {
  const executor = createModelOperationExecutor({
    provider,
    instructions:
      'Suggest exactly one useful Todo item that is not already represented by the supplied list items.',
  });
  return {
    suggestNextItem: execution =>
      executor.execute({
        ...execution,
        context: execution.context as JsonValue,
        instructions:
          'Treat completed and open items as context. Do not propose mutations or claim that the suggestion was persisted.',
      }),
  };
};
