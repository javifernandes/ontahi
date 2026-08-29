import { AlertCircle, Plus, X } from 'lucide-react';
import { useState } from 'react';

import type { TodoAppModel } from '../use-todo-app.js';

import { TodoListCard } from './TodoListCard.js';

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

  const submitList = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(await createList(listName))) return;

    setListName('');
    setIsAddingList(false);
  };

  return (
    <section className='todo-dashboard' aria-label='Todo lists'>
      <div className='dashboard-heading'>
        <div>
          <span className='eyebrow'>Your workspace</span>
          <h2>Lists</h2>
        </div>
        <button
          type='button'
          className='primary-action'
          onClick={() => setIsAddingList(true)}
          disabled={isAddingList}
        >
          <Plus aria-hidden='true' />
          New list
        </button>
      </div>

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
        {lists.map(list => (
          <TodoListCard
            key={list.id}
            list={list}
            tags={tags}
            canComplete={canComplete}
            isCreatingTodo={creatingTodoFor === list.id}
            isRenaming={renamingListId === list.id}
            isDeleting={deletingListId === list.id}
            completingTodoId={completingTodoId}
            taggingTodoId={taggingTodoId}
            renameList={renameList}
            deleteList={deleteList}
            createTodo={createTodo}
            completeTodo={completeTodo}
            toggleTodoTag={toggleTodoTag}
            createTagForTodo={createTagForTodo}
          />
        ))}

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
          <button type='button' className='add-list-card' onClick={() => setIsAddingList(true)}>
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
