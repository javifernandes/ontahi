import { query, type GraphCommandSpec } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  compilePostgresCommand,
  compilePostgresQuery,
  createPostgresMappingRegistry,
  postgresMapping,
} from '../../src/data-graph/index.js';

import { TodoEntity, TodoMapping } from './fixtures.js';

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
