import { useDurableOperation, useOperation, useOperationQuery } from '@ontahi/react/graph';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Tag, Todo, TodoList, TodoTag } from '../../src/generated/client-entities.js';

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
  const [listName, setListName] = useState('');
  const [tagName, setTagName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [storage, setStorage] = useState<'in-memory' | 'postgres'>();
  const lists = useOperationQuery(TodoList.domain.list);
  const tags = useOperationQuery(Tag.domain.list);
  const assignments = useOperationQuery(TodoTag.domain.list);
  const todoSelection = useMemo(() => {
    const inSelectedList = Todo.selection(todo => todo.listId.eq(selectedListId));
    return statusFilter === 'all'
      ? inSelectedList
      : inSelectedList.and(todo => todo.completed.eq(statusFilter === 'completed'));
  }, [selectedListId, statusFilter]);
  const todos = useOperationQuery(Todo.domain.list, todoSelection, {
    enabled: Boolean(selectedListId),
  });
  const createList = useOperation(TodoList.domain.create);
  const renameList = useOperation(TodoList.domain.rename);
  const deleteList = useOperation(TodoList.domain.delete);
  const createTag = useOperation(Tag.domain.create);
  const createTodo = useOperation(Todo.domain.create);
  const completeTodos = useOperation(Todo.domain.complete);
  const assignTags = useOperation(Todo.domain.assignTags);
  const removeTags = useOperation(Todo.domain.removeTags);
  const deleteAll = useOperation(Todo.domain.deleteAll);
  const completeAll = useDurableOperation(Todo.domain.completeAll);

  useEffect(() => {
    void fetch('/runtime')
      .then(response => response.json() as Promise<{ storage: 'in-memory' | 'postgres' }>)
      .then(runtime => setStorage(runtime.storage));
  }, []);

  useEffect(() => {
    if (!selectedListId && lists.data?.[0]) setSelectedListId(lists.data[0].id);
  }, [lists.data, selectedListId]);

  useEffect(() => {
    if (!selectedTagId && tags.data?.[0]) setSelectedTagId(tags.data[0].id);
  }, [selectedTagId, tags.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !selectedListId) return;

    const result = await createTodo.executeAsync({
      id: globalThis.crypto.randomUUID(),
      listId: selectedListId,
      title: normalizedTitle,
    });
    if (result.ok) setTitle('');
  };

  const submitList = async (event: FormEvent) => {
    event.preventDefault();
    const name = listName.trim();
    if (!name) return;
    const id = globalThis.crypto.randomUUID();
    const result = await createList.executeAsync({ id, name });
    if (result.ok) {
      setListName('');
      setSelectedListId(id);
      setSelectedIds([]);
    }
  };

  const submitTag = async (event: FormEvent) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const id = globalThis.crypto.randomUUID();
    const colors = ['#d95d4f', '#708b62', '#527d8c', '#a77b45'];
    const result = await createTag.executeAsync({
      id,
      name,
      color: colors[(tags.data?.length ?? 0) % colors.length]!,
    });
    if (result.ok) {
      setTagName('');
      setSelectedTagId(id);
    }
  };

  const renameSelectedList = async () => {
    const currentList = lists.data?.find(list => list.id === selectedListId);
    if (!currentList) return;
    const name = globalThis.prompt('List name', currentList.name)?.trim();
    if (!name || name === currentList.name) return;
    await renameList.executeAsync({ list: TodoList.refById(selectedListId), name });
  };

  const deleteSelectedList = async () => {
    if (!selectedListId || !globalThis.confirm('Delete this empty list?')) return;
    const result = await deleteList.executeAsync({ list: TodoList.refById(selectedListId) });
    if (result.ok) {
      setSelectedListId('');
      setSelectedIds([]);
    }
  };

  const completeSelected = async () => {
    await completeTodos.executeAsync({
      todos: selectedIds,
    });
    setSelectedIds([]);
  };

  const completeVisible = async () => {
    await completeTodos.executeAsync({ todos: todoSelection });
    setSelectedIds([]);
  };

  const changeSelectedTags = async (mode: 'assign' | 'remove') => {
    if (!selectedTagId || selectedIds.length === 0) return;
    const operation = mode === 'assign' ? assignTags : removeTags;
    await operation.executeAsync({ todos: selectedIds, tagIds: [selectedTagId] });
  };

  const visibleTodos = todos.data ?? [];
  const tagById = new Map(tags.data?.map(tag => [tag.id, tag]) ?? []);
  const tagIdsByTodo = new Map<string, string[]>();
  assignments.data?.forEach(assignment => {
    tagIdsByTodo.set(assignment.todoId, [
      ...(tagIdsByTodo.get(assignment.todoId) ?? []),
      assignment.tagId,
    ]);
  });

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

      <section className='workspace'>
        <aside className='organizer'>
          <div>
            <span className='section-label'>Lists</span>
            <nav className='list-nav' aria-label='Todo lists'>
              {lists.data?.map(list => (
                <button
                  key={list.id}
                  className={list.id === selectedListId ? 'active' : ''}
                  onClick={() => {
                    setSelectedListId(list.id);
                    setSelectedIds([]);
                  }}
                >
                  {list.name}
                </button>
              ))}
            </nav>
            <form className='compact-form' onSubmit={submitList}>
              <input
                aria-label='List name'
                value={listName}
                onChange={event => setListName(event.target.value)}
                placeholder='New list'
              />
              <button disabled={createList.isExecuting}>+</button>
            </form>
            <div className='list-actions'>
              <button
                className='ghost'
                disabled={!selectedListId || renameList.isExecuting}
                onClick={renameSelectedList}
              >
                Rename
              </button>
              <button
                className='danger'
                disabled={!selectedListId || visibleTodos.length > 0 || deleteList.isExecuting}
                onClick={deleteSelectedList}
                title={visibleTodos.length > 0 ? 'Delete the todos in this list first.' : undefined}
              >
                Delete
              </button>
            </div>
          </div>

          <div>
            <span className='section-label'>Tags</span>
            <div className='tag-picker'>
              {tags.data?.map(tag => (
                <button
                  key={tag.id}
                  className={tag.id === selectedTagId ? 'active' : ''}
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  <i style={{ background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
            <form className='compact-form' onSubmit={submitTag}>
              <input
                aria-label='Tag name'
                value={tagName}
                onChange={event => setTagName(event.target.value)}
                placeholder='New tag'
              />
              <button disabled={createTag.isExecuting}>+</button>
            </form>
          </div>
        </aside>

        <div className='card'>
          <form onSubmit={submit}>
            <input
              aria-label='Todo title'
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder='What should happen next?'
            />
            <button disabled={!selectedListId || createTodo.isExecuting}>Add todo</button>
          </form>

          <div className='status-filter' aria-label='Filter todos by status'>
            {(['all', 'open', 'completed'] as const).map(status => (
              <button
                key={status}
                className={status === statusFilter ? 'active' : ''}
                onClick={() => {
                  setStatusFilter(status);
                  setSelectedIds([]);
                }}
              >
                {status}
              </button>
            ))}
          </div>

          {!lists.data?.length && <p className='empty-hint'>Create a list to begin.</p>}

          {todos.isLoading && <p className='muted'>Loading graph state…</p>}
          {todos.isError && <p className='error'>Could not load todos.</p>}
          <ul>
            {visibleTodos.map(todo => (
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
                  <span className='todo-copy'>
                    <span>{todo.title}</span>
                    <span className='todo-tags'>
                      {(tagIdsByTodo.get(todo.id) ?? []).map(tagId => {
                        const tag = tagById.get(tagId);
                        return tag ? (
                          <small key={tag.id} style={{ borderColor: tag.color }}>
                            {tag.name}
                          </small>
                        ) : null;
                      })}
                    </span>
                  </span>
                </label>
                <small className='todo-state'>{todo.completed ? 'complete' : 'open'}</small>
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
              className='secondary'
              disabled={visibleTodos.length === 0 || completeTodos.isExecuting}
              onClick={completeVisible}
            >
              Complete visible
            </button>
            <button
              className='secondary'
              disabled={!selectedTagId || selectedIds.length === 0 || assignTags.isExecuting}
              onClick={() => changeSelectedTags('assign')}
            >
              Assign tag
            </button>
            <button
              className='ghost'
              disabled={!selectedTagId || selectedIds.length === 0 || removeTags.isExecuting}
              onClick={() => changeSelectedTags('remove')}
            >
              Remove tag
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
        </div>
      </section>
    </main>
  );
};
