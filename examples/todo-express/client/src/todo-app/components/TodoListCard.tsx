import { Check, ChevronDown, LoaderCircle, Palette, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

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
  const [dropTargetTodoId, setDropTargetTodoId] = useState<string>();
  const draggingTodoIdRef = useRef<string>();
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

  const startTodoDrag = (event: DragEvent<HTMLDivElement>, todoId: string) => {
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, form, a, [data-no-item-drag]')
    ) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', todoId);
    draggingTodoIdRef.current = todoId;
    setDraggingTodoId(todoId);
    closePopovers();
  };

  const dropTodo = (event: DragEvent, beforeTodoId?: string) => {
    const movingTodoId = draggingTodoIdRef.current;
    if (!movingTodoId || movingTodoId === beforeTodoId) return;
    event.preventDefault();
    event.stopPropagation();
    moveTodo(movingTodoId, beforeTodoId);
    draggingTodoIdRef.current = undefined;
    setDraggingTodoId(undefined);
    setDropTargetTodoId(undefined);
  };

  const finishTodoDrag = () => {
    draggingTodoIdRef.current = undefined;
    setDraggingTodoId(undefined);
    setDropTargetTodoId(undefined);
  };

  const startTodoPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, todoId: string) => {
    if (
      event.pointerType === 'mouse' ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest('button, input, form, a, [data-no-item-drag]'))
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingTodoIdRef.current = todoId;
    setDraggingTodoId(todoId);
    closePopovers();
  };

  const moveTodoPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const movingTodoId = draggingTodoIdRef.current;
    if (!movingTodoId || event.pointerType === 'mouse') return;
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-todo-id]');
    setDropTargetTodoId(
      target?.dataset.todoId === movingTodoId ? undefined : target?.dataset.todoId,
    );
  };

  const dropTodoPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const movingTodoId = draggingTodoIdRef.current;
    if (!movingTodoId || event.pointerType === 'mouse') return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-todo-id]');
    const beforeTodoId = target?.dataset.todoId;
    if (beforeTodoId !== movingTodoId) moveTodo(movingTodoId, beforeTodoId);
    finishTodoDrag();
  };

  const moveTodoBy = (todoId: string, direction: -1 | 1) => {
    const currentIndex = list.items.findIndex(todo => todo.id === todoId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= list.items.length) return;
    moveTodo(todoId, direction < 0 ? list.items[nextIndex]?.id : list.items[nextIndex + 1]?.id);
  };

  const completedCount = list.items.filter(todo => todo.completed).length;

  return (
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
              <h3
                className='list-name'
                onKeyDown={event => {
                  if (event.key === 'Enter') setIsEditingName(true);
                }}
                tabIndex={0}
                title='Double-click to collapse or expand'
              >
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
              <span>Delete?</span>
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
              disabled={!list.canDelete}
              aria-label={`Delete ${list.name}`}
              title={list.canDelete ? 'Delete list' : 'A list must be empty before deleting it'}
            >
              <Trash2 aria-hidden='true' />
            </button>
          )}
        </div>
      </header>

      {!isCollapsed ? (
        <>
          <div
            className='todo-stack'
            onDragOver={event => {
              if (draggingTodoIdRef.current && event.target === event.currentTarget) {
                event.preventDefault();
                setDropTargetTodoId('end');
              }
            }}
            onDrop={event => dropTodo(event)}
          >
            {list.items.map(todo => (
              <TodoItemCard
                key={todo.id}
                todo={todo}
                tags={tags}
                canComplete={canComplete}
                isCompleting={completingTodoId === todo.id}
                isDeleting={deletingTodoId === todo.id}
                isDragging={draggingTodoId === todo.id}
                isDropTarget={dropTargetTodoId === todo.id}
                isTagging={taggingTodoId === todo.id}
                deletingTagId={deletingTagId}
                isTagPickerOpen={openTagPickerTodoId === todo.id}
                closeTagPicker={closePopovers}
                toggleTagPicker={() => toggleTagPicker(todo.id)}
                startDragging={event => startTodoDrag(event, todo.id)}
                dragOver={event => {
                  if (draggingTodoIdRef.current && draggingTodoIdRef.current !== todo.id) {
                    event.preventDefault();
                    setDropTargetTodoId(todo.id);
                  }
                }}
                drop={event => dropTodo(event, todo.id)}
                finishDragging={finishTodoDrag}
                startPointerDragging={event => startTodoPointerDrag(event, todo.id)}
                movePointerDragging={moveTodoPointerDrag}
                dropPointer={dropTodoPointer}
                cancelPointerDragging={finishTodoDrag}
                moveBy={direction => moveTodoBy(todo.id, direction)}
                setTodoCompleted={setTodoCompleted}
                deleteTodo={deleteTodo}
                toggleTodoTag={toggleTodoTag}
                createTagForTodo={createTagForTodo}
                deleteTag={deleteTag}
              />
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
  );
};
