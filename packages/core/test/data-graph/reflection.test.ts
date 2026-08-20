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

  it('does not duplicate explicit inverse endpoints and derives an undeclared has-many inverse', () => {
    const Course = entity('Course', { id: field.id() });
    const Student = entity('Student', {
      id: field.id(),
      course: field.ref(Course),
    });
    Course.hasMany('students', Student, { via: 'course' });

    const Note = entity('Note', { id: field.id() });
    Course.hasMany('notes', Note);

    const reflected = reflectSchemaRelations([Course, Student, Note]);

    expect(reflected.filter(relation => relation.relationId === 'Student.course')).toHaveLength(1);
    expect(reflected.filter(relation => relation.relationId === 'Course.students')).toHaveLength(1);
    expect(reflected).toContainEqual(
      expect.objectContaining({
        relationId: 'Course.notes',
        subjectEntityName: 'Note',
        targetEntityName: 'Course',
        kind: 'belongsTo',
        provenance: 'derived-inverse',
        direction: 'forward',
        cardinality: 'one',
      }),
    );
  });

  it('treats reciprocal many-to-many declarations as explicit endpoints', () => {
    const Left = entity('Left', { id: field.id() });
    const Right = entity('Right', { id: field.id() });
    Left.manyToMany('rights', Right);
    Right.manyToMany('lefts', Left);

    const reflected = reflectSchemaRelations([Left, Right]);

    expect(reflected).toEqual([
      expect.objectContaining({
        relationId: 'Left.rights',
        subjectEntityName: 'Left',
        provenance: 'declared',
      }),
      expect.objectContaining({
        relationId: 'Right.lefts',
        subjectEntityName: 'Right',
        provenance: 'declared',
      }),
    ]);
  });
});
