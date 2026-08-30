import { describe, expect, it, vi } from 'vitest';

import { loadAuthenticationSession, loadTodoRuntime } from './bootstrap.js';
import {
  bringDeskCardToFront,
  deleteTodoListWithItems,
  defaultDeskCardPosition,
  groupTodoLists,
  moveTodoItem,
  moveTodoList,
  reconcileDeskLayout,
  reconcileTodoItemOrder,
  reconcileTodoListOrder,
} from './todo-list-state.js';

describe('Todo client bootstrap state', () => {
  it('deletes every item before its list and stops when an item fails', async () => {
    const calls: string[] = [];
    const deleteItem = vi.fn(async (itemId: string) => {
      calls.push(`item:${itemId}`);
      return itemId !== 'blocked';
    });
    const deleteList = vi.fn(async () => {
      calls.push('list');
      return true;
    });

    await expect(
      deleteTodoListWithItems({ itemIds: ['one', 'two'], deleteItem, deleteList }),
    ).resolves.toBe(true);
    expect(calls).toEqual(['item:one', 'item:two', 'list']);

    calls.length = 0;
    await expect(
      deleteTodoListWithItems({ itemIds: ['one', 'blocked', 'three'], deleteItem, deleteList }),
    ).resolves.toBe(false);
    expect(calls).toEqual(['item:one', 'item:blocked']);
  });

  it('groups every todo under its list for the dashboard', () => {
    const lists = [
      { id: 'inbox', name: 'Inbox' },
      { id: 'later', name: 'Later' },
    ];
    const todos = [
      { id: 'todo-2', list: { locator: { id: 'later' } } },
      { id: 'todo-1', list: { locator: { id: 'inbox' } } },
    ];

    expect(groupTodoLists(lists, todos, todo => todo.list.locator.id)).toEqual([
      { ...lists[0], items: [todos[1]] },
      { ...lists[1], items: [todos[0]] },
    ]);
  });

  it('appends newly discovered lists and preserves manual list ordering', () => {
    expect(reconcileTodoListOrder(['inbox', 'later'], ['ideas', 'inbox', 'later'])).toEqual([
      'inbox',
      'later',
      'ideas',
    ]);
    expect(moveTodoList(['inbox', 'later', 'ideas'], 'ideas', 'inbox')).toEqual([
      'ideas',
      'inbox',
      'later',
    ]);
    expect(moveTodoList(['ideas', 'inbox', 'later'], 'ideas')).toEqual(['inbox', 'later', 'ideas']);
  });

  it('persists item ordering independently inside each list', () => {
    expect(reconcileTodoItemOrder(['todo-2'], ['todo-1', 'todo-2', 'todo-3'])).toEqual([
      'todo-2',
      'todo-1',
      'todo-3',
    ]);
    expect(moveTodoItem(['todo-1', 'todo-2', 'todo-3'], 'todo-3', 'todo-1')).toEqual([
      'todo-3',
      'todo-1',
      'todo-2',
    ]);
  });

  it('places new desk cards and brings a grabbed card above overlapping cards', () => {
    const initial = reconcileDeskLayout({}, ['inbox', 'later'], 800);
    expect(initial).toEqual({
      inbox: defaultDeskCardPosition(0, 800),
      later: defaultDeskCardPosition(1, 800),
    });
    expect(bringDeskCardToFront(initial, 'inbox').inbox?.z).toBeGreaterThan(initial.later?.z ?? 0);
    expect(reconcileDeskLayout(initial, ['later', 'ideas'], 800)).toEqual({
      later: initial.later,
      ideas: defaultDeskCardPosition(1, 800),
    });
  });

  it('turns failed runtime and authentication requests into explicit error state', async () => {
    const failedRequest = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    }) as unknown as typeof fetch;
    const invalidJsonRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
    }) as unknown as typeof fetch;

    await expect(loadTodoRuntime(failedRequest)).resolves.toEqual({ status: 'error' });
    await expect(loadAuthenticationSession(invalidJsonRequest)).resolves.toEqual({
      status: 'error',
    });
  });

  it('preserves successful bootstrap values', async () => {
    const runtimeRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ storage: 'postgres' }),
    }) as unknown as typeof fetch;
    const authenticationRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ mode: 'github', authenticated: false }),
    }) as unknown as typeof fetch;

    await expect(loadTodoRuntime(runtimeRequest)).resolves.toEqual({
      status: 'ready',
      value: { storage: 'postgres' },
    });
    await expect(loadAuthenticationSession(authenticationRequest)).resolves.toEqual({
      status: 'ready',
      value: { mode: 'github', authenticated: false },
    });
  });
});
