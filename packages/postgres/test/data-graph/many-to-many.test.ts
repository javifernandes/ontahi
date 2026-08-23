import {
  createEntityRef,
  entity,
  field,
  mapRelation,
  relationConstraint,
  relationshipSet,
  selection,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  compilePostgresManyToManyCommand,
  materializePostgresManyToManyDelta,
  postgresMapping,
} from '../../src/data-graph/index.js';

const Tag = entity('Tag', { id: field.id(), label: field.string() });
const Todo = entity('Todo', { id: field.id(), title: field.string() }).manyToMany('tags', Tag);

mapRelation(Todo, 'tags', {
  type: 'many-to-many',
  from: 'todos.todo_id',
  through: { table: 'todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
  to: 'tags.tag_id',
});

const todoMapping = postgresMapping({
  entity: Todo,
  table: 'todos',
  columns: { id: 'todo_id', title: 'todo_title' },
});
const tagMapping = postgresMapping({
  entity: Tag,
  table: 'tags',
  columns: { id: 'tag_id', label: 'tag_label' },
});

describe('PostgreSQL many-to-many commands', () => {
  it('compiles a Selection Cartesian product into one guarded insert', () => {
    const command = relationshipSet(
      Todo,
      'tags',
      selection(Todo, todo => todo.title.eq('Selected')),
    ).add(selection(Tag, tag => tag.label.eq('Core')));
    const compiled = compilePostgresManyToManyCommand(command, todoMapping, tagMapping);

    expect(compiled.sql.values).toEqual(['Selected', 'Core']);
    expect(compiled.sql.text).toContain(
      'SELECT "todo_id" AS source_value FROM "todos" WHERE "todo_title" = $1 FOR SHARE',
    );
    expect(compiled.sql.text).toContain(
      'SELECT "tag_id" AS target_value FROM "tags" WHERE "tag_label" = $2 FOR SHARE',
    );
    expect(compiled.sql.text).toContain('INSERT INTO "todo_tags" ("todo_id", "tag_id")');
    expect(compiled.sql.text).toContain(
      'SELECT source_value, target_value FROM selected_sources CROSS JOIN selected_targets',
    );
    expect(compiled.sql.text).toContain('ON CONFLICT DO NOTHING');
  });

  it('guards explicit endpoint Refs and compiles unlink atomically', () => {
    const command = relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'todo-1' })).remove(
      createEntityRef(Tag, { id: 'tag-1' }),
    );
    const compiled = compilePostgresManyToManyCommand(command, todoMapping, tagMapping);

    expect(compiled.expectedSourceCount).toBe(1);
    expect(compiled.expectedTargetCount).toBe(1);
    expect(compiled.sql.values).toEqual(['todo-1', 'tag-1']);
    expect(compiled.sql.text).toContain('DELETE FROM "todo_tags" edge USING');
    expect(compiled.sql.text).toContain('source_count = 1 AND target_count = 1');
  });

  it('materializes only changed edge facts and detects unresolved explicit Refs', () => {
    const command = relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'todo-1' })).add(
      createEntityRef(Tag, { id: 'tag-1' }),
    );
    const compiled = compilePostgresManyToManyCommand(command, todoMapping, tagMapping);

    expect(
      materializePostgresManyToManyDelta(command, compiled, [
        {
          row_kind: 'meta',
          source_value: null,
          target_value: null,
          source_count: 1,
          target_count: 1,
        },
        {
          row_kind: 'fact',
          source_value: 'todo-1',
          target_value: 'tag-1',
          source_count: null,
          target_count: null,
        },
      ]),
    ).toEqual({
      delta: {
        added: [
          {
            relation: command.relation,
            source: createEntityRef(Todo, { id: 'todo-1' }),
            target: createEntityRef(Tag, { id: 'tag-1' }),
          },
        ],
        removed: [],
      },
    });

    expect(
      materializePostgresManyToManyDelta(command, compiled, [
        {
          row_kind: 'meta',
          source_value: null,
          target_value: null,
          source_count: 0,
          target_count: 1,
        },
      ]),
    ).toEqual({ cardinalityMismatch: true });
  });

  it('guards the complete selected participant set with portable eligibility', () => {
    const GuardedTag = entity('GuardedTag', {
      id: field.id(),
      assignable: field.boolean(),
    });
    const GuardedTodoDefinition = entity('GuardedTodo', {
      id: field.id(),
      completed: field.boolean(),
    });
    const GuardedTodo = GuardedTodoDefinition.manyToMany('tags', GuardedTag, {
      constraints: [
        relationConstraint.source(GuardedTodoDefinition, todo => todo.completed.eq(false), {
          code: 'todo_completed',
          message: 'Completed todos cannot be tagged.',
        }),
        relationConstraint.target(GuardedTag, tag => tag.assignable.eq(true), {
          code: 'tag_unassignable',
          message: 'Tag is not assignable.',
        }),
      ],
    });
    mapRelation(GuardedTodo, 'tags', {
      type: 'many-to-many',
      from: 'guarded_todos.id',
      through: {
        table: 'guarded_todo_tags',
        fromColumn: 'todo_id',
        toColumn: 'tag_id',
      },
      to: 'guarded_tags.id',
    });
    const guardedTodoMapping = postgresMapping({
      entity: GuardedTodo,
      table: 'guarded_todos',
      columns: { id: 'id', completed: 'is_completed' },
    });
    const guardedTagMapping = postgresMapping({
      entity: GuardedTag,
      table: 'guarded_tags',
      columns: { id: 'id', assignable: 'is_assignable' },
    });
    const command = relationshipSet(
      GuardedTodo,
      'tags',
      selection(GuardedTodo, todo => todo.id.in(['todo-1', 'todo-2'])),
    ).add(selection(GuardedTag, tag => tag.assignable.eq(true)));
    const compiled = compilePostgresManyToManyCommand(
      command,
      guardedTodoMapping,
      guardedTagMapping,
    );

    expect(compiled.sql.text).toContain('constraint_rejection');
    expect(compiled.sql.text).toContain('FOR SHARE');
    expect(compiled.sql.text).toContain('"is_completed" IS NOT DISTINCT FROM');
    expect(compiled.sql.text).toContain('"is_assignable" IS NOT DISTINCT FROM');
    expect(compiled.sql.text).toContain('AND constraint_rejection IS NULL ON CONFLICT DO NOTHING');
    expect(
      materializePostgresManyToManyDelta(command, compiled, [
        {
          row_kind: 'meta',
          source_value: null,
          target_value: null,
          source_count: 2,
          target_count: 1,
          constraint_rejection: {
            version: 1,
            code: 'todo_completed',
            message: 'Completed todos cannot be tagged.',
          },
        },
      ]),
    ).toEqual({
      constraintRejected: {
        version: 1,
        code: 'todo_completed',
        message: 'Completed todos cannot be tagged.',
      },
    });
  });
});
