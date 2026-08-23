import { describe, expect, it } from 'vitest';

import {
  applyConventionalDataGraphMappings,
  entity,
  field,
  getEntityMapping,
  mapEntity,
  mapRelation,
  resolveColumnNameForEntity,
  resolveFieldNameForEntity,
} from '../../src/data-graph/index.js';

describe('data-graph mapping', () => {
  it('infers same-name columns and resolves explicit overrides', () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      ownerId: field.id(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    expect(getEntityMapping(Book)).toEqual({
      tableName: 'books',
      columns: {
        id: 'id',
        title: 'title',
        ownerId: 'owner_id',
      },
    });

    expect(resolveColumnNameForEntity(Book, 'title')).toBe('title');
    expect(resolveColumnNameForEntity(Book, 'ownerId')).toBe('owner_id');
    expect(resolveFieldNameForEntity(Book, 'title')).toBe('title');
    expect(resolveFieldNameForEntity(Book, 'owner_id')).toBe('ownerId');
  });

  it('keeps local foreign-key evidence on schema-level belongs-to relations', () => {
    const TodoList = entity('TodoList', { id: field.id() });
    const Todo = entity('Todo', {
      id: field.id(),
      listId: field.id(),
    }).belongsTo('list', TodoList, { via: 'listId' });

    expect(Todo.relations.list).toMatchObject({
      relationKind: 'belongsTo',
      target: TodoList,
      sourceField: 'listId',
    });
  });

  it('maps has-many through a unique target Reference Field without explicit via', () => {
    const Course = entity('Course', { id: field.id() });
    const Student = entity('Student', {
      id: field.id(),
      course: field.ref(Course),
    });
    Course.hasMany('students', Student);

    applyConventionalDataGraphMappings({
      entities: [Course, Student],
      naming: {
        table: name => name.toLowerCase(),
        column: name => name.toLowerCase(),
      },
    });

    expect(Course.relations.students?.mapping).toEqual({
      type: 'one-to-many',
      fromTable: 'course',
      fromColumn: 'id',
      toTable: 'student',
      toColumn: 'courseid',
    });
  });

  it('maps direct many-to-many topology through storage-only edge metadata', () => {
    const Tag = entity('Tag', { id: field.id() });
    const Todo = entity('Todo', { id: field.id() }).manyToMany('tags', Tag);
    mapRelation(Todo, 'tags', {
      type: 'many-to-many',
      from: 'todos.id',
      through: { table: 'todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
      to: 'tags.id',
    });

    expect(Todo.relations.tags.mapping).toEqual({
      type: 'many-to-many',
      fromTable: 'todos',
      fromColumn: 'id',
      throughTable: 'todo_tags',
      throughFromColumn: 'todo_id',
      throughToColumn: 'tag_id',
      toTable: 'tags',
      toColumn: 'id',
    });
  });
});
