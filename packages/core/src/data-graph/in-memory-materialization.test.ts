import { describe, expect, it } from 'vitest';

import {
  defineAudienceGraph,
  defineReaderGraph,
  expectedReaderResult,
  readerDataset,
} from './fixtures.test-support.js';
import {
  materializeRecord,
  materializeRelation,
  type InMemoryDataset,
} from './in-memory/materialization.js';

import {
  entity,
  field,
  mapEntity,
  mapRelation,
  modelExpression,
  query,
  Selection,
} from './index.js';

describe('data-graph in-memory materialization', () => {
  it('evaluates virtual derived Fields from stored Fields and complete Relation aggregates', () => {
    const Course = entity('DerivedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      occupiedSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(modelExpression.relation('students').count()),
      ),
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
    Course.hasMany('students', Student, { via: 'course' });
    const summary = query(Course)
      .select(course => ({
        id: course.id,
        occupiedSeats: course.occupiedSeats,
        availableSeats: course.availableSeats,
      }))
      .build();
    const dataset: InMemoryDataset = {
      DerivedCourse: [{ id: 'course-1', capacity: 3 }],
      DerivedStudent: [
        { id: 'student-1', course: 'course-1' },
        { id: 'student-2', course: 'course-1' },
      ],
    };

    expect(
      materializeRecord(
        dataset.DerivedCourse[0]!,
        Course,
        summary.select,
        summary.includes,
        dataset,
      ),
    ).toEqual({ id: 'course-1', occupiedSeats: 2, availableSeats: 1 });
    expect(dataset.DerivedCourse).toEqual([{ id: 'course-1', capacity: 3 }]);
    expect(
      materializeRecord(dataset.DerivedCourse[0]!, Course, summary.select, summary.includes, {
        DerivedCourse: dataset.DerivedCourse,
      }),
    ).toEqual({ id: 'course-1', occupiedSeats: undefined, availableSeats: undefined });
  });

  it('hydrates nested hasMany relations with ordering and nested includes', () => {
    const { BookWithChapters } = defineReaderGraph();

    const readerSpec = query(BookWithChapters)
      .include(book => ({
        chapters: book.chapters
          .orderBy(chapter => chapter.order)
          .include(chapter => ({
            blocks: chapter.blocks.orderBy(block => block.order),
          })),
      }))
      .build();

    const dataset: InMemoryDataset = readerDataset;

    const result = materializeRecord(
      dataset.Book[0]!,
      BookWithChapters,
      readerSpec.select,
      readerSpec.includes,
      dataset,
    );

    expect(result).toEqual(expectedReaderResult);
  });

  it('materializes relation builders inside selections and keeps belongsTo null when missing', () => {
    const { BookWithCollaborators } = defineAudienceGraph();

    const audienceSpec = query(BookWithCollaborators)
      .select(book => ({
        slug: book.slug,
        audience: book.collaborators.select(collaborator => ({
          userId: collaborator.userId,
          profile: collaborator.profile,
        })),
      }))
      .build();

    const dataset: InMemoryDataset = {
      Book: [{ id: 'book-1', slug: 'progbook' }],
      BookCollaborator: [
        { bookId: 'book-1', userId: 'user-1' },
        { bookId: 'book-1', userId: 'missing-profile' },
      ],
      Profile: [{ id: 'user-1', displayName: 'Ada' }],
    };

    const result = materializeRecord(
      dataset.Book[0]!,
      BookWithCollaborators,
      audienceSpec.select,
      audienceSpec.includes,
      dataset,
    );

    expect(result).toEqual({
      slug: 'progbook',
      audience: [
        {
          userId: 'user-1',
          profile: { id: 'user-1', displayName: 'Ada' },
        },
        {
          userId: 'missing-profile',
          profile: null,
        },
      ],
    });
  });

  it('skips nullish selection entries to match query planning', () => {
    const dynamicUndefinedSelection = undefined as any;
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const spec = query(Book)
      .select(book => ({
        slug: book.slug,
        maybe: dynamicUndefinedSelection,
      }))
      .build();

    const result = materializeRecord(
      { id: 'book-1', slug: 'progbook' },
      Book,
      spec.select as any,
      spec.includes,
      { Book: [] },
    );

    expect(result).toEqual({
      slug: 'progbook',
    });
  });

  it('hydrates a single belongsTo relation directly', () => {
    const Collaborator = entity('BookCollaborator', {
      bookId: field.id(),
      userId: field.id(),
    });
    const Profile = entity('Profile', {
      id: field.id(),
      displayName: field.string(),
    });

    const CollaboratorWithProfile = Collaborator.belongsTo('profile', Profile);

    mapEntity(CollaboratorWithProfile).toTable('book_collaborators', {
      bookId: 'book_id',
      userId: 'user_id',
    });
    mapEntity(Profile).toTable('profiles', {
      displayName: 'display_name',
    });

    mapRelation(CollaboratorWithProfile, 'profile', {
      type: 'many-to-one',
      from: 'book_collaborators.user_id',
      to: 'profiles.id',
    });

    const relationNode = query(CollaboratorWithProfile)
      .include(collaborator => ({
        profile: collaborator.profile,
      }))
      .build()
      .includes!.profile.toNodeSpec();

    const dataset: InMemoryDataset = {
      BookCollaborator: [{ bookId: 'book-1', userId: 'user-1' }],
      Profile: [{ id: 'user-1', displayName: 'Ada' }],
    };

    const result = materializeRelation(
      dataset.BookCollaborator[0]!,
      CollaboratorWithProfile,
      relationNode,
      dataset,
    );

    expect(result).toEqual({ id: 'user-1', displayName: 'Ada' });

    const inaccessible = query(CollaboratorWithProfile)
      .include(collaborator => ({
        profile: collaborator.profile.withSelection(
          Selection.where(Profile, profile => profile.displayName.eq('Grace')).expression,
        ),
      }))
      .build()
      .includes!.profile.toNodeSpec();

    expect(() =>
      materializeRelation(
        dataset.BookCollaborator[0]!,
        CollaboratorWithProfile,
        inaccessible,
        dataset,
      ),
    ).toThrow(
      'Required Relation BookCollaborator.profile was inaccessible under nested Graph Read scope.',
    );

    expect(
      materializeRelation(
        dataset.BookCollaborator[0]!,
        CollaboratorWithProfile,
        { ...inaccessible, nullable: true },
        dataset,
      ),
    ).toBeNull();
  });

  it('evaluates relation-image and Boolean scopes inside nested materialization', () => {
    const Target = entity('ScopedTarget', {
      id: field.id(),
      containerId: field.id(),
      ownerId: field.id(),
      active: field.boolean(),
    });
    const Owner = entity('ScopedOwner', {
      id: field.id(),
      containerId: field.id(),
    }).hasMany('targets', Target, { via: 'ownerId' });
    const Container = entity('ScopedContainer', { id: field.id() })
      .hasMany('targets', Target, { via: 'containerId' })
      .hasMany('owners', Owner, { via: 'containerId' });
    const ownerTargets = Selection.where(Owner, owner => owner.id.eq('owner-1')).through('targets');
    const ownerTargetsImage = ownerTargets.expression;
    if (ownerTargetsImage.kind !== 'relation-image') throw new Error('Expected relation image');
    const scoped = query(Container)
      .include(container => ({
        targets: container.targets.withSelection({
          kind: 'and',
          operands: [
            { kind: 'or', operands: [{ kind: 'none' }, ownerTargetsImage] },
            {
              kind: 'not',
              operand: { kind: 'predicate', fieldName: 'active', operator: 'eq', value: false },
            },
          ],
        }),
      }))
      .build()
      .includes!.targets.toNodeSpec();
    const dataset: InMemoryDataset = {
      ScopedContainer: [{ id: 'container-1' }],
      ScopedOwner: [
        { id: 'owner-1', containerId: 'container-1' },
        { id: 'owner-2', containerId: 'container-1' },
      ],
      ScopedTarget: [
        { id: 'target-1', containerId: 'container-1', ownerId: 'owner-1', active: true },
        { id: 'target-2', containerId: 'container-1', ownerId: 'owner-2', active: true },
        { id: 'target-3', containerId: 'container-1', ownerId: 'owner-1', active: false },
      ],
    };

    expect(materializeRelation(dataset.ScopedContainer[0]!, Container, scoped, dataset)).toEqual([
      { id: 'target-1', containerId: 'container-1', ownerId: 'owner-1', active: true },
    ]);

    expect(() =>
      materializeRelation(
        dataset.ScopedContainer[0]!,
        Container,
        {
          ...scoped,
          selection: {
            ...ownerTargetsImage,
            source: { ...ownerTargetsImage.source, entityName: 'MissingOwner' },
          },
        },
        dataset,
      ),
    ).toThrow('cannot resolve source Entity MissingOwner');
    expect(() =>
      materializeRelation(
        dataset.ScopedContainer[0]!,
        Container,
        {
          ...scoped,
          selection: { ...ownerTargetsImage, relationName: 'missingTargets' },
        },
        dataset,
      ),
    ).toThrow('cannot resolve ScopedOwner.missingTargets to ScopedTarget');
  });
});
