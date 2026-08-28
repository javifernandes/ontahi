import {
  createEntityRef,
  entity,
  field,
  query,
  mapRelation,
  modelExpression,
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

  it('compiles virtual derived Fields from stored Fields and correlated Relation counts', () => {
    const Course = entity('DerivedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(
          modelExpression.subtract(
            modelExpression.field('capacity'),
            modelExpression.relation('students').count(),
          ),
        ),
      ),
    });
    const Student = entity('DerivedStudent', {
      id: field.id(),
      course: field.ref(Course),
    });
    const CourseWithStudents = Course.hasMany('students', Student, { via: 'course' });
    const [courseMapping] = inferPostgresMappings([CourseWithStudents, Student]);
    mapRelation(CourseWithStudents, 'students', {
      type: 'one-to-many',
      from: 'derived_courses.id',
      to: 'derived_students.course_id',
    });
    const Capacity = CourseWithStudents.view('DerivedCourseCapacity', {
      id: true,
      availableSeats: true,
    });

    expect(
      compilePostgresQuery(query(CourseWithStudents).as(Capacity), undefined, courseMapping!),
    ).toEqual({
      text:
        'SELECT "id" AS "id", "capacity" AS "capacity", ' +
        '("derived_courses"."capacity" - (SELECT COUNT(*)::int FROM "derived_students" AS "__ontahi_students_rows"' +
        ' WHERE "__ontahi_students_rows"."course_id" = "derived_courses"."id")) AS "availableSeats"' +
        ' FROM "derived_courses" WHERE TRUE',
      values: [],
    });
    const filtered = compilePostgresQuery(
      query(CourseWithStudents)
        .where(course => course.availableSeats.gt(0))
        .as(Capacity)
        .orderBy(course => course.availableSeats.desc()),
      undefined,
      courseMapping!,
    );
    expect(filtered.values).toEqual([0]);
    expect(filtered.text).toContain(
      'WHERE ("derived_courses"."capacity" - (SELECT COUNT(*)::int FROM "derived_students"',
    );
    expect(filtered.text).toContain(') > $1 ORDER BY ("derived_courses"."capacity" -');
    expect(filtered.text).toContain(' DESC NULLS LAST');
    expect(() =>
      compilePostgresCommand(
        {
          kind: 'command',
          operation: 'update',
          root: CourseWithStudents,
          selection: { kind: 'all' },
          payload: { availableSeats: 100 },
        },
        courseMapping!,
      ),
    ).toThrow('Cannot assign derived Fields on DerivedCourse: availableSeats.');
    expect(() =>
      compilePostgresCommand(
        {
          kind: 'command',
          operation: 'update',
          root: CourseWithStudents,
          selection: { kind: 'all' },
          payload: { capacity: 4 },
          returning: ['availableSeats'],
        },
        courseMapping!,
      ),
    ).toThrow(
      'PostgreSQL Commands cannot return virtual derived Fields on DerivedCourse: availableSeats.',
    );
  });

  it('compiles many-to-many Relation counts through the edge table', () => {
    const Tag = entity('DerivedTag', { id: field.id() });
    const Article = entity('DerivedArticle', {
      id: field.id(),
      tagCount: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(modelExpression.relation('tags').count()),
      ),
    }).manyToMany('tags', Tag);
    const [articleMapping] = inferPostgresMappings([Article, Tag]);
    mapRelation(Article, 'tags', {
      type: 'many-to-many',
      from: 'derived_articles.id',
      through: {
        table: 'derived_article_tags',
        fromColumn: 'article_id',
        toColumn: 'tag_id',
      },
      to: 'derived_tags.id',
    });
    const TagCount = Article.view('DerivedArticleTagCount', { id: true, tagCount: true });

    expect(
      compilePostgresQuery(query(Article).as(TagCount), undefined, articleMapping!).text,
    ).toContain(
      '(SELECT COUNT(*)::int FROM "derived_article_tags" AS "__ontahi_tags_edges"' +
        ' WHERE "__ontahi_tags_edges"."article_id" = "derived_articles"."id") AS "tagCount"',
    );
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
