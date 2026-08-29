import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  mutateEntity,
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

    expect(() => mutateEntity(Book).delete(createEntityRef(Author, { id: 'author-1' }))).toThrow(
      'Expected Entity mutation target Ref for Book, got Author.',
    );
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
});
