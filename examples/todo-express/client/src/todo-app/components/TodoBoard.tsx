import { AlertCircle, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent, PointerEvent } from 'react';

import { moveTodoList, reconcileTodoListOrder } from '../todo-list-state.js';
import type { TodoAppModel } from '../use-todo-app.js';

import { TodoListCard } from './TodoListCard.js';

const listOrderStorageKey = 'ontahi.todo.list-order';

const storedListOrder = () => {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(listOrderStorageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const sameOrder = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

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
  deletingListId,
  completingTodoId,
  taggingTodoId,
  clearActionError,
  createList,
  renameList,
  deleteList,
  createTodo,
  completeTodo,
  toggleTodoTag,
  createTagForTodo,
}: TodoAppModel['dashboard']) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [listName, setListName] = useState('');
  const [orderedListIds, setOrderedListIds] = useState(storedListOrder);
  const [draggingListId, setDraggingListId] = useState<string>();
  const draggingListIdRef = useRef<string>();
  const [dropTargetListId, setDropTargetListId] = useState<string>();
  const [openTagPickerTodoId, setOpenTagPickerTodoId] = useState<string>();
  const availableListIds = useMemo(() => lists.map(list => list.id), [lists]);
  const reconciledListIds = useMemo(
    () => reconcileTodoListOrder(orderedListIds, availableListIds),
    [availableListIds, orderedListIds],
  );
  const orderedLists = useMemo(
    () =>
      reconciledListIds.flatMap(id => {
        const list = lists.find(candidate => candidate.id === id);
        return list ? [list] : [];
      }),
    [lists, reconciledListIds],
  );

  useEffect(() => {
    if (!isLoading && !sameOrder(orderedListIds, reconciledListIds)) {
      setOrderedListIds(reconciledListIds);
    }
  }, [isLoading, orderedListIds, reconciledListIds]);

  useEffect(() => {
    if (!isLoading) {
      globalThis.localStorage.setItem(listOrderStorageKey, JSON.stringify(orderedListIds));
    }
  }, [isLoading, orderedListIds]);

  const submitList = async (event: FormEvent) => {
    event.preventDefault();
    if (!(await createList(listName))) return;

    setListName('');
    setIsAddingList(false);
  };

  const finishDragging = () => {
    draggingListIdRef.current = undefined;
    setDraggingListId(undefined);
    setDropTargetListId(undefined);
  };

  const listDropTargetAt = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY);
    const listCard = target?.closest<HTMLElement>('[data-list-id]');
    if (listCard?.dataset.listId) return listCard.dataset.listId;
    return target?.closest('[data-list-drop="end"]') ? 'end' : undefined;
  };

  const startDragging = (event: PointerEvent, listId: string) => {
    if (event.button !== 0 || event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingListIdRef.current = listId;
    setDraggingListId(listId);
    setOpenTagPickerTodoId(undefined);
  };

  const moveDragging = (event: PointerEvent) => {
    const movingListId = draggingListIdRef.current;
    if (!movingListId) return;
    event.preventDefault();
    const targetListId = listDropTargetAt(event.clientX, event.clientY);
    setDropTargetListId(targetListId === movingListId ? undefined : targetListId);
  };

  const dropList = (event: PointerEvent) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const targetListId = listDropTargetAt(event.clientX, event.clientY);
    const movingListId = draggingListIdRef.current;
    if (movingListId && targetListId && targetListId !== movingListId) {
      setOrderedListIds(current =>
        moveTodoList(
          reconcileTodoListOrder(current, availableListIds),
          movingListId,
          targetListId === 'end' ? undefined : targetListId,
        ),
      );
    }
    finishDragging();
  };

  const startNativeDragging = (event: DragEvent, listId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', listId);
    draggingListIdRef.current = listId;
    setDraggingListId(listId);
    setOpenTagPickerTodoId(undefined);
  };

  const nativeDragOver = (event: DragEvent, targetListId?: string) => {
    const movingListId = draggingListIdRef.current;
    if (!movingListId || movingListId === targetListId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetListId(targetListId ?? 'end');
  };

  const nativeDrop = (event: DragEvent, beforeListId?: string) => {
    event.preventDefault();
    const movingListId = draggingListIdRef.current;
    if (movingListId && movingListId !== beforeListId) {
      setOrderedListIds(current =>
        moveTodoList(reconcileTodoListOrder(current, availableListIds), movingListId, beforeListId),
      );
    }
    finishDragging();
  };

  const moveListBy = (listId: string, direction: -1 | 1) => {
    setOrderedListIds(current => {
      const orderedIds = reconcileTodoListOrder(current, availableListIds);
      const currentIndex = orderedIds.indexOf(listId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return orderedIds;

      return moveTodoList(
        orderedIds,
        listId,
        direction < 0 ? orderedIds[nextIndex] : orderedIds[nextIndex + 1],
      );
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

      <div className='list-grid'>
        {orderedLists.map(list => (
          <TodoListCard
            key={list.id}
            list={list}
            tags={tags}
            canComplete={canComplete}
            isCreatingTodo={creatingTodoFor === list.id}
            isRenaming={renamingListId === list.id}
            isDeleting={deletingListId === list.id}
            isDragging={draggingListId === list.id}
            isDropTarget={dropTargetListId === list.id}
            completingTodoId={completingTodoId}
            taggingTodoId={taggingTodoId}
            openTagPickerTodoId={openTagPickerTodoId}
            startDragging={event => startDragging(event, list.id)}
            startNativeDragging={event => startNativeDragging(event, list.id)}
            moveDragging={moveDragging}
            drop={dropList}
            nativeDragOver={event => nativeDragOver(event, list.id)}
            nativeDrop={event => nativeDrop(event, list.id)}
            moveListBy={direction => moveListBy(list.id, direction)}
            finishDragging={finishDragging}
            closeTagPicker={() => setOpenTagPickerTodoId(undefined)}
            toggleTagPicker={todoId =>
              setOpenTagPickerTodoId(current => (current === todoId ? undefined : todoId))
            }
            renameList={renameList}
            deleteList={deleteList}
            createTodo={createTodo}
            completeTodo={completeTodo}
            toggleTodoTag={toggleTodoTag}
            createTagForTodo={createTagForTodo}
          />
        ))}

        {isAddingList ? (
          <form
            className={`new-list-card${dropTargetListId === 'end' ? ' drop-target' : ''}`}
            onSubmit={submitList}
            data-list-drop='end'
            onDragOver={event => nativeDragOver(event)}
            onDrop={event => nativeDrop(event)}
          >
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
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
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
            className={`add-list-card${dropTargetListId === 'end' ? ' drop-target' : ''}`}
            onClick={() => {
              setOpenTagPickerTodoId(undefined);
              setIsAddingList(true);
            }}
            data-list-drop='end'
            onDragOver={event => nativeDragOver(event)}
            onDrop={event => nativeDrop(event)}
          >
            <span>
              <Plus aria-hidden='true' />
            </span>
            Add another list
          </button>
        )}
      </div>
    </section>
  );
};
