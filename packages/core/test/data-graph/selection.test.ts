import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  GraphSelection,
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
      where: [{ operator: 'eq', fieldName: 'slug', value: 'progbook' }],
      orderBy: [{ fieldName: 'title', direction: 'asc' }],
      limit: 10,
    });
  });

  it('builds update command variants from a selection', () => {
    const selection = new GraphSelection(query(Book).where(book => book.slug.eq('progbook')));

    expect(selection.update({ title: 'Updated' }).build()).toMatchObject({
      operation: 'update',
      where: [{ operator: 'eq', fieldName: 'slug', value: 'progbook' }],
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
      where: [{ operator: 'eq', fieldName: 'slug', value: 'progbook' }],
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
    const where = query(Book)
      .where(book => book.slug.eq('progbook'))
      .build().where;

    expect(
      createUpdateCommandSpec(Book, where, { title: 'Updated' }, { returning: ['id'] }),
    ).toMatchObject({
      operation: 'update',
      returning: ['id'],
      payload: { title: 'Updated' },
    });

    expect(createDeleteCommandSpec(Book, where, { cardinality: 'one' })).toMatchObject({
      operation: 'delete',
      cardinality: 'one',
    });

    expect(
      createInsertCommandSpec(Book, { title: 'Created' }, { cardinality: 'one' }),
    ).toMatchObject({
      operation: 'insert',
      cardinality: 'one',
      where: [],
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
      createUpdateCommandSpec(Book, [], { title: 'Updated' }, { returning: ['id'] }),
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
