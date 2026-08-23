import { describe, expect, it } from 'vitest';

import { defineAudienceGraph, defineReaderGraph } from './fixtures.test-support.js';

import {
  compileQueryPlan,
  entity,
  field,
  getSelectColumnsForQuery,
  mapEntity,
  mapRelation,
  query,
  resolveQuerySpec,
  view,
} from './index.js';


describe('data-graph planning', () => {
  it('collects selected columns plus relation join keys', () => {
    const { BookWithCollaborators } = defineAudienceGraph();

    const spec = query(BookWithCollaborators)
      .select(book => ({
        slug: book.slug,
      }))
      .include(book => ({
        collaborators: book.collaborators,
      }))
      .build();

    expect(
      getSelectColumnsForQuery({
        entityDefinition: spec.root,
        selectShape: spec.select,
        includeShape: spec.includes,
      }),
    ).toEqual(['slug', 'id']);
  });

  it('resolves views into specs and compiles root plan metadata', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books');

    const bySlugView = view(
      'bookBySlug',
      Book,
      ({ root, params }: { root: typeof Book; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .orderBy(book => book.title),
    );

    const spec = resolveQuerySpec(bySlugView, { slug: 'progbook' });
    expect(spec.selection).toEqual({
      kind: 'predicate',
      operator: 'eq',
      fieldName: 'slug',
      value: 'progbook',
    });

    expect(compileQueryPlan(bySlugView, { slug: 'progbook' })).toEqual({
      rootEntity: 'Book',
      rootTable: 'books',
      selection: {
        operator: 'eq',
        field: 'slug',
        column: 'slug',
        value: 'progbook',
      },
      where: [
        {
          operator: 'eq',
          field: 'slug',
          column: 'slug',
          value: 'progbook',
        },
      ],
      orderBy: [
        {
          field: 'title',
          column: 'title',
          direction: 'asc',
        },
      ],
      limit: undefined,
      includes: [],
    });
  });

  it('compiles lte predicates into root plan metadata', () => {
    const Delivery = entity('NotificationDelivery', {
      id: field.id(),
      nextAttemptAt: field.nullable(field.string()),
    });

    mapEntity(Delivery).toTable('notification_deliveries', {
      nextAttemptAt: 'next_attempt_at',
    });

    const dueDeliveries = query(Delivery).where(delivery =>
      delivery.nextAttemptAt.lte('2026-01-01T00:10:00.000Z'),
    );

    expect(compileQueryPlan(dueDeliveries.build(), undefined).where).toEqual([
      {
        operator: 'lte',
        field: 'nextAttemptAt',
        column: 'next_attempt_at',
        value: '2026-01-01T00:10:00.000Z',
      },
    ]);
  });

  it('compiles lt predicates into root plan metadata', () => {
    const Notification = entity('UserNotification', {
      id: field.id(),
      createdAt: field.string(),
    });

    mapEntity(Notification).toTable('user_notifications', {
      createdAt: 'created_at',
    });

    const olderNotifications = query(Notification).where(notification =>
      notification.createdAt.lt('2026-01-01T00:10:00.000Z'),
    );

    expect(compileQueryPlan(olderNotifications.build(), undefined).where).toEqual([
      {
        operator: 'lt',
        field: 'createdAt',
        column: 'created_at',
        value: '2026-01-01T00:10:00.000Z',
      },
    ]);
  });

  it('compiles nested include execution metadata', () => {
    const { BookWithChapters } = defineReaderGraph();

    const readerView = view(
      'reader',
      BookWithChapters,
      ({ root, params }: { root: typeof BookWithChapters; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .include(book => ({
            chapters: book.chapters
              .orderBy(chapter => chapter.order)
              .include(chapter => ({
                blocks: chapter.blocks.orderBy(block => block.order).limit(3),
              })),
          })),
    );

    expect(compileQueryPlan(readerView, { slug: 'progbook' }).includes).toEqual([
      {
        relationName: 'chapters',
        relationKind: 'hasMany',
        sourceField: 'id',
        sourceColumn: 'id',
        targetField: 'bookId',
        targetColumn: 'book_id',
        targetEntity: 'Chapter',
        targetTable: 'chapters',
        orderBy: [
          {
            field: 'order',
            column: 'order',
            direction: 'asc',
          },
        ],
        limit: undefined,
        includes: [
          {
            relationName: 'blocks',
            relationKind: 'hasMany',
            sourceField: 'id',
            sourceColumn: 'id',
            targetField: 'chapterId',
            targetColumn: 'chapter_id',
            targetEntity: 'Block',
            targetTable: 'blocks',
            orderBy: [
              {
                field: 'order',
                column: 'order',
                direction: 'asc',
              },
            ],
            limit: 3,
            includes: [],
          },
        ],
      },
    ]);
  });

  it('compiles anonymous many-to-many edge traversal metadata', () => {
    const Tag = entity('PlanningTag', { id: field.id(), label: field.string() });
    const Todo = entity('PlanningTodo', { id: field.id() }).manyToMany('tags', Tag);
    mapEntity(Todo).toTable('planning_todos');
    mapEntity(Tag).toTable('planning_tags');
    mapRelation(Todo, 'tags', {
      type: 'many-to-many',
      from: 'planning_todos.id',
      through: { table: 'planning_todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
      to: 'planning_tags.id',
    });

    expect(
      compileQueryPlan(
        query(Todo).include(todo => ({ tags: todo.tags.orderBy(tag => tag.label) })),
        undefined,
      ).includes,
    ).toEqual([
      {
        relationName: 'tags',
        relationKind: 'manyToMany',
        sourceField: 'id',
        sourceColumn: 'id',
        targetField: 'id',
        targetColumn: 'id',
        targetEntity: 'PlanningTag',
        targetTable: 'planning_tags',
        through: {
          table: 'planning_todo_tags',
          sourceColumn: 'todo_id',
          targetColumn: 'tag_id',
        },
        orderBy: [{ field: 'label', column: 'label', direction: 'asc' }],
        limit: undefined,
        includes: [],
      },
    ]);
  });
});
