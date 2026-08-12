import { describe, expect, it } from 'vitest';

import {
  entity,
  field,
  getEntityMapping,
  mapEntity,
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
});
