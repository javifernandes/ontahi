import { describe, expect, it } from 'vitest';

import { todoSelectionInitialDocument } from './Explorer.js';

describe('Todo Explorer Selection language', () => {
  it.each([
    ['TodoList', 'all'],
    ['Tag', 'all'],
    ['TodoItem', 'completed = false'],
  ])('provides a valid initial document for %s', (entityName, expected) => {
    expect(todoSelectionInitialDocument(entityName)).toBe(expected);
  });
});
