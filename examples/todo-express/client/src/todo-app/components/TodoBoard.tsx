import { AlertCircle, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent } from 'react';

import {
  bringDeskCardToFront,
  defaultDeskCardPosition,
  moveTodoItem,
  reconcileDeskLayout,
  reconcileTodoItemOrder,
  reconcileTodoListOrder,
  type DeskLayout,
} from '../todo-list-state.js';
import type { TodoAppModel } from '../use-todo-app.js';

import { TodoListCard } from './TodoListCard.js';

const listOrderStorageKey = 'ontahi.todo.list-order';
const itemOrderStorageKey = 'ontahi.todo.item-order';
const deskLayoutStorageKey = 'ontahi.todo.desk-layout';

const storedStringArray = (key: string) => {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const storedItemOrder = () => {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(itemOrderStorageKey) ?? '{}');
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};

    return Object.fromEntries(
      Object.entries(stored).flatMap(([listId, itemIds]) =>
        Array.isArray(itemIds)
          ? [[listId, itemIds.filter(itemId => typeof itemId === 'string')]]
          : [],
      ),
    ) as Record<string, string[]>;
  } catch {
    return {};
  }
};

const storedDeskLayout = () => {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(deskLayoutStorageKey) ?? '{}');
    return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as DeskLayout)
      : {};
  } catch {
    return {};
  }
};

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const cardPositionStyle = (position: { x: number; y: number; z: number }): CSSProperties => ({
  left: position.x,
  top: position.y,
  zIndex: position.z,
});

