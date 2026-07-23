import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  GraphSelection,
  Selection,
  createBoundGraphCommand,
  createDeleteCommandSpec,
  createInsertCommandSpec,
  createInsertManyCommandSpec,
  createUpsertCommandSpec,
  createUpdateCommandSpec,
  entity,
  field,
  mapEntity,
  query,
  selection,
} from '../../src/data-graph/index.js';

describe('data-graph selection helpers', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
    ownerId: field.id(),
  });

  mapEntity(Book).toTable('books', {
    ownerId: 'owner_id',
  });

  it('builds query transforms through GraphSelection fluent helpers', () => {
    const selection = new GraphSelection(query(Book))
      .where(book => book.slug.eq('progbook'))
      .select(book => ({
        slug: book.slug,
        title: book.title,
      }))
      .orderBy(book => book.title)
      .limit(10);

    expect(selection.root).toBe(Book);
    expect(selection.build()).toMatchObject({
      root: Book,
      selection: { operator: 'eq', fieldName: 'slug', value: 'progbook' },
      orderBy: [{ fieldName: 'title', direction: 'asc' }],
      limit: 10,
    });
  });

  it('treats membership selections as first-class composable values', () => {
    const owned = selection(Book, book => book.ownerId.eq('owner-1')).named('ownedBooks');
    const visible = owned
      .or(book => book.slug.eq('public'))
      .and(selection(Book, book => book.title.eq('Ontahí')).not());

    expect(owned.name).toBe('ownedBooks');
    expect(visible.toAst()).toEqual({
      kind: 'selection',
      entityName: 'Book',
      expression: {
        kind: 'and',
        operands: [
          {
            kind: 'or',
            operands: [
              { kind: 'predicate', operator: 'eq', fieldName: 'ownerId', value: 'owner-1' },
              { kind: 'predicate', operator: 'eq', fieldName: 'slug', value: 'public' },
            ],
          },
          {
            kind: 'not',
            operand: {
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'title',
              value: 'Ontahí',
            },
          },
        ],
      },
    });
    expect(query(Book).where(visible).build().selection).toEqual(visible.build());
    expect(visible.toQuery().build().selection).toEqual(visible.build());
    expect(createDeleteCommandSpec(Book, visible).selection).toEqual(visible.build());
    expect(visible.update({ title: 'Visible' }).build()).toMatchObject({
      operation: 'update',
      root: Book,
      selection: visible.build(),
      payload: { title: 'Visible' },
    });
  });

  it('provides all and none selections and rejects cross-entity composition', () => {
    const Author = entity('Author', { id: field.id() });

    expect(Selection.all(Book).build()).toEqual({ kind: 'all' });
    expect(Selection.none(Book).build()).toEqual({ kind: 'none' });
    expect(() => Selection.all(Book).and(Selection.all(Author) as never)).toThrow(
      'Cannot combine a Book selection with Author.',
    );
    expect(() => query(Book).where(Selection.all(Author) as never)).toThrow(
      'Cannot apply a Author selection to Book.',
    );
  });

  it('carries exact-one requirements into reads and commands without allowing weakening', () => {
    const exactBook = new Selection(
      Book,
      { kind: 'predicate', operator: 'eq', fieldName: 'slug', value: 'progbook' },
      undefined,
      'one',
    );
    const selected = new GraphSelection(query(Book).where(exactBook));

    expect(selected.build().cardinality).toBe('one');
    expect(selected.update({ title: 'Updated' }).build().cardinality).toBe('one');
    expect(selected.updateMany({ title: 'Updated' }).build().cardinality).toBe('one');
    expect(selected.delete().build().cardinality).toBe('one');
    expect(selected.deleteMany().build().cardinality).toBe('one');
    expect(exactBook.and(book => book.ownerId.eq('owner-1')).cardinality).toBe('one');
  });

  it('builds update command variants from a selection', () => {
    const selection = new GraphSelection(query(Book).where(book => book.slug.eq('progbook')));

    expect(selection.update({ title: 'Updated' }).build()).toMatchObject({
      operation: 'update',
      selection: { operator: 'eq', fieldName: 'slug', value: 'progbook' },
      payload: { title: 'Updated' },
    });

    expect(selection.updateOne({ title: 'Updated' }).build()).toMatchObject({
      operation: 'update',
      cardinality: 'one',
    });

    expect(selection.updateMany({ title: 'Updated' }).build()).toMatchObject({
      operation: 'update',
      payload: { title: 'Updated' },
    });

    expect(selection.updateReturning({ title: 'Updated' }, ['id', 'title']).build()).toMatchObject({
      operation: 'update',
      returning: ['id', 'title'],
    });

    expect(
      selection.updateOneReturning({ title: 'Updated' }, ['id', 'title']).build(),
    ).toMatchObject({
      operation: 'update',
      returning: ['id', 'title'],
      cardinality: 'one',
    });

    expect(
      selection.updateManyReturning({ title: 'Updated' }, ['id', 'title']).build(),
    ).toMatchObject({
      operation: 'update',
      returning: ['id', 'title'],
    });
  });

  it('builds delete command variants from a selection', () => {
    const selection = new GraphSelection(query(Book).where(book => book.slug.eq('progbook')));

    expect(selection.delete().build()).toMatchObject({
      operation: 'delete',
      selection: { operator: 'eq', fieldName: 'slug', value: 'progbook' },
    });

    expect(selection.deleteOne().build()).toMatchObject({
      operation: 'delete',
      cardinality: 'one',
    });

    expect(selection.deleteMany().build()).toMatchObject({
      operation: 'delete',
    });

    expect(selection.deleteOneReturning(['id']).build()).toMatchObject({
      operation: 'delete',
      returning: ['id'],
      cardinality: 'one',
    });

    expect(selection.deleteManyReturning(['id']).build()).toMatchObject({
      operation: 'delete',
      returning: ['id'],
    });
  });

  it('supports top-level command spec factories and pipe helpers', () => {
    const selectionExpression = query(Book)
      .where(book => book.slug.eq('progbook'))
      .build().selection;

    expect(
      createUpdateCommandSpec(
        Book,
        selectionExpression,
        { title: 'Updated' },
        { returning: ['id'] },
      ),
    ).toMatchObject({
      operation: 'update',
      returning: ['id'],
      payload: { title: 'Updated' },
    });

    expect(
      createDeleteCommandSpec(Book, selectionExpression, { cardinality: 'one' }),
    ).toMatchObject({
      operation: 'delete',
      cardinality: 'one',
    });

    expect(
      createInsertCommandSpec(Book, { title: 'Created' }, { cardinality: 'one' }),
    ).toMatchObject({
      operation: 'insert',
      cardinality: 'one',
      selection: { kind: 'none' },
    });

    expect(
      createInsertManyCommandSpec(Book, [{ title: 'A' }, { title: 'B' }], { returning: ['id'] }),
    ).toMatchObject({
      operation: 'insert_many',
      returning: ['id'],
    });

    expect(
      createUpsertCommandSpec(
        Book,
        { slug: 'progbook' },
        {
          conflictOn: ['slug'],
          strategy: 'ignore',
        },
      ),
    ).toMatchObject({
      operation: 'upsert',
      upsert: { conflictOn: ['slug'], strategy: 'ignore' },
    });

    expect(new GraphSelection(query(Book)).pipe(selection => selection.root)).toBe(Book);
  });

  it('binds graph commands to an executor without app-specific subclasses', async () => {
    const calls: Array<{ name: string | undefined; title: string | undefined }> = [];
    const command = createBoundGraphCommand(
      createUpdateCommandSpec(Book, { kind: 'all' }, { title: 'Updated' }, { returning: ['id'] }),
      {
        run: <TResult>(input: ReturnType<typeof createUpdateCommandSpec>) =>
          Effect.sync(() => {
            calls.push({
              name: input.name,
              title: (input.payload as { title?: string }).title,
            });
            return { id: 'book-1' } as TResult;
          }),
      },
    );

    await expect(Effect.runPromise(command.named('renameBook').run())).resolves.toEqual({
      id: 'book-1',
    });
    expect(calls).toEqual([{ name: 'renameBook', title: 'Updated' }]);
  });
});
