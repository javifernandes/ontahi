import { Check, LoaderCircle, Plus, Tag as TagIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

import type { TodoAppModel } from '../use-todo-app.js';

type Dashboard = TodoAppModel['dashboard'];
type TodoItemCardProps = {
  todo: Dashboard['lists'][number]['items'][number];
  tags: Dashboard['tags'];
  canComplete: boolean;
  isCompleting: boolean;
  isTagging: boolean;
  isTagPickerOpen: boolean;
  closeTagPicker: () => void;
  toggleTagPicker: () => void;
  completeTodo: Dashboard['completeTodo'];
  toggleTodoTag: Dashboard['toggleTodoTag'];
  createTagForTodo: Dashboard['createTagForTodo'];
};

const tagStyle = (color: string) => ({ '--tag-color': color }) as CSSProperties;

export const TodoItemCard = ({
  todo,
  tags,
  canComplete,
  isCompleting,
  isTagging,
  isTagPickerOpen,
  closeTagPicker,
  toggleTagPicker,
  completeTodo,
  toggleTodoTag,
  createTagForTodo,
}: TodoItemCardProps) => {
  const [newTagName, setNewTagName] = useState('');
  const tagControl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTagPickerOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !tagControl.current?.contains(event.target)) {
        closeTagPicker();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
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
    if (await createTagForTodo(todo.id, newTagName)) setNewTagName('');
  };

  return (
    <div className={`todo-item-card${todo.completed ? ' completed' : ''}`}>
      <button
        type='button'
        className='complete-button'
        onClick={() => completeTodo(todo.id)}
        disabled={todo.completed || isCompleting || !canComplete}
        aria-label={todo.completed ? `${todo.title} is complete` : `Mark ${todo.title} complete`}
        title={canComplete ? 'Mark complete' : 'Sign in with GitHub to complete todos'}
      >
        {isCompleting ? (
          <LoaderCircle className='spin' aria-hidden='true' />
        ) : todo.completed ? (
          <Check aria-hidden='true' />
        ) : null}
      </button>

      <div className='todo-item-copy'>
        <span>{todo.title}</span>
        {todo.tags.length > 0 ? (
          <div className='assigned-tags' aria-label={`Tags for ${todo.title}`}>
            {todo.tags.map(tag => (
              <small key={tag.id} className='tag-badge' style={tagStyle(tag.color)}>
                {tag.name}
              </small>
            ))}
          </div>
        ) : null}
      </div>

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
              <strong>Tags</strong>
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
                return (
                  <button
                    type='button'
                    key={tag.id}
                    className={`tag-option${isAssigned ? ' selected' : ''}`}
                    style={tagStyle(tag.color)}
                    aria-pressed={isAssigned}
                    onClick={() => toggleTodoTag(todo.id, tag.id, isAssigned)}
                    disabled={isTagging}
                  >
                    <i aria-hidden='true' />
                    <span>{tag.name}</span>
                    {isAssigned ? <Check aria-hidden='true' /> : null}
                  </button>
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
    </div>
  );
};