type CardDrag = {
  id: string;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

export const TodoBoard = ({
  lists,
  tags,
  isLoading,
  isError,
  actionError,
  canComplete,
  isCreatingList,
  creatingTodoFor,
  renamingListId,
  recoloringListId,
  deletingListId,
  completingTodoId,
  renamingTodoId,
  deletingTodoId,
  taggingTodoId,
  deletingTagId,
  clearActionError,
  createList,
  renameList,
  recolorList,
  deleteList,
  createTodo,
  setTodoCompleted,
  renameTodo,
  deleteTodo,
  toggleTodoTag,
  createTagForTodo,
  deleteTag,
}: TodoAppModel['dashboard']) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [listName, setListName] = useState('');
  const [focusTodoForListId, setFocusTodoForListId] = useState<string>();
  const [orderedListIds, setOrderedListIds] = useState(() =>
    storedStringArray(listOrderStorageKey),
  );
  const [itemOrderByList, setItemOrderByList] = useState(storedItemOrder);
  const [deskLayout, setDeskLayout] = useState(storedDeskLayout);
  const [canvasWidth, setCanvasWidth] = useState(1380);
  const [canvasHeight, setCanvasHeight] = useState(600);
  const [draggingListId, setDraggingListId] = useState<string>();
  const [openTagPickerTodoId, setOpenTagPickerTodoId] = useState<string>();
  const [openColorPickerListId, setOpenColorPickerListId] = useState<string>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardDrag = useRef<CardDrag>();
  const availableListIds = useMemo(() => lists.map(list => list.id), [lists]);
  const reconciledListIds = useMemo(
    () => reconcileTodoListOrder(orderedListIds, availableListIds),
    [availableListIds, orderedListIds],
  );
  const orderedLists = useMemo(
    () =>
      reconciledListIds.flatMap(id => {
        const list = lists.find(candidate => candidate.id === id);
        if (!list) return [];
        const availableItemIds = list.items.map(todo => todo.id);
        const itemIds = reconcileTodoItemOrder(itemOrderByList[id] ?? [], availableItemIds);
        return [
          {
            ...list,
            items: itemIds.flatMap(itemId => {
              const todo = list.items.find(candidate => candidate.id === itemId);
              return todo ? [todo] : [];
            }),
          },
        ];
      }),
    [itemOrderByList, lists, reconciledListIds],
  );
  const reconciledDeskLayout = useMemo(
    () => reconcileDeskLayout(deskLayout, reconciledListIds, canvasWidth),
    [canvasWidth, deskLayout, reconciledListIds],
  );
  const addListPosition = defaultDeskCardPosition(orderedLists.length, canvasWidth);

  useEffect(() => {
    if (!isLoading && !sameValue(orderedListIds, reconciledListIds)) {
      setOrderedListIds(reconciledListIds);
    }
  }, [isLoading, orderedListIds, reconciledListIds]);

  useEffect(() => {
    if (!isLoading && !sameValue(deskLayout, reconciledDeskLayout)) {
      setDeskLayout(reconciledDeskLayout);
    }
  }, [deskLayout, isLoading, reconciledDeskLayout]);

  useEffect(() => {
    if (isLoading) return;

    const reconciledItemOrder = Object.fromEntries(
      lists.map(list => [
        list.id,
        reconcileTodoItemOrder(
          itemOrderByList[list.id] ?? [],
          list.items.map(todo => todo.id),
        ),
      ]),
    );
    if (!sameValue(itemOrderByList, reconciledItemOrder)) {
      setItemOrderByList(reconciledItemOrder);
    }
  }, [isLoading, itemOrderByList, lists]);

  useEffect(() => {
    if (isLoading) return;
    globalThis.localStorage.setItem(listOrderStorageKey, JSON.stringify(orderedListIds));
    globalThis.localStorage.setItem(itemOrderStorageKey, JSON.stringify(itemOrderByList));
    globalThis.localStorage.setItem(deskLayoutStorageKey, JSON.stringify(deskLayout));
  }, [deskLayout, isLoading, itemOrderByList, orderedListIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      setCanvasWidth(canvas.clientWidth);
      if (globalThis.matchMedia('(max-width: 700px)').matches) return;
      const cards = Array.from(canvas.querySelectorAll<HTMLElement>('[data-desk-card]'));
      setCanvasHeight(Math.max(600, ...cards.map(card => card.offsetTop + card.offsetHeight + 36)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas.querySelectorAll('[data-desk-card]').forEach(card => observer.observe(card));
    measure();
    return () => observer.disconnect();
  }, [deskLayout, isAddingList, orderedLists]);

  const closePopovers = () => {
    setOpenTagPickerTodoId(undefined);
    setOpenColorPickerListId(undefined);
  };

  const submitList = async (event: FormEvent) => {
    event.preventDefault();
    const createdListId = await createList(listName);
    if (!createdListId) return;

    setFocusTodoForListId(createdListId);
    setListName('');
    setIsAddingList(false);
  };

  const beginCardDrag = (event: PointerEvent<HTMLDivElement>, listId: string) => {
    if (
      event.button !== 0 ||
      globalThis.matchMedia('(max-width: 700px)').matches ||
      (event.target instanceof Element &&
        event.target.closest('button, input, form, a, .todo-item-card, [data-no-card-drag]'))
    ) {
      return;
    }

    const position = reconciledDeskLayout[listId];
    if (!position) return;
    cardDrag.current = {
      id: listId,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    setDeskLayout(current => bringDeskCardToFront(current, listId));
    closePopovers();
  };

  const moveCard = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cardDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.pointerX;
    const deltaY = event.clientY - drag.pointerY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;

    if (!drag.moved) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    setDraggingListId(drag.id);
    setDeskLayout(current => {
      const position = current[drag.id];
      if (!position) return current;
      return {
        ...current,
        [drag.id]: {
          x: Math.max(0, Math.min(drag.originX + deltaX, Math.max(0, canvasWidth - 250))),
          y: Math.max(0, drag.originY + deltaY),
          z: position.z,
        },
      };
    });
  };

  const finishCardDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cardDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cardDrag.current = undefined;
    setDraggingListId(undefined);
  };

  const moveTodo = (listId: string, movingTodoId: string, beforeTodoId?: string) => {
    const list = lists.find(candidate => candidate.id === listId);
    if (!list) return;
    setItemOrderByList(current => ({
      ...current,
      [listId]: moveTodoItem(
        reconcileTodoItemOrder(
          current[listId] ?? [],
          list.items.map(todo => todo.id),
        ),
        movingTodoId,
        beforeTodoId,
      ),
    }));
  };

  const moveCardByKeyboard = (
    listId: string,
    direction: 'up' | 'right' | 'down' | 'left',
    distance: number,
  ) => {
    setDeskLayout(current => {
      const position = current[listId];
      if (!position) return current;
      const moved = {
        ...position,
        x:
          direction === 'left'
            ? Math.max(0, position.x - distance)
            : direction === 'right'
              ? Math.min(Math.max(0, canvasWidth - 250), position.x + distance)
              : position.x,
        y:
          direction === 'up'
            ? Math.max(0, position.y - distance)
            : direction === 'down'
              ? position.y + distance
              : position.y,
      };
      return bringDeskCardToFront({ ...current, [listId]: moved }, listId);
    });
  };

  return (
    <section className='todo-dashboard' aria-label='Todo lists'>
      {actionError ? (
        <div className='action-error' role='alert'>
          <AlertCircle aria-hidden='true' />
          <span>{actionError}</span>
          <button type='button' onClick={clearActionError} aria-label='Dismiss error'>
            <X aria-hidden='true' />
          </button>
        </div>
      ) : null}

      {isError ? <p className='board-message error'>The board could not be loaded.</p> : null}
      {isLoading ? <p className='board-message muted'>Loading your lists…</p> : null}

      <div ref={canvasRef} className='list-desk' style={{ height: canvasHeight }}>
        {orderedLists.map(list => {
          const position = reconciledDeskLayout[list.id] ?? defaultDeskCardPosition(0, canvasWidth);
          return (
            <div
              key={list.id}
              className='desk-card-shell'
              style={cardPositionStyle(position)}
              data-desk-card
              tabIndex={0}
              role='group'
              aria-label={`Move ${list.name} card. Drag it or use arrow keys.`}
              onPointerDown={event => beginCardDrag(event, list.id)}
              onPointerMove={moveCard}
              onPointerUp={finishCardDrag}
              onPointerCancel={finishCardDrag}
              onKeyDown={event => {
                if (event.target !== event.currentTarget || !event.key.startsWith('Arrow')) return;
                event.preventDefault();
                const direction = event.key.slice(5).toLowerCase() as
                  | 'up'
                  | 'right'
                  | 'down'
                  | 'left';
                moveCardByKeyboard(list.id, direction, event.shiftKey ? 60 : 18);
              }}
            >
              <TodoListCard
                list={list}
                tags={tags}
                canComplete={canComplete}
                focusTodoInput={focusTodoForListId === list.id}
                isCreatingTodo={creatingTodoFor === list.id}
                isRenaming={renamingListId === list.id}
                isRecoloring={recoloringListId === list.id}
                isDeleting={deletingListId === list.id}
                isDragging={draggingListId === list.id}
                completingTodoId={completingTodoId}
                renamingTodoId={renamingTodoId}
                deletingTodoId={deletingTodoId}
                taggingTodoId={taggingTodoId}
                deletingTagId={deletingTagId}
                openTagPickerTodoId={openTagPickerTodoId}
                isColorPickerOpen={openColorPickerListId === list.id}
                closePopovers={closePopovers}
                toggleTagPicker={todoId => {
                  setOpenColorPickerListId(undefined);
                  setOpenTagPickerTodoId(current => (current === todoId ? undefined : todoId));
                }}
                toggleColorPicker={() => {
                  setOpenTagPickerTodoId(undefined);
                  setOpenColorPickerListId(current => (current === list.id ? undefined : list.id));
                }}
                moveTodo={(movingTodoId, beforeTodoId) =>
                  moveTodo(list.id, movingTodoId, beforeTodoId)
                }
                renameList={renameList}
                recolorList={recolorList}
                deleteList={deleteList}
                createTodo={createTodo}
                setTodoCompleted={setTodoCompleted}
                renameTodo={renameTodo}
                deleteTodo={deleteTodo}
                toggleTodoTag={toggleTodoTag}
                createTagForTodo={createTagForTodo}
                deleteTag={deleteTag}
              />
            </div>
          );
        })}

        <div
          className='desk-new-list'
          style={cardPositionStyle({ ...addListPosition, z: 0 })}
          data-desk-card
        >
          {isAddingList ? (
            <form className='new-list-card' onSubmit={submitList}>
              <div className='new-list-card-icon'>
                <Plus aria-hidden='true' />
              </div>
              <input
                autoFocus
                aria-label='New list name'
                value={listName}
                onChange={event => setListName(event.target.value)}
                placeholder='Name this list'
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    setListName('');
                    setIsAddingList(false);
                  }
                }}
              />
              <div className='inline-actions'>
                <button
                  type='button'
                  className='text-button'
                  onClick={() => {
                    setListName('');
                    setIsAddingList(false);
                  }}
                >
                  Cancel
                </button>
                <button type='submit' className='primary-action' disabled={!listName.trim()}>
                  {isCreatingList ? 'Creating…' : 'Create list'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type='button'
              className='add-list-card'
              onClick={() => {
                closePopovers();
                setIsAddingList(true);
              }}
            >
              <span>
                <Plus aria-hidden='true' />
              </span>
              Add another list
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
