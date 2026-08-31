// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoList } from '../../../../src/generated/client-entities.js';

import { TodoListCard } from './TodoListCard.js';

type TodoListCardProps = ComponentProps<typeof TodoListCard>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const pointerEvent = (
  type: string,
  {
    x,
    y,
    pointerId = 1,
    isPrimary = true,
  }: { x: number; y: number; pointerId?: number; isPrimary?: boolean },
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'mouse' },
    isPrimary: { value: isPrimary },
  });
  return event;
};

const rect = (top: number, height: number) =>
  ({
    bottom: top + height,
    height,
    left: 0,
    right: 300,
    top,
    width: 300,
    x: 0,
    y: top,
    toJSON: () => undefined,
  }) satisfies DOMRect;

const createProps = (
  moveTodo: TodoListCardProps['moveTodo'],
  renameTodo: TodoListCardProps['renameTodo'] = vi.fn().mockResolvedValue(true),
  overrides: Partial<TodoListCardProps> = {},
): TodoListCardProps => ({
  list: {
    id: 'list-1',
    name: 'Inbox',
    color: '#f5ddd5',
    items: ['todo-1', 'todo-2', 'todo-3'].map((id, index) => ({
      id,
      list: TodoList.refById('list-1'),
      title: `Todo ${index + 1}`,
      completed: false,
      tags: [],
    })),
  },
  tags: [],
  canComplete: true,
  focusTodoInput: false,
  isCreatingTodo: false,
  isRenaming: false,
  isRecoloring: false,
  isDeleting: false,
  isDragging: false,
  isColorPickerOpen: false,
  closePopovers: vi.fn(),
  toggleTagPicker: vi.fn(),
  toggleColorPicker: vi.fn(),
  moveTodo,
  renameList: vi.fn().mockResolvedValue(true),
  recolorList: vi.fn().mockResolvedValue(true),
  deleteList: vi.fn().mockResolvedValue(true),
  createTodo: vi.fn().mockResolvedValue(true),
  setTodoCompleted: vi.fn().mockResolvedValue(true),
  renameTodo,
  deleteTodo: vi.fn().mockResolvedValue(true),
  toggleTodoTag: vi.fn().mockResolvedValue(true),
  createTagForTodo: vi.fn().mockResolvedValue(true),
  deleteTag: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe('TodoListCard item reordering', () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: boolean;

  beforeEach(() => {
    captured = false;
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value: vi.fn(() => {
          captured = true;
        }),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => captured),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(() => {
          captured = false;
        }),
      },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
    Reflect.deleteProperty(HTMLElement.prototype, 'hasPointerCapture');
    Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
  });

  it('previews the destination slot and commits the move only when released', () => {
    const moveTodo = vi.fn();
    act(() => root.render(<TodoListCard {...createProps(moveTodo)} />));

    const stack = container.querySelector<HTMLElement>('.todo-stack')!;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-todo-id]'));
    expect(items.every(item => item.parentElement?.getAttribute('role') === 'presentation')).toBe(
      true,
    );
    vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue(rect(0, 180));
    items.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(index * 60, 50));
    });
    act(() => items[0]!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 25 })));
    act(() => items[0]!.dispatchEvent(pointerEvent('pointermove', { x: 100, y: 100 })));

    expect(
      Array.from(container.querySelectorAll<HTMLElement>('[data-todo-id]')).map(
        item => item.dataset.todoId,
      ),
    ).toEqual(['todo-2', 'todo-1', 'todo-3']);
    expect(document.querySelector('[data-todo-drag-overlay]')?.textContent).toContain('Todo 1');
    expect(moveTodo).not.toHaveBeenCalled();

    act(() => items[0]!.dispatchEvent(pointerEvent('pointerup', { x: 100, y: 100 })));

    expect(moveTodo).toHaveBeenCalledWith('todo-1', 'todo-3');
    expect(document.querySelector('[data-todo-drag-overlay]')).toBeNull();
  });

  it('does not turn an ordinary click into a move', () => {
    const moveTodo = vi.fn();
    act(() => root.render(<TodoListCard {...createProps(moveTodo)} />));
    const firstItem = container.querySelector<HTMLElement>('[data-todo-id="todo-1"]')!;

    act(() => firstItem.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 25 })));
    act(() => firstItem.dispatchEvent(pointerEvent('pointerup', { x: 100, y: 25 })));

    expect(moveTodo).not.toHaveBeenCalled();
  });

  it('renames a todo inline after double-clicking its title', async () => {
    const renameTodo = vi.fn().mockResolvedValue(true);
    act(() => root.render(<TodoListCard {...createProps(vi.fn(), renameTodo)} />));

    const firstItem = container.querySelector<HTMLElement>('[data-todo-id="todo-1"]')!;
    act(() => firstItem.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Todo 1"]')!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      valueSetter.call(input, 'Renamed todo');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input
        .closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(renameTodo).toHaveBeenCalledWith('todo-1', 'Renamed todo');
    expect(container.querySelector('input[aria-label="Rename Todo 1"]')).toBeNull();
  });

  it('also opens inline rename from the item action', () => {
    act(() => root.render(<TodoListCard {...createProps(vi.fn())} />));

    const renameButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Rename Todo 1"]',
    )!;
    act(() => renameButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.querySelector('input[aria-label="Rename Todo 1"]')).not.toBeNull();
  });

  it('closes the tag picker after creating and assigning a new tag', async () => {
    const closePopovers = vi.fn();
    const createTagForTodo = vi.fn().mockResolvedValue(true);
    act(() =>
      root.render(
        <TodoListCard
          {...createProps(vi.fn(), vi.fn().mockResolvedValue(true), {
            closePopovers,
            createTagForTodo,
            openTagPickerTodoId: 'todo-1',
          })}
        />,
      ),
    );

    const input = container.querySelector<HTMLInputElement>('input[aria-label="New tag name"]')!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      valueSetter.call(input, 'New tag');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input
        .closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(createTagForTodo).toHaveBeenCalledWith('todo-1', 'New tag');
    expect(closePopovers).toHaveBeenCalledOnce();
  });

  it('supports keyboard rename entry and cancellation without dispatching unchanged titles', async () => {
    const renameTodo = vi.fn().mockResolvedValue(true);
    act(() => root.render(<TodoListCard {...createProps(vi.fn(), renameTodo)} />));

    const firstItem = container.querySelector<HTMLElement>('[data-todo-id="todo-1"]')!;
    act(() =>
      firstItem.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })),
    );

    let input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Todo 1"]')!;
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
    expect(container.querySelector('input[aria-label="Rename Todo 1"]')).toBeNull();

    act(() =>
      firstItem.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })),
    );
    input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Todo 1"]')!;
    await act(async () => {
      input
        .closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(renameTodo).not.toHaveBeenCalled();
    expect(container.querySelector('input[aria-label="Rename Todo 1"]')).toBeNull();
  });

  it('does not let another pointer replace the pending drag', () => {
    const moveTodo = vi.fn();
    act(() => root.render(<TodoListCard {...createProps(moveTodo)} />));

    const stack = container.querySelector<HTMLElement>('.todo-stack')!;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-todo-id]'));
    vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue(rect(0, 180));
    items.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(index * 60, 50));
    });

    act(() => items[0]!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 25 })));
    act(() =>
      items[1]!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 85, pointerId: 2 })),
    );
    act(() => items[0]!.dispatchEvent(pointerEvent('pointermove', { x: 100, y: 100 })));

    expect(document.querySelector('[data-todo-drag-overlay]')?.textContent).toContain('Todo 1');

    act(() => items[0]!.dispatchEvent(pointerEvent('pointerup', { x: 100, y: 100 })));

    expect(moveTodo).toHaveBeenCalledWith('todo-1', 'todo-3');
    expect(document.querySelector('[data-todo-drag-overlay]')).toBeNull();
  });

  it('does not begin a drag from a non-primary pointer', () => {
    const moveTodo = vi.fn();
    act(() => root.render(<TodoListCard {...createProps(moveTodo)} />));
    const firstItem = container.querySelector<HTMLElement>('[data-todo-id="todo-1"]')!;

    act(() =>
      firstItem.dispatchEvent(
        pointerEvent('pointerdown', { x: 100, y: 25, pointerId: 2, isPrimary: false }),
      ),
    );
    act(() =>
      firstItem.dispatchEvent(
        pointerEvent('pointermove', { x: 100, y: 100, pointerId: 2, isPrimary: false }),
      ),
    );

    expect(document.querySelector('[data-todo-drag-overlay]')).toBeNull();
    expect(moveTodo).not.toHaveBeenCalled();
  });

  it('cleans up a pending drag released outside the cards before the movement threshold', () => {
    const moveTodo = vi.fn();
    act(() => root.render(<TodoListCard {...createProps(moveTodo)} />));

    const stack = container.querySelector<HTMLElement>('.todo-stack')!;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-todo-id]'));
    vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue(rect(0, 180));
    items.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(index * 60, 50));
    });

    act(() => items[0]!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 25 })));
    expect(captured).toBe(false);

    act(() => document.dispatchEvent(pointerEvent('pointerup', { x: 400, y: 200 })));
    expect(captured).toBe(false);

    act(() => items[1]!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 85 })));
    act(() => items[1]!.dispatchEvent(pointerEvent('pointermove', { x: 100, y: 25 })));

    expect(document.querySelector('[data-todo-drag-overlay]')?.textContent).toContain('Todo 2');
    expect(moveTodo).not.toHaveBeenCalled();
  });
});
