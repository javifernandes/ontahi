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

import { entity, field, mapEntity, mapRelation, query } from './index.js';


describe('data-graph in-memory materialization', () => {
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
  });
});
