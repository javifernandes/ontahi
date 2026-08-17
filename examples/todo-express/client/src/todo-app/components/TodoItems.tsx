import type { TodoAppModel } from '../use-todo-app.js';

type TodoItemsProps = Pick<TodoAppModel['todoPanel'], 'items' | 'selectedIds' | 'selectTodo'>;

export const TodoItems = ({ items, selectedIds, selectTodo }: TodoItemsProps) => (
  <ul>
    {items.map(todo => (
      <li key={todo.id} className={todo.completed ? 'completed' : ''}>
        <label>
          <input
            type='checkbox'
            checked={selectedIds.includes(todo.id)}
            disabled={todo.completed}
            onChange={event => selectTodo(todo.id, event.target.checked)}
          />
          <span className='todo-copy'>
            <span>{todo.title}</span>
            <span className='todo-tags'>
              {todo.tags.map(tag => (
                <small key={tag.id} style={{ borderColor: tag.color }}>
                  {tag.name}
                </small>
              ))}
            </span>
          </span>
        </label>
        <small className='todo-state'>{todo.completed ? 'complete' : 'open'}</small>
      </li>
    ))}
  </ul>
);
