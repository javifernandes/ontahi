import { createEntityRef, Selection } from '@ontahi/core/data-graph';
import { useDurableOperation, useOperation, useOperationQuery } from '@ontahi/react/graph';
import { FormEvent, useState } from 'react';

import { Todo } from '../../src/generated/client-entities.js';
import { TodoEntity } from '../../src/todo-schema.js';

export const App = () => {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const todos = useOperationQuery(Todo.domain.list);
  const createTodo = useOperation(Todo.domain.create);
  const completeTodos = useOperation(Todo.domain.complete);
  const completeAll = useDurableOperation(Todo.domain.completeAll);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;

    const result = await createTodo.executeAsync({
      id: globalThis.crypto.randomUUID(),
      title: normalizedTitle,
    });
    if (result.ok) setTitle('');
  };

  const completeSelected = async () => {
    await completeTodos.executeAsync({
      todos: Selection.references(
        TodoEntity,
        selectedIds.map(id => createEntityRef(TodoEntity, { id })),
      ),
    });
    setSelectedIds([]);
  };

  return (
    <main>
      <header>
        <span className='eyebrow'>Ontahi portability example</span>
        <h1>A tiny app, wired end to end.</h1>
        <p>React hooks → Fetch bridge → Express → Ontahi operations → in-memory graph.</p>
      </header>

      <section className='card'>
        <form onSubmit={submit}>
          <input
            aria-label='Todo title'
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder='What should happen next?'
          />
          <button disabled={createTodo.isExecuting}>Add todo</button>
        </form>

        {todos.isLoading && <p className='muted'>Loading graph state…</p>}
        {todos.isError && <p className='error'>Could not load todos.</p>}
        <ul>
          {todos.data?.map(todo => (
            <li key={todo.id} className={todo.completed ? 'completed' : ''}>
              <label>
                <input
                  type='checkbox'
                  checked={selectedIds.includes(todo.id)}
                  disabled={todo.completed}
                  onChange={event =>
                    setSelectedIds(current =>
                      event.target.checked
                        ? [...current, todo.id]
                        : current.filter(id => id !== todo.id),
                    )
                  }
                />
                <span>{todo.title}</span>
              </label>
              <small>{todo.completed ? 'complete' : 'open'}</small>
            </li>
          ))}
        </ul>

        <footer>
          <button
            className='secondary'
            disabled={selectedIds.length === 0 || completeTodos.isExecuting}
            onClick={completeSelected}
          >
            Complete selected
          </button>
          <button
            className='ghost'
            disabled={completeAll.isExecuting}
            onClick={() => completeAll.execute()}
          >
            Complete all durably
          </button>
        </footer>

        {completeAll.value && (
          <div className='run' aria-live='polite'>
            <span>Run {completeAll.value.runId}</span>
            {completeAll.isQueued && <strong>Queued…</strong>}
            {completeAll.isRunning && (
              <strong>
                {completeAll.progress?.phase === 'updating' ? 'Completing todos…' : 'Running…'}
              </strong>
            )}
            {completeAll.isCompleted && (
              <strong>Completed {completeAll.finalValue?.completed ?? 0} todos.</strong>
            )}
            {completeAll.isFailed && (
              <strong className='error'>{completeAll.runError?.message ?? 'Run failed.'}</strong>
            )}
            {completeAll.isCancelled && <strong>Cancelled.</strong>}
          </div>
        )}
      </section>
    </main>
  );
};
