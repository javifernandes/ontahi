// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoBoard } from './TodoBoard.js';

type TodoBoardProps = ComponentProps<typeof TodoBoard>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const createProps = (overrides: Partial<TodoBoardProps> = {}): TodoBoardProps => ({
  lists: [],
  tags: [],
  isLoading: false,
  isError: false,
  actionError: undefined,
  canComplete: true,
  isCreatingList: false,
  creatingTodoFor: undefined,
  renamingListId: undefined,
  recoloringListId: undefined,
  deletingListId: undefined,
  completingListId: undefined,
  completingTodoId: undefined,
  renamingTodoId: undefined,
  deletingTodoId: undefined,
  taggingTodoId: undefined,
  deletingTagId: undefined,
  clearActionError: vi.fn(),
  createList: vi.fn().mockResolvedValue('list-new') as unknown as TodoBoardProps['createList'],
  renameList: vi.fn().mockResolvedValue(true),
  recolorList: vi.fn().mockResolvedValue(true),
  deleteList: vi.fn().mockResolvedValue(true),
  completeAllTodos: vi.fn().mockResolvedValue(true),
  completeAll: {
    isExecuting: false,
    isQueued: false,
    isRunning: false,
    isCompleted: false,
    progress: undefined,
    finalValue: undefined,
  },
  createTodo: vi.fn().mockResolvedValue(true),
  setTodoCompleted: vi.fn().mockResolvedValue(true),
  renameTodo: vi.fn().mockResolvedValue(true),
  deleteTodo: vi.fn().mockResolvedValue(true),
  toggleTodoTag: vi.fn().mockResolvedValue(true),
  createTagForTodo: vi.fn().mockResolvedValue(true),
  deleteTag: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe('TodoBoard list creation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const storedValues = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => storedValues.clear(),
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    globalThis.localStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('focuses quick add when the newly created list appears', async () => {
    const createList = vi
      .fn()
      .mockResolvedValue('list-new') as unknown as TodoBoardProps['createList'];
    const props = createProps({ createList });
    act(() => root.render(<TodoBoard {...props} />));

    act(() =>
      container
        .querySelector<HTMLButtonElement>('.add-list-card')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    const listName = container.querySelector<HTMLInputElement>(
      'input[aria-label="New list name"]',
    )!;
    act(() => setInputValue(listName, 'Focused list'));
    await act(async () => {
      listName
        .closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(createList).toHaveBeenCalledWith('Focused list');

    act(() =>
      root.render(
        <TodoBoard
          {...props}
          lists={[
            {
              id: 'list-new',
              name: 'Focused list',
              color: '#f5ddd5',
              items: [],
            },
          ]}
        />,
      ),
    );

    const quickAdd = container.querySelector<HTMLInputElement>(
      'input[aria-label="Add a todo to Focused list"]',
    )!;
    expect(document.activeElement).toBe(quickAdd);
  });
});
