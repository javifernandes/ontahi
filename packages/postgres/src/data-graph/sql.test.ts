import {
  createEntityRef,
  entity,
  field,
  query,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { TodoEntity, TodoMapping } from './fixtures.test-support.js';

import {
  compilePostgresCommand,
  compilePostgresQuery,
  createPostgresMappingRegistry,
  inferPostgresMappings,
  postgresMapping,
} from './index.js';

describe('PostgreSQL SQL compiler', () => {
  it('compiles selections, ordering and limits with parameters', () => {
    expect(
      compilePostgresQuery(
        query(TodoEntity)
          .where(todo => todo.completed.eq(false))
          .orderBy(todo => todo.title.desc())
          .limit(5),
        undefined,
        TodoMapping,
      ),
    ).toEqual({
      text:
        'SELECT "todo_id" AS "id", "todo_title" AS "title", "is_completed" AS "completed"' +
        ' FROM "todos" WHERE "is_completed" = $1 ORDER BY "todo_title" DESC NULLS LAST LIMIT 5',
      values: [false],
    });
  });

  it('compiles selection-based updates with returning fields', () => {
    const command: GraphCommandSpec = {
      kind: 'command',
      operation: 'update',
      root: TodoEntity,
      selection: query(TodoEntity)
        .where(todo => todo.id.in(['todo-1', 'todo-2']))
        .build().selection,
      payload: { completed: true },
      returning: ['id'],
    };

    expect(compilePostgresCommand(command, TodoMapping)).toEqual({
      text:
        'UPDATE "todos" SET "is_completed" = $3' +
        ' WHERE "todo_id" IN ($1, $2) RETURNING "todo_id" AS "id"',
      values: ['todo-1', 'todo-2', true],
    });
  });

  it('lowers reference fields into PostgreSQL parameters', () => {
    const TodoList = entity('TodoList', { id: field.id(), name: field.string() });
    const Todo = entity('Todo', {
      id: field.id(),
      list: field.ref(TodoList),
      title: field.string(),
    });
    const [listMapping, todoMapping] = inferPostgresMappings([TodoList, Todo]);
    const research = createEntityRef(TodoList, { id: 'list-research' });

    expect(listMapping?.columns.id).toBe('id');
    expect(todoMapping?.columns.list).toBe('list_id');
    expect(
      compilePostgresQuery(
        query(Todo).where(todo => todo.list.eq(research)),
        undefined,
        todoMapping!,
      ).values,
    ).toEqual(['list-research']);
    expect(
      compilePostgresCommand(
        {
          kind: 'command',
          operation: 'insert',
          root: Todo,
          selection: { kind: 'none' },
          payload: { id: 'todo-1', list: research, title: 'Model refs' },
        },
        todoMapping!,
      ).values,
    ).toEqual(['todo-1', 'list-research', 'Model refs']);
  });

  it('rejects incomplete and ambiguous physical mappings', () => {
    expect(() =>
      createPostgresMappingRegistry([
        postgresMapping({
          entity: TodoEntity,
          table: 'todos',
          columns: { id: 'id', title: 'title' } as never,
        }),
      ]),
    ).toThrow('missing fields completed');
    expect(() =>
      createPostgresMappingRegistry([
        postgresMapping({
          entity: TodoEntity,
          table: 'todos',
          columns: { id: 'value', title: 'value', completed: 'completed' },
        }),
      ]),
    ).toThrow('duplicate columns');
  });
});
