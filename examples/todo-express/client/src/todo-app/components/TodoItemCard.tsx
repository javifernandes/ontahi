import { Check, LoaderCircle, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import type { TodoAppModel } from '../use-todo-app.js';

type Dashboard = TodoAppModel['dashboard'];
type TodoItemCardProps = {
  todo: Dashboard['lists'][number]['items'][number];
  tags: Dashboard['tags'];
  canComplete: boolean;
  isCompleting: boolean;
  isRenaming: boolean;
  isDeleting: boolean;
  isDragging: boolean;
  isTagging: boolean;
  deletingTagId?: string;
  isTagPickerOpen: boolean;
  closeTagPicker: () => void;
  toggleTagPicker: () => void;
  startPointerDragging: (event: ReactPointerEvent<HTMLDivElement>) => void;
  movePointerDragging: (event: ReactPointerEvent<HTMLDivElement>) => void;
  dropPointer: (event: ReactPointerEvent<HTMLDivElement>) => void;
  cancelPointerDragging: (event: ReactPointerEvent<HTMLDivElement>) => void;
  moveBy: (direction: -1 | 1) => void;
  setTodoCompleted: Dashboard['setTodoCompleted'];
  renameTodo: Dashboard['renameTodo'];
  deleteTodo: Dashboard['deleteTodo'];
  toggleTodoTag: Dashboard['toggleTodoTag'];
  createTagForTodo: Dashboard['createTagForTodo'];
  deleteTag: Dashboard['deleteTag'];
};

const tagStyle = (color: string) => ({ '--tag-color': color }) as CSSProperties;

export const TodoItemCard = ({
  todo,
  tags,
  canComplete,
  isCompleting,
  isRenaming,
  isDeleting,
  isDragging,
  isTagging,
  deletingTagId,
  isTagPickerOpen,
  closeTagPicker,
  toggleTagPicker,
  startPointerDragging,
  movePointerDragging,
  dropPointer,
  cancelPointerDragging,
  moveBy,
  setTodoCompleted,
  renameTodo,
  deleteTodo,
  toggleTodoTag,
  createTagForTodo,
  deleteTag,
}: TodoItemCardProps) => {
  const [titleDraft, setTitleDraft] = useState(todo.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [confirmingTagDeleteId, setConfirmingTagDeleteId] = useState<string>();
  const tagControl = useRef<HTMLDivElement>(null);

  useEffect(() => setTitleDraft(todo.title), [todo.title]);

  useEffect(() => {
    if (!isTagPickerOpen) {
      setConfirmingTagDeleteId(undefined);
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !tagControl.current?.contains(event.target)) {
        closeTagPicker();
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeTagPicker();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeTagPicker, isTagPickerOpen]);

  const submitNewTag = async (event: FormEvent) => {
    event.preventDefault();
    if (await createTagForTodo(todo.id, newTagName)) {
      setNewTagName('');
      closeTagPicker();
    }
  };

  const beginTitleEdit = () => {
    closeTagPicker();
    setIsConfirmingDelete(false);
    setTitleDraft(todo.title);
    setIsEditingTitle(true);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(todo.title);
    setIsEditingTitle(false);
  };

  const submitTitle = async (event: FormEvent) => {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) return;
    if (title === todo.title) {
      cancelTitleEdit();
      return;
    }
    if (await renameTodo(todo.id, title)) setIsEditingTitle(false);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      beginTitleEdit();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveBy(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveBy(1);
    }
  };

  return (
    <div
      className={`todo-item-card${todo.completed ? ' completed' : ''}${isDragging ? ' dragging' : ''}`}
      data-todo-id={todo.id}
      tabIndex={0}
      role='listitem'
      aria-label={`${todo.title}. Drag to reorder; arrow keys also work. Press Enter to rename.`}
      onPointerDown={startPointerDragging}
      onPointerMove={movePointerDragging}
      onPointerUp={dropPointer}
      onPointerCancel={cancelPointerDragging}
      onKeyDown={handleCardKeyDown}
      onDoubleClick={event => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, form, a, [data-no-item-drag]')
        ) {
          return;
        }
        beginTitleEdit();
      }}
    >
      <button
        type='button'
        className='complete-button'
        onClick={() => setTodoCompleted(todo.id, !todo.completed)}
        disabled={isCompleting || !canComplete}
        aria-label={
          todo.completed ? `Mark ${todo.title} incomplete` : `Mark ${todo.title} complete`
        }
        title={
          canComplete
            ? todo.completed
              ? 'Mark incomplete'
              : 'Mark complete'
            : 'Sign in with GitHub to change todos'
        }
      >
        {isCompleting ? (
          <LoaderCircle className='spin' aria-hidden='true' />
        ) : todo.completed ? (
          <Check aria-hidden='true' />
        ) : null}
      </button>

      <div className='todo-item-copy'>
        {isEditingTitle ? (
          <form className='rename-todo-form' data-no-item-drag onSubmit={submitTitle}>
            <input
              autoFocus
              aria-label={`Rename ${todo.title}`}
              value={titleDraft}
              onChange={event => setTitleDraft(event.target.value)}
              onFocus={event => event.target.select()}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelTitleEdit();
                }
              }}
              disabled={isRenaming}
            />
            <button
              type='submit'
              className='icon-button confirm'
              aria-label='Save todo title'
              disabled={!titleDraft.trim() || isRenaming}
            >
              {isRenaming ? (
                <LoaderCircle className='spin' aria-hidden='true' />
              ) : (
                <Check aria-hidden='true' />
              )}
            </button>
            <button
              type='button'
              className='icon-button'
              onClick={cancelTitleEdit}
              aria-label='Cancel todo rename'
              disabled={isRenaming}
            >
              <X aria-hidden='true' />
            </button>
          </form>
        ) : (
          <span className='todo-title' title='Double-click to rename'>
            {todo.title}
          </span>
        )}
        {todo.tags.length > 0 ? (
          <div className='assigned-tags' aria-label={`Tags for ${todo.title}`}>
            {todo.tags.map(tag => (
              <small key={tag.id} className='tag-badge' style={tagStyle(tag.color)}>
                <span>{tag.name}</span>
                <button
                  type='button'
                  onClick={() => toggleTodoTag(todo.id, tag.id, true)}
                  disabled={isTagging}
                  aria-label={`Remove ${tag.name} from ${todo.title}`}
                  title='Remove tag'
                >
                  <X aria-hidden='true' />
                </button>
              </small>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`todo-item-actions${isEditingTitle ? ' editing-title' : ''}`}>
        <button
          type='button'
          className='icon-button rename-todo'
          onClick={beginTitleEdit}
          aria-label={`Rename ${todo.title}`}
          title='Rename todo'
        >
          <Pencil aria-hidden='true' />
        </button>

        <div className='tag-control' ref={tagControl}>
          <button
            type='button'
            className='icon-button tag-button'
            onClick={toggleTagPicker}
            disabled={todo.completed}
            aria-label={`Edit tags for ${todo.title}`}
            aria-expanded={isTagPickerOpen}
          >
            <TagIcon aria-hidden='true' />
          </button>

          {isTagPickerOpen ? (
            <div className='tag-popover'>
              <div className='tag-popover-heading'>
                <strong>Manage tags</strong>
                <button
                  type='button'
                  className='icon-button'
                  onClick={closeTagPicker}
                  aria-label='Close tag selector'
                >
                  <X aria-hidden='true' />
                </button>
              </div>
              <div className='tag-options'>
                {tags.map(tag => {
                  const isAssigned = todo.tags.some(assignedTag => assignedTag.id === tag.id);
                  const isConfirmingTagDelete = confirmingTagDeleteId === tag.id;
                  return (
                    <div className='tag-option-row' key={tag.id}>
                      <button
                        type='button'
                        className={`tag-option${isAssigned ? ' selected' : ''}`}
                        style={tagStyle(tag.color)}
                        aria-pressed={isAssigned}
                        onClick={() => toggleTodoTag(todo.id, tag.id, isAssigned)}
                        disabled={isTagging || deletingTagId === tag.id}
                      >
                        <i aria-hidden='true' />
                        <span>{tag.name}</span>
                        {isAssigned ? <Check aria-hidden='true' /> : null}
                      </button>
                      <div className='tag-delete-actions'>
                        <button
                          type='button'
                          className={`icon-button${isConfirmingTagDelete ? ' danger-icon' : ''}`}
                          onClick={async () => {
                            if (!isConfirmingTagDelete) {
                              setConfirmingTagDeleteId(tag.id);
                              return;
                            }
                            if (await deleteTag(tag.id)) setConfirmingTagDeleteId(undefined);
                          }}
                          disabled={deletingTagId === tag.id}
                          aria-label={
                            isConfirmingTagDelete
                              ? `Confirm delete ${tag.name} everywhere`
                              : `Delete ${tag.name} everywhere`
                          }
                          title='Delete tag everywhere'
                        >
                          {deletingTagId === tag.id ? (
                            <LoaderCircle className='spin' aria-hidden='true' />
                          ) : isConfirmingTagDelete ? (
                            <Check aria-hidden='true' />
                          ) : (
                            <Trash2 aria-hidden='true' />
                          )}
                        </button>
                        {isConfirmingTagDelete ? (
                          <button
                            type='button'
                            className='icon-button'
                            onClick={() => setConfirmingTagDeleteId(undefined)}
                            aria-label='Cancel tag deletion'
                          >
                            <X aria-hidden='true' />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {tags.length === 0 ? <small>No tags yet. Create one below.</small> : null}
              </div>
              <form className='new-tag-form' onSubmit={submitNewTag}>
                <Plus aria-hidden='true' />
                <input
                  aria-label='New tag name'
                  value={newTagName}
                  onChange={event => setNewTagName(event.target.value)}
                  placeholder='Create a tag'
                />
                <button type='submit' disabled={!newTagName.trim() || isTagging}>
                  Add
                </button>
              </form>
            </div>
          ) : null}
        </div>

        {isConfirmingDelete ? (
          <div className='todo-delete-confirmation'>
            <button
              type='button'
              className='icon-button danger-icon'
              onClick={async () => {
                if (await deleteTodo(todo.id)) setIsConfirmingDelete(false);
              }}
              disabled={isDeleting}
              aria-label={`Confirm delete ${todo.title}`}
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
              aria-label='Cancel todo deletion'
            >
              <X aria-hidden='true' />
            </button>
          </div>
        ) : (
          <button
            type='button'
            className='icon-button delete-todo'
            onClick={() => setIsConfirmingDelete(true)}
            aria-label={`Delete ${todo.title}`}
            title='Delete todo'
          >
            <Trash2 aria-hidden='true' />
          </button>
        )}
      </div>
    </div>
  );
};
