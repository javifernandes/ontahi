import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  createRelatedRootReadSpec,
  getPublicSourceFieldAccessor,
  isRelatedRootReadSpec,
  materializeFlatSelection,
  query,
  resolveRelatedRootFields,
  selectionUsesRelationBuilders,
  stripQueryShape,
  type DataGraphExecutionRuntime,
} from '../../src/data-graph/index.js';

import { defineAudienceGraph } from './fixtures.js';

describe('relation-root graph reads', () => {
  it('builds a first-class read spec from a source query and target selection', () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const source = query(BookCollaboratorWithProfile)
      .where(collaborator => collaborator.userId.eq('user-1'))
      .select(collaborator => ({ bookId: collaborator.bookId, userId: collaborator.userId }))
      .build();
    const target = query(BookWithCollaborators)
      .select(book => ({
        id: book.id,
        slug: book.slug,
      }))
      .build();

    const spec = createRelatedRootReadSpec({
      mode: 'resolve',
      source,
      sourceEntity: BookCollaboratorWithProfile,
      target,
      relationName: 'collaborators' as keyof typeof BookWithCollaborators.relations & string,
    });

    expect(spec).toMatchObject({
      kind: 'related-root-read',
      mode: 'resolve',
      sourceEntity: BookCollaboratorWithProfile,
      target,
      source,
      relationName: 'collaborators',
    });
  });

  it('resolves relation fields and hidden source-key accessors from declared mappings', () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const fields = resolveRelatedRootFields(
      BookWithCollaborators,
      BookCollaboratorWithProfile,
      'collaborators' as keyof typeof BookWithCollaborators.relations & string,
    );
    const selectedCollaborator = query(BookCollaboratorWithProfile)
      .select(collaborator => ({
        identifier: collaborator.bookId,
        userId: collaborator.userId,
      }))
      .build();
    const accessor = getPublicSourceFieldAccessor(selectedCollaborator, fields.sourceField);

    expect(fields).toEqual({ targetField: 'id', sourceField: 'bookId' });
    expect(accessor?.({ identifier: 'book-1', userId: 'user-1' })).toBe('book-1');
    expect(
      stripQueryShape(
        query(BookCollaboratorWithProfile)
          .select(row => ({ userId: row.userId }))
          .build(),
      ).select,
    ).toBeUndefined();
  });

  it('executes relation-root selection modes through the bound read executor', async () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const runtime = {
      get: vi.fn(() => Effect.succeed({ slug: 'progbook' })),
      run: vi.fn(read => {
        const relatedRead = read as unknown;
        if (
          isRelatedRootReadSpec(relatedRead) &&
          (relatedRead as { mode: string }).mode === 'resolve'
        ) {
          return Effect.succeed([
            {
              sourceRows: [{ bookId: 'book-1' }],
              rows: [{ slug: 'progbook' }],
            },
          ]);
        }

        if (
          isRelatedRootReadSpec(relatedRead) &&
          (relatedRead as { mode: string }).mode === 'countBySource'
        ) {
          return Effect.succeed([
            {
              sourceRows: [{ bookId: 'book-1' }],
              countsBySource: new Map([['book-1', 2]]),
            },
          ]);
        }

        return Effect.succeed([{ slug: 'progbook' }]);
      }),
      count: vi.fn(() => Effect.succeed(1)),
      stream: vi.fn(),
      runCommand: vi.fn(),
    } as unknown as DataGraphExecutionRuntime;
    const api = createRuntimeBoundDataGraphApi(() => runtime);
    const Book = api.bindSelectionEntity(BookWithCollaborators);
    const BookCollaborator = api.bindSelectionEntity(BookCollaboratorWithProfile);
    const selection = Book.relatedTo(
      BookCollaborator.where(collaborator => collaborator.userId.eq('user-1')).select(
        collaborator => ({
          bookId: collaborator.bookId,
          userId: collaborator.userId,
        }),
      ),
      { through: 'collaborators' },
    )
      .where(book => book.slug.eq('progbook'))
      .select(book => ({ slug: book.slug }))
      .orderBy(book => book.slug)
      .limit(1);

    expect(selection.entity).toBe(Book);
    expect(selection.build()).toMatchObject({
      kind: 'related-root-read',
      mode: 'rows',
      relationName: 'collaborators',
      sourceEntity: BookCollaboratorWithProfile,
    });
    await expect(Effect.runPromise(selection.run())).resolves.toEqual([{ slug: 'progbook' }]);
    await expect(Effect.runPromise(selection.get())).resolves.toEqual({ slug: 'progbook' });
    await expect(Effect.runPromise(selection.count())).resolves.toBe(1);
    await expect(Effect.runPromise(selection.exists())).resolves.toBe(true);
    await expect(Effect.runPromise(selection.resolveEntityRows())).resolves.toEqual([
      { slug: 'progbook' },
    ]);
    await expect(Effect.runPromise(selection.resolve())).resolves.toEqual({
      sourceRows: [{ bookId: 'book-1' }],
      rows: [{ slug: 'progbook' }],
    });
    await expect(Effect.runPromise(selection.countBySource())).resolves.toEqual({
      sourceRows: [{ bookId: 'book-1' }],
      countsBySource: new Map([['book-1', 2]]),
    });
  });

  it('builds nested relation-root source specs', () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const runtime = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      stream: vi.fn(),
      runCommand: vi.fn(),
    } as unknown as DataGraphExecutionRuntime;
    const api = createRuntimeBoundDataGraphApi(() => runtime);
    const Book = api.bindSelectionEntity(BookWithCollaborators);
    const BookCollaborator = api.bindSelectionEntity(BookCollaboratorWithProfile);
    const booksForUser = Book.relatedTo(
      BookCollaborator.where(collaborator => collaborator.userId.eq('user-1')),
      { through: 'collaborators' },
    );
    const nestedBooks = Book.relatedTo(booksForUser, { through: 'collaborators' });

    expect(nestedBooks.build().source).toMatchObject({
      kind: 'related-root-read',
      mode: 'rows',
      relationName: 'collaborators',
    });
  });

  it('detects relation builders in selection shapes and materializes flat selections', () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const nestedRelationSelection = query(BookWithCollaborators)
      .select(book => ({
        slug: book.slug,
        nested: {
          collaborators: book.collaborators,
        },
      }))
      .build().select;
    const flatSelection = query(BookCollaboratorWithProfile)
      .select(collaborator => ({
        identifier: collaborator.bookId,
        nested: {
          user: collaborator.userId,
        },
      }))
      .build().select;

    expect(selectionUsesRelationBuilders(undefined)).toBe(false);
    expect(selectionUsesRelationBuilders(nestedRelationSelection)).toBe(true);
    expect(selectionUsesRelationBuilders(flatSelection)).toBe(false);
    expect(
      materializeFlatSelection(
        {
          bookId: 'book-1',
          userId: 'user-1',
        },
        flatSelection ?? {},
      ),
    ).toEqual({
      identifier: 'book-1',
      nested: {
        user: 'user-1',
      },
    });
    expect(getPublicSourceFieldAccessor({ includes: {} }, 'bookId')).toBeNull();
    expect(getPublicSourceFieldAccessor({ select: nestedRelationSelection }, 'bookId')).toBeNull();
    expect(getPublicSourceFieldAccessor({ select: flatSelection }, 'missing')).toBeNull();
  });

  it('throws clear relation-root metadata errors for invalid relationships', () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators, Profile } = defineAudienceGraph();
    const UnmappedBook = entity('UnmappedBook', {
      id: field.id(),
    }).hasMany('collaborators', BookCollaboratorWithProfile);

    expect(() =>
      resolveRelatedRootFields(
        UnmappedBook,
        BookCollaboratorWithProfile,
        'collaborators' as keyof typeof UnmappedBook.relations & string,
      ),
    ).toThrow('Relation UnmappedBook.collaborators is missing mapping metadata.');
    expect(() =>
      resolveRelatedRootFields(
        BookWithCollaborators,
        Profile,
        'collaborators' as keyof typeof BookWithCollaborators.relations & string,
      ),
    ).toThrow('Relation Book.collaborators does not connect to source entity Profile.');
    expect(isRelatedRootReadSpec({ kind: 'query' })).toBe(false);
    expect(isRelatedRootReadSpec(null)).toBe(false);
  });
});
