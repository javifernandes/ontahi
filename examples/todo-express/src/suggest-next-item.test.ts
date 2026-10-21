import { createEntityRef, graphSchema } from '@ontahi/core/data-graph';
import type { ModelProvider } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  codeBackedTodoSuggestionExecutor,
  createModelBackedTodoSuggestionExecutor,
  isDuplicateTodoSuggestion,
  TodoItemSuggestion,
} from './suggest-next-item.js';

const execution = {
  operation: {
    id: 'TodoList.suggestNextItem',
    description: 'Suggest one useful next item from the current list.',
    input: graphSchema.object({}),
    output: TodoItemSuggestion,
  },
  input: { list: createEntityRef('TodoList' as const, { id: 'list-1' }) },
  context: {
    list: { id: 'list-1', name: 'Dinner' },
    items: [{ id: 'item-1', title: 'Buy vegetables', completed: false }],
  },
} as const;

describe('Todo item suggestion executors', () => {
  it('uses a deterministic code implementation of the same suggestion contract', async () => {
    await expect(
      Effect.runPromise(codeBackedTodoSuggestionExecutor.suggestNextItem(execution)),
    ).resolves.toEqual({
      title: 'Review Dinner priorities',
      reason: 'Suggested from the current Dinner list.',
    });
  });

  it('keeps deterministic fallback suggestions unique when the ordinary candidates exist', async () => {
    const crowdedExecution = {
      ...execution,
      context: {
        ...execution.context,
        items: [
          { id: '1', title: 'Review Dinner priorities', completed: false },
          { id: '2', title: 'Plan the next Dinner step', completed: false },
          { id: '3', title: 'Finish the next Dinner task', completed: true },
          { id: '4', title: 'Add another Dinner task', completed: false },
        ],
      },
    } as const;

    const suggestion = await Effect.runPromise(
      codeBackedTodoSuggestionExecutor.suggestNextItem(crowdedExecution),
    );

    expect(suggestion.title).toBe('Add another Dinner task 2');
    expect(isDuplicateTodoSuggestion(suggestion, crowdedExecution.context)).toBe(false);
  });

  it('uses list context and the ordinary output contract for a model implementation', async () => {
    const generate = vi.fn<ModelProvider['generate']>().mockResolvedValue({
      title: 'Set the table',
      reason: 'The food is covered but serving preparation is missing.',
    });

    await expect(
      Effect.runPromise(
        createModelBackedTodoSuggestionExecutor({ generate }).suggestNextItem(execution),
      ),
    ).resolves.toEqual({
      title: 'Set the table',
      reason: 'The food is covered but serving preparation is missing.',
    });
    expect(generate.mock.calls[0]![0]).toMatchObject({
      context: JSON.stringify(execution.context),
      outputSchema: expect.objectContaining({ required: ['title'] }),
    });
  });
});
