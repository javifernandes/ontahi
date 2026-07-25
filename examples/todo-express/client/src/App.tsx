import { useDurableOperation, useOperation, useOperationQuery } from '@ontahi/react/graph';
import { FormEvent, useEffect, useState } from 'react';

import { Todo } from '../../src/generated/client-entities.js';

const ExpressMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <path d='M5 10h22M5 16h14M5 22h22' />
  </svg>
);

const PostgresMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <path d='M7 9.5C9 5.5 23 5 25 10c1.4 3.5-.5 10-4 12.5l-1.5-5c2-1.5 3-5.5 1.5-7.5M11 10c-1.5 2-1 8 2 10.5 1.2 1 2.6 1.5 4 1.5v5M13 13c1-1.5 4-1.5 5 0' />
    <circle cx='12.5' cy='9.5' r='.8' />
    <circle cx='20.5' cy='9.5' r='.8' />
  </svg>
);

const MemoryMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <rect x='8' y='8' width='16' height='16' rx='3' />
    <path d='M12 3v5m8-5v5m-8 16v5m8-5v5M3 12h5m-5 8h5m16-8h5m-5 8h5' />
  </svg>
);

export const App = () => {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [storage, setStorage] = useState<'in-memory' | 'postgres'>();
  const todos = useOperationQuery(Todo.domain.list);
  const createTodo = useOperation(Todo.domain.create);
  const completeTodos = useOperation(Todo.domain.complete);
  const deleteAll = useOperation(Todo.domain.deleteAll);
  const completeAll = useDurableOperation(Todo.domain.completeAll);

  useEffect(() => {
    void fetch('/runtime')
      .then(response => response.json() as Promise<{ storage: 'in-memory' | 'postgres' }>)
      .then(runtime => setStorage(runtime.storage));
  }, []);

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
      todos: selectedIds,
    });
    setSelectedIds([]);
  };

  return (
    <main className='todo-app'>
      <header>
        <span className='eyebrow'>Ontahi portability example</span>
        <h1>A tiny app, wired end to end.</h1>
        <div className='runtime-stack' aria-label={`Express with ${storage ?? 'graph runtime'}`}>
          <span>
            <ExpressMark />
            Express
          </span>
          <strong>+</strong>
          <span>
            {storage === 'in-memory' ? <MemoryMark /> : <PostgresMark />}
            {storage === 'in-memory' ? 'In-memory' : storage === 'postgres' ? 'PostgreSQL' : '…'}
          </span>
        </div>
        <a className='explorer-link' href='/explorer'>
          Open the embedded Ontahi Explorer →
        </a>
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
          <button
            className='danger'
            disabled={!todos.data?.length || deleteAll.isExecuting}
            onClick={() => deleteAll.execute()}
          >
            Delete all
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
