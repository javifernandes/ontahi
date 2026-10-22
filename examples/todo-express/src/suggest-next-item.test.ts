import { describe, expect, it } from 'vitest';

import { isDuplicateTodoSuggestion, suggestTodoItemWithCode } from './suggest-next-item.js';

const context = {
  list: { id: 'list-1', name: 'Dinner' },
  items: [{ id: 'item-1', title: 'Buy vegetables', completed: false }],
} as const;

describe('code-backed Todo item suggestion', () => {
  it('uses a deterministic code implementation of the same suggestion contract', async () => {
    expect(suggestTodoItemWithCode(context)).toEqual({
      title: 'Review Dinner priorities',
      reason: 'Suggested from the current Dinner list.',
    });
  });

  it('keeps deterministic fallback suggestions unique when the ordinary candidates exist', async () => {
    const crowdedContext = {
      ...context,
      items: [
        { id: '1', title: 'Review Dinner priorities', completed: false },
        { id: '2', title: 'Plan the next Dinner step', completed: false },
        { id: '3', title: 'Finish the next Dinner task', completed: true },
        { id: '4', title: 'Add another Dinner task', completed: false },
      ],
    } as const;

    const suggestion = suggestTodoItemWithCode(crowdedContext);

    expect(suggestion.title).toBe('Add another Dinner task 2');
    expect(isDuplicateTodoSuggestion(suggestion, crowdedContext)).toBe(false);
  });
});
