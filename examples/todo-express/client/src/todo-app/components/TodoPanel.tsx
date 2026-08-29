import type { TodoStatusFilter, TodoAppModel } from '../use-todo-app.js';

import { TodoActions } from './TodoActions.js';
import { TodoItems } from './TodoItems.js';

const statuses: readonly TodoStatusFilter[] = ['all', 'open', 'completed'];

export const TodoPanel = ({
  title,
  statusFilter,
  hasLists,
  hasSelectedList,
  isCreatingTodo,
  isLoading,
  isError,
  creationError,
  changeTitle,
  submitTodo,
  selectStatus,
  items,
  selectedIds,
  selectTodo,
  actions,
  durableRun,
}: TodoAppModel['todoPanel']) => (
  <div className='card'>
    <form onSubmit={submitTodo}>
      <input
        aria-label='Todo item title'
        value={title}
        onChange={event => changeTitle(event.target.value)}
        placeholder='What should happen next?'
      />
      <button type='submit' disabled={!hasSelectedList || isCreatingTodo}>
        {isCreatingTodo ? 'Adding…' : 'Add todo'}
      </button>
    </form>

    {creationError ? (
      <p className='todo-form-error' role='alert'>
        {creationError}
      </p>
    ) : null}

    <div className='status-filter' aria-label='Filter todos by status'>
      {statuses.map(status => (
        <button
          type='button'
          key={status}
          className={status === statusFilter ? 'active' : ''}
          onClick={() => selectStatus(status)}
        >
          {status}
        </button>
      ))}
    </div>

    {!hasLists && <p className='empty-hint'>Create a list to begin.</p>}
    {isLoading && <p className='muted'>Loading graph state…</p>}
    {isError && <p className='error'>Could not load todos.</p>}

    <TodoItems items={items} selectedIds={selectedIds} selectTodo={selectTodo} />
    <TodoActions actions={actions} durableRun={durableRun} />
  </div>
);
