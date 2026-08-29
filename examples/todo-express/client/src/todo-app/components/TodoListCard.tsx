import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import type { TodoAppModel } from '../use-todo-app.js';

import { TodoItemCard } from './TodoItemCard.js';

type Dashboard = TodoAppModel['dashboard'];
type TodoListCardProps = {
  list: Dashboard['lists'][number];
  tags: Dashboard['tags'];
  canComplete: boolean;
  isCreatingTodo: boolean;
  isRenaming: boolean;
  isDeleting: boolean;
  completingTodoId?: string;
  taggingTodoId?: string;
  renameList: Dashboard['renameList'];
  deleteList: Dashboard['deleteList'];
  createTodo: Dashboard['createTodo'];
  completeTodo: Dashboard['completeTodo'];
  toggleTodoTag: Dashboard['toggleTodoTag'];
  createTagForTodo: Dashboard['createTagForTodo'];
};

export const TodoListCard = ({
  list,
  tags,
  canComplete,
  isCreatingTodo,
  isRenaming,
  isDeleting,
  completingTodoId,
  taggingTodoId,
  renameList,
  deleteList,
  createTodo,
  completeTodo,
  toggleTodoTag,
  createTagForTodo,
}: TodoListCardProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [todoTitle, setTodoTitle] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => setNameDraft(list.name), [list.name]);

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

  const completedCount = list.items.filter(todo => todo.completed).length;

  return (
    <article className='list-card'>
      <header className='list-card-header'>
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
                onDoubleClick={() => setIsEditingName(true)}
                onKeyDown={event => {
                  if (event.key === 'Enter') setIsEditingName(true);
                }}
                tabIndex={0}
                title='Double-click to rename'
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
      </header>

      <div className='todo-stack'>
        {list.items.map(todo => (
          <TodoItemCard
            key={todo.id}
            todo={todo}
            tags={tags}
            canComplete={canComplete}
            isCompleting={completingTodoId === todo.id}
            isTagging={taggingTodoId === todo.id}
            completeTodo={completeTodo}
            toggleTodoTag={toggleTodoTag}
            createTagForTodo={createTagForTodo}
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
    </article>
  );
};
