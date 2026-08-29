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
  resolveHasManyTargetField,
} from './index.js';

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

  it('keeps virtual derived Fields out of physical storage mappings', () => {
    const Course = entity('CourseCapacity', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(field.nonNegativeInteger(), ({ capacity }) => capacity),
    });

    applyConventionalDataGraphMappings({
      entities: [Course],
      naming: { table: name => name, column: name => name },
    });

    expect(getEntityMapping(Course)).toEqual({
      tableName: 'CourseCapacity',
      columns: { id: 'id', capacity: 'capacity' },
    });
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
    const CourseWithStudents = Course.hasMany('students', Student);

    applyConventionalDataGraphMappings({
      entities: [CourseWithStudents, Student],
      naming: {
        table: name => name.toLowerCase(),
        column: name => name.toLowerCase(),
      },
    });

    expect(CourseWithStudents.relations.students?.mapping).toEqual({
      type: 'one-to-many',
      fromTable: 'course',
      fromColumn: 'id',
      toTable: 'student',
      toColumn: 'courseid',
    });
  });

  it('resolves effective has-many target fields from unique belongs-to and reverse mapping', () => {
    const Course = entity('MappedCourse', { id: field.id() });
    const Advisor = entity('Advisor', { id: field.id() });
    const Student = entity('MappedStudent', {
      id: field.id(),
      course: field.ref(Course),
      advisor: field.ref(Advisor),
    });
    Student.belongsTo('unmappedCourse', Course);
    const CourseWithStudents = Course.hasMany('students', Student);
    mapEntity(CourseWithStudents).toTable('courses');
    mapEntity(Student).toTable('students', { course: 'course_id' });

    expect(
      resolveHasManyTargetField(CourseWithStudents, CourseWithStudents.relations.students),
    ).toBe('course');

    mapRelation(CourseWithStudents, 'students', {
      type: 'many-to-one',
      from: 'students.course_id',
      to: 'courses.id',
    });
    expect(
      resolveHasManyTargetField(CourseWithStudents, CourseWithStudents.relations.students),
    ).toBe('course');
    expect(resolveHasManyTargetField(Student, Student.relations.course)).toBeUndefined();
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
