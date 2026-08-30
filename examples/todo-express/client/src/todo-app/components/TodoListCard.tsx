import { Check, ChevronDown, LoaderCircle, Palette, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { moveTodoItem, resolveTodoDropDestination } from '../todo-list-state.js';
import { listPastelColors, type TodoAppModel } from '../use-todo-app.js';

import { TodoItemCard } from './TodoItemCard.js';

type Dashboard = TodoAppModel['dashboard'];
type TodoListCardProps = {
  list: Dashboard['lists'][number];
  tags: Dashboard['tags'];
  canComplete: boolean;
  isCreatingTodo: boolean;
  isRenaming: boolean;
  isRecoloring: boolean;
  isDeleting: boolean;
  isDragging: boolean;
  completingTodoId?: string;
  deletingTodoId?: string;
  taggingTodoId?: string;
  deletingTagId?: string;
  openTagPickerTodoId?: string;
  isColorPickerOpen: boolean;
  closePopovers: () => void;
  toggleTagPicker: (todoId: string) => void;
  toggleColorPicker: () => void;
  moveTodo: (movingTodoId: string, beforeTodoId?: string) => void;
  renameList: Dashboard['renameList'];
  recolorList: Dashboard['recolorList'];
  deleteList: Dashboard['deleteList'];
  createTodo: Dashboard['createTodo'];
  setTodoCompleted: Dashboard['setTodoCompleted'];
  deleteTodo: Dashboard['deleteTodo'];
  toggleTodoTag: Dashboard['toggleTodoTag'];
  createTagForTodo: Dashboard['createTagForTodo'];
  deleteTag: Dashboard['deleteTag'];
};

const listStyle = (color: string) => ({ '--list-color': color }) as CSSProperties;

type TodoDropPreview = { beforeTodoId?: string };

type TodoPointerDrag = {
  id: string;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  moved: boolean;
};

type TodoDragOverlay = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const tagStyle = (color: string) => ({ '--tag-color': color }) as CSSProperties;

export const TodoListCard = ({
  list,
  tags,
  canComplete,
  isCreatingTodo,
  isRenaming,
  isRecoloring,
  isDeleting,
  isDragging,
  completingTodoId,
  deletingTodoId,
  taggingTodoId,
  deletingTagId,
  openTagPickerTodoId,
  isColorPickerOpen,
  closePopovers,
  toggleTagPicker,
  toggleColorPicker,
  moveTodo,
  renameList,
  recolorList,
  deleteList,
  createTodo,
  setTodoCompleted,
  deleteTodo,
  toggleTodoTag,
  createTagForTodo,
  deleteTag,
}: TodoListCardProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [todoTitle, setTodoTitle] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggingTodoId, setDraggingTodoId] = useState<string>();
  const [todoDropPreview, setTodoDropPreview] = useState<TodoDropPreview>();
  const [todoDragOverlay, setTodoDragOverlay] = useState<TodoDragOverlay>();
  const draggingTodoIdRef = useRef<string>();
  const todoDropPreviewRef = useRef<TodoDropPreview>();
  const todoPointerDrag = useRef<TodoPointerDrag>();
  const todoStack = useRef<HTMLDivElement>(null);
  const colorControl = useRef<HTMLDivElement>(null);

  useEffect(() => setNameDraft(list.name), [list.name]);

  useEffect(() => {
    if (!isColorPickerOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !colorControl.current?.contains(event.target)) {
        closePopovers();
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePopovers();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closePopovers, isColorPickerOpen]);

  const cancelRename = () => {
    setNameDraft(list.name);
    setIsEditingName(false);
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (nameDraft.trim() === list.name) {
      setIsEditingName(false);
      return;
    }

    if (await renameList(list.id, nameDraft)) setIsEditingName(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') cancelRename();
  };

  const submitTodo = async (event: FormEvent) => {
    event.preventDefault();
    if (await createTodo(list.id, todoTitle)) setTodoTitle('');
  };

  const updateTodoDropPreview = (preview?: TodoDropPreview) => {
    todoDropPreviewRef.current = preview;
    setTodoDropPreview(current => {
      if (!current && !preview) return current;
      if (current && preview && current.beforeTodoId === preview.beforeTodoId) return current;
      return preview;
    });
  };

  const finishTodoDrag = () => {
    todoPointerDrag.current = undefined;
    draggingTodoIdRef.current = undefined;
    setDraggingTodoId(undefined);
    setTodoDragOverlay(undefined);
    updateTodoDropPreview(undefined);
  };

  const previewTodoDrop = (targetTodoId: string, pointerY: number, target: HTMLElement) => {
    const movingTodoId = draggingTodoIdRef.current;
    if (!movingTodoId) return;
    const bounds = target.getBoundingClientRect();
    const destination = resolveTodoDropDestination(
      list.items.map(todo => todo.id),
      movingTodoId,
      targetTodoId,
      pointerY < bounds.top + bounds.height / 2 ? 'before' : 'after',
    );
    updateTodoDropPreview(destination);
  };

  const previewTodoDropFromPoint = (pointerX: number, pointerY: number) => {
    const stack = todoStack.current;
    const movingTodoId = draggingTodoIdRef.current;
    if (!stack || !movingTodoId) return;
    const stackBounds = stack.getBoundingClientRect();
    if (
      pointerX < stackBounds.left ||
      pointerX > stackBounds.right ||
      pointerY < stackBounds.top ||
      pointerY > stackBounds.bottom
    ) {
      updateTodoDropPreview(undefined);
      return;
    }

    const targetTodo = Array.from(stack.querySelectorAll<HTMLElement>('[data-todo-id]'))
      .filter(candidate => candidate.dataset.todoId !== movingTodoId)
      .find(candidate => pointerY < candidate.getBoundingClientRect().bottom);
    if (targetTodo?.dataset.todoId) {
      previewTodoDrop(targetTodo.dataset.todoId, pointerY, targetTodo);
      return;
    }
    updateTodoDropPreview({ beforeTodoId: undefined });
  };

  const commitTodoDrop = () => {
    const movingTodoId = draggingTodoIdRef.current;
    const preview = todoDropPreviewRef.current;
    if (movingTodoId && preview) moveTodo(movingTodoId, preview.beforeTodoId);
    finishTodoDrag();
  };

  const startTodoPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, todoId: string) => {
    if (
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest('button, input, form, a, [data-no-item-drag]'))
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    todoPointerDrag.current = {
      id: todoId,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
    updateTodoDropPreview(undefined);
  };

  const moveTodoPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = todoPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) < 5
    ) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingTodoIdRef.current = drag.id;
      setDraggingTodoId(drag.id);
      closePopovers();
    }
    event.preventDefault();
    setTodoDragOverlay({
      left: event.clientX - drag.offsetX,
      top: event.clientY - drag.offsetY,
      width: drag.width,
      height: drag.height,
    });
    previewTodoDropFromPoint(event.clientX, event.clientY);
  };

  const dropTodoPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = todoPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) {
      finishTodoDrag();
      return;
    }
    previewTodoDropFromPoint(event.clientX, event.clientY);
    commitTodoDrop();
  };

  const cancelTodoPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = todoPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishTodoDrag();
  };

  const moveTodoBy = (todoId: string, direction: -1 | 1) => {
    const currentIndex = list.items.findIndex(todo => todo.id === todoId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= list.items.length) return;
    moveTodo(todoId, direction < 0 ? list.items[nextIndex]?.id : list.items[nextIndex + 1]?.id);
  };

  const completedCount = list.items.filter(todo => todo.completed).length;
  const previewItemIds =
    draggingTodoId && todoDropPreview
      ? moveTodoItem(
          list.items.map(todo => todo.id),
          draggingTodoId,
          todoDropPreview.beforeTodoId,
        )
      : list.items.map(todo => todo.id);
  const previewItems = previewItemIds.flatMap(id => {
    const todo = list.items.find(candidate => candidate.id === id);
    return todo ? [todo] : [];
  });
  const draggingTodo = list.items.find(todo => todo.id === draggingTodoId);

  return (
    <>
      <article
        className={`list-card${isCollapsed ? ' collapsed' : ''}${isDragging ? ' dragging' : ''}`}
        data-list-id={list.id}
        style={listStyle(list.color)}
      >
        <header
          className='list-card-header'
          onDoubleClick={event => {
            if (event.target instanceof Element && event.target.closest('button, input, form'))
              return;
            closePopovers();
            setIsCollapsed(current => !current);
          }}
          title='Double-click to collapse or expand'
        >
          <div className='list-title-block'>
            {isEditingName ? (
              <form className='rename-list-form' onSubmit={submitRename}>
                <input
                  autoFocus
                  aria-label={`Rename ${list.name}`}
                  value={nameDraft}
                  onChange={event => setNameDraft(event.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onFocus={event => event.target.select()}
                />
                <button type='submit' className='icon-button confirm' aria-label='Save list name'>
                  {isRenaming ? (
                    <LoaderCircle className='spin' aria-hidden='true' />
                  ) : (
                    <Check aria-hidden='true' />
                  )}
                </button>
                <button
                  type='button'
                  className='icon-button'
                  onClick={cancelRename}
                  aria-label='Cancel rename'
                >
                  <X aria-hidden='true' />
                </button>
              </form>
            ) : (
              <div className='list-name-row'>
                <h3 className='list-name' title='Double-click to collapse or expand'>
                  {list.name}
                </h3>
                <button
                  type='button'
                  className='icon-button edit-list'
                  onClick={() => setIsEditingName(true)}
                  aria-label={`Rename ${list.name}`}
                >
                  <Pencil aria-hidden='true' />
                </button>
              </div>
            )}
            <p>
              {list.items.length === 0
                ? 'Empty list'
                : `${list.items.length - completedCount} open · ${completedCount} done`}
            </p>
          </div>

          <div className='list-card-controls'>
            <div className='color-control' ref={colorControl}>
              <button
                type='button'
                className='icon-button color-list'
                onClick={toggleColorPicker}
                aria-label={`Change ${list.name} color`}
                aria-expanded={isColorPickerOpen}
              >
                {isRecoloring ? (
                  <LoaderCircle className='spin' aria-hidden='true' />
                ) : (
                  <Palette aria-hidden='true' />
                )}
              </button>
              {isColorPickerOpen ? (
                <div className='color-popover' aria-label={`Colors for ${list.name}`}>
                  {listPastelColors.map(color => (
                    <button
                      key={color}
                      type='button'
                      className={`color-swatch${list.color === color ? ' selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={async () => {
                        if (await recolorList(list.id, color)) closePopovers();
                      }}
                      aria-label={`Use ${color}`}
                      aria-pressed={list.color === color}
                    >
                      {list.color === color ? <Check aria-hidden='true' /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type='button'
              className='icon-button collapse-list'
              onClick={() => {
                closePopovers();
                setIsCollapsed(current => !current);
              }}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${list.name}`}
              aria-expanded={!isCollapsed}
            >
              <ChevronDown aria-hidden='true' />
            </button>

            {isConfirmingDelete ? (
              <div className='delete-confirmation'>
                <span>
                  {list.items.length > 0
                    ? `Delete ${list.items.length} ${list.items.length === 1 ? 'item' : 'items'}?`
                    : 'Delete?'}
                </span>
                <button
                  type='button'
                  className='icon-button danger-icon'
                  aria-label={`Confirm delete ${list.name}`}
                  onClick={async () => {
                    if (await deleteList(list.id)) setIsConfirmingDelete(false);
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <LoaderCircle className='spin' aria-hidden='true' />
                  ) : (
                    <Check aria-hidden='true' />
                  )}
                </button>
                <button
                  type='button'
                  className='icon-button'
                  onClick={() => setIsConfirmingDelete(false)}
                  aria-label='Cancel list deletion'
                >
                  <X aria-hidden='true' />
                </button>
              </div>
            ) : (
              <button
                type='button'
                className='icon-button delete-list'
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isDeleting}
                aria-label={`Delete ${list.name}`}
                title='Delete list and its items'
              >
                <Trash2 aria-hidden='true' />
              </button>
            )}
          </div>
        </header>

        {!isCollapsed ? (
          <>
            <div ref={todoStack} className='todo-stack' role='list'>
              {previewItems.map(todo => (
                <div className='todo-sort-slot' key={todo.id}>
                  <TodoItemCard
                    todo={todo}
                    tags={tags}
                    canComplete={canComplete}
                    isCompleting={completingTodoId === todo.id}
                    isDeleting={deletingTodoId === todo.id}
                    isDragging={draggingTodoId === todo.id}
                    isTagging={taggingTodoId === todo.id}
                    deletingTagId={deletingTagId}
                    isTagPickerOpen={openTagPickerTodoId === todo.id}
                    closeTagPicker={closePopovers}
                    toggleTagPicker={() => toggleTagPicker(todo.id)}
                    startPointerDragging={event => startTodoPointerDrag(event, todo.id)}
                    movePointerDragging={moveTodoPointerDrag}
                    dropPointer={dropTodoPointer}
                    cancelPointerDragging={cancelTodoPointerDrag}
                    moveBy={direction => moveTodoBy(todo.id, direction)}
                    setTodoCompleted={setTodoCompleted}
                    deleteTodo={deleteTodo}
                    toggleTodoTag={toggleTodoTag}
                    createTagForTodo={createTagForTodo}
                    deleteTag={deleteTag}
                  />
                </div>
              ))}

              {list.items.length === 0 ? (
                <div className='empty-list-state'>
                  <span>Nothing here yet.</span>
                  <small>Add the first item below.</small>
                </div>
              ) : null}
            </div>

            <form className='quick-add' onSubmit={submitTodo}>
              <Plus aria-hidden='true' />
              <input
                aria-label={`Add a todo to ${list.name}`}
                value={todoTitle}
                onChange={event => setTodoTitle(event.target.value)}
                placeholder='Add a todo…'
              />
              <button type='submit' disabled={!todoTitle.trim() || isCreatingTodo}>
                {isCreatingTodo ? 'Adding…' : 'Add'}
              </button>
            </form>
          </>
        ) : null}
      </article>

      {draggingTodo && todoDragOverlay
        ? createPortal(
            <div
              className={`todo-drag-overlay${draggingTodo.completed ? ' completed' : ''}`}
              data-todo-drag-overlay
              style={todoDragOverlay}
              aria-hidden='true'
            >
              <span className='todo-drag-check'>
                {draggingTodo.completed ? <Check aria-hidden='true' /> : null}
              </span>
              <div className='todo-item-copy'>
                <span>{draggingTodo.title}</span>
                {draggingTodo.tags.length > 0 ? (
                  <div className='assigned-tags'>
                    {draggingTodo.tags.map(tag => (
                      <small key={tag.id} className='tag-badge' style={tagStyle(tag.color)}>
                        <span>{tag.name}</span>
                      </small>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
