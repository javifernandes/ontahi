import { field, graphSchema, type InferGraphSchemaValue } from '@ontahi/core/data-graph';

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

const normalizedTitles = (context: TodoSuggestionContext) =>
  new Set(context.items.map(item => item.title.trim().toLocaleLowerCase()));

export const isDuplicateTodoSuggestion = (
  suggestion: TodoItemSuggestionValue,
  context: TodoSuggestionContext,
) => normalizedTitles(context).has(suggestion.title.trim().toLocaleLowerCase());

export const suggestTodoItemWithCode = (
  context: TodoSuggestionContext,
): TodoItemSuggestionValue => {
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
  return {
    title,
    reason: `Suggested from the current ${context.list.name} list.`,
  };
};
