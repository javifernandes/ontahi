import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  defineClientEntity,
  entity,
  field,
  isExactEntityMutationDelta,
  materializeEntityMutationDelta,
  mutateEntity,
  toEntityMutationGraphCommand,
} from './index.js';

describe('Entity Mutation Command', () => {
  it('expresses exact create, update, and delete intent without carrying Entity definitions', () => {
    const Book = entity('Book', { id: field.id(), title: field.string() });
    const book = createEntityRef(Book, { id: 'book-1' });
    const mutation = mutateEntity(Book);

    expect(mutation.create({ id: 'book-1', title: 'Ontahi' })).toEqual({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'Book',
      values: { id: 'book-1', title: 'Ontahi' },
    });
    expect(mutation.update(book, { title: 'Ontahi revised' })).toEqual({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Book',
      target: book,
      values: { title: 'Ontahi revised' },
    });
    expect(mutation.delete(book)).toEqual({
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: 'Book',
      target: book,
    });
    expect(JSON.parse(JSON.stringify(mutation.delete(book)))).toEqual(mutation.delete(book));
  });

  it('rejects a target Ref for another Entity', () => {
    const Book = entity('Book', { id: field.id() });
    const Author = entity('Author', { id: field.id() });

    expect(() =>
      // @ts-expect-error Entity mutation targets are statically scoped to their Entity.
      mutateEntity(Book).delete(createEntityRef(Author, { id: 'author-1' })),
    ).toThrow('Expected Entity mutation target Ref for Book, got Author.');
    expect(() =>
      toEntityMutationGraphCommand(Book, mutateEntity(Author).create({ id: 'author-1' })),
    ).toThrow('Expected Entity mutation command for Book, got Author.');
    expect(() =>
      toEntityMutationGraphCommand(Book, {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Book',
        target: createEntityRef(Author, { id: 'author-1' }),
        values: {},
      }),
    ).toThrow('Expected Entity mutation target Ref for Book, got Author.');
  });

  it('rejects an empty exact-mutation condition before execution', () => {
    const Book = entity('Book', { id: field.id(), title: field.string() });
    const book = createEntityRef(Book, { id: 'book-1' });
    const mutation = mutateEntity(Book);

    expect(() => mutation.update(book, { title: 'Revised' }, { if: {} })).toThrow(
      'Entity mutation condition cannot be empty.',
    );
    expect(() => mutation.delete(book, { if: {} })).toThrow(
      'Entity mutation condition cannot be empty.',
    );
    expect(() =>
      toEntityMutationGraphCommand(Book, {
        ...mutation.delete(book),
        if: {},
      }),
    ).toThrow('Entity mutation condition cannot be empty.');
    expect(() =>
      toEntityMutationGraphCommand(Book, {
        ...mutation.delete(book),
        if: { missing: true },
      }),
    ).toThrow('Entity mutation condition cannot test Book.missing.');
  });

  it('requires an update/delete delta to identify the exact command target', () => {
    const Book = entity('Book', { id: field.id(), slug: field.string(), title: field.string() })
      .locators({ refBySlug: 'slug' })
      .identity('refById');
    const ClientBook = defineClientEntity(Book);
    const target = ClientBook.refBySlug('ontahi');
    const otherBook = createEntityRef(Book, { slug: 'other' });
    const command = mutateEntity(Book).update(target, { title: 'Revised' });
    const factValues = { id: 'book-1', slug: 'ontahi', title: 'Revised' };

    expect(
      isExactEntityMutationDelta(
        {
          created: [],
          updated: [{ entityName: 'Book', ref: otherBook, values: factValues }],
          deleted: [],
        },
        command,
      ),
    ).toBe(false);
    const materialized = materializeEntityMutationDelta(Book, command, factValues);

    expect(materialized).toEqual({
      created: [],
      updated: [{ entityName: 'Book', ref: target, values: factValues }],
      deleted: [],
    });
    expect(materialized.updated[0]?.ref).not.toBe(target);
    expect(materialized.updated[0]?.ref).not.toHaveProperty('update');
  });

  it('returns exact applied deltas through the in-memory runtime', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      note: field.optional(field.string()),
      label: field.derived(field.string(), () => ''),
    });
    const dataset = { Book: [] as Array<Record<string, unknown>> };
    const runtime = createInMemoryDataGraphRuntime({ dataset, entities: [Book] });
    const mutation = mutateEntity(Book);
    const book = createEntityRef(Book, { id: 'book-1' });

    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(mutation.create({ id: 'book-1', title: 'Ontahi' })),
      ),
    ).resolves.toEqual({
      created: [{ entityName: 'Book', ref: book, values: { id: 'book-1', title: 'Ontahi' } }],
      updated: [],
      deleted: [],
    });
    await expect(
      Effect.runPromise(runtime.runEntityMutationCommand(mutation.update(book, { title: 'Core' }))),
    ).resolves.toEqual({
      created: [],
      updated: [{ entityName: 'Book', ref: book, values: { id: 'book-1', title: 'Core' } }],
      deleted: [],
    });
    await expect(
      Effect.runPromise(runtime.runEntityMutationCommand(mutation.delete(book))),
    ).resolves.toEqual({
      created: [],
      updated: [],
      deleted: [{ entityName: 'Book', ref: book, values: { id: 'book-1', title: 'Core' } }],
    });
    expect(dataset.Book).toEqual([]);
  });

  it('tests and applies exact mutation conditions in one in-memory mutation boundary', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      revision: field.number(),
    });
    const dataset = {
      Book: [{ id: 'book-1', title: 'Draft', revision: 3 }],
    };
    const runtime = createInMemoryDataGraphRuntime({ dataset, entities: [Book] });
    const mutation = mutateEntity(Book);
    const book = createEntityRef(Book, { id: 'book-1' });

    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(
          mutation.update(book, { title: 'Published', revision: 4 }, { if: { revision: 3 } }),
        ),
      ),
    ).resolves.toMatchObject({
      updated: [{ values: { title: 'Published', revision: 4 } }],
    });

    const rejected = await Effect.runPromise(
      runtime
        .runEntityMutationCommand(mutation.delete(book, { if: { revision: 3 } }))
        .pipe(Effect.either),
    );

    expect(rejected).toMatchObject({
      _tag: 'Left',
      left: { reason: 'entity_mutation_condition_not_met' },
    });
    expect(dataset.Book).toEqual([{ id: 'book-1', title: 'Published', revision: 4 }]);
  });

  it('preserves a duplicate-identity cardinality failure without mutating either row', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      revision: field.number(),
    });
    const dataset = {
      Book: [
        { id: 'book-1', title: 'First copy', revision: 3 },
        { id: 'book-1', title: 'Second copy', revision: 3 },
      ],
    };
    const runtime = createInMemoryDataGraphRuntime({ dataset, entities: [Book] });
    const command = mutateEntity(Book).update(
      createEntityRef(Book, { id: 'book-1' }),
      { revision: 4 },
      { if: { revision: 3 } },
    );

    await expect(
      Effect.runPromise(runtime.runEntityMutationCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    expect(dataset.Book).toEqual([
      { id: 'book-1', title: 'First copy', revision: 3 },
      { id: 'book-1', title: 'Second copy', revision: 3 },
    ]);
  });
});
