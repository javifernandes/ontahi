import {
  createEntityRef,
  entity,
  field,
  mapRelation,
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
      'SELECT DISTINCT "todo_id" AS source_value FROM "todos" WHERE "todo_title" = $1',
    );
    expect(compiled.sql.text).toContain(
      'SELECT DISTINCT "tag_id" AS target_value FROM "tags" WHERE "tag_label" = $2',
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
});
