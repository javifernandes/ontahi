import { describe, expect, it } from 'vitest';

import { entity, field, reflectSchemaRelations } from '../../src/data-graph/index.js';

describe('schema relation reflection', () => {
  it('reflects declared relations and their structural inverse endpoints', () => {
    const TodoList = entity('TodoList', { id: field.id(), name: field.string() });
    const Tag = entity('Tag', { id: field.id(), name: field.string() });
    const TodoItem = entity('TodoItem', {
      id: field.id(),
      list: field.ref(TodoList),
    }).manyToMany('tags', Tag);

    expect(reflectSchemaRelations([TodoList, Tag, TodoItem])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationId: 'TodoItem.list',
          subjectEntityName: 'TodoItem',
          targetEntityName: 'TodoList',
          name: 'list',
          kind: 'belongsTo',
          provenance: 'declared',
          direction: 'forward',
          cardinality: 'one',
        }),
        expect.objectContaining({
          relationId: 'TodoItem.list',
          subjectEntityName: 'TodoList',
          targetEntityName: 'TodoItem',
          name: 'TodoItem.list',
          kind: 'hasMany',
          provenance: 'derived-inverse',
          direction: 'inverse',
          cardinality: 'many',
        }),
        expect.objectContaining({
          relationId: 'TodoItem.tags',
          subjectEntityName: 'Tag',
          targetEntityName: 'TodoItem',
          name: 'TodoItem.tags',
          kind: 'manyToMany',
          provenance: 'derived-inverse',
          direction: 'inverse',
          cardinality: 'many',
        }),
      ]),
    );
  });
});
