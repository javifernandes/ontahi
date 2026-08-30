// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoList } from '../../../../src/generated/client-entities.js';

import { TodoListCard } from './TodoListCard.js';

type TodoListCardProps = ComponentProps<typeof TodoListCard>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const pointerEvent = (type: string, { x, y }: { x: number; y: number }) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
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

const createProps = (moveTodo: TodoListCardProps['moveTodo']): TodoListCardProps => ({
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
  deleteTodo: vi.fn().mockResolvedValue(true),
  toggleTodoTag: vi.fn().mockResolvedValue(true),
  createTagForTodo: vi.fn().mockResolvedValue(true),
  deleteTag: vi.fn().mockResolvedValue(true),
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
});
