import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runCollectArray } from '../../src/computation/stream.js';
import {
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  query,
  type DataGraphExecutionRuntime,
} from '../../src/data-graph/index.js';

describe('runtime-bound data graph api', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });

  const createRuntime = () =>
    ({
      get: vi.fn((_read, _params, options) =>
        Effect.succeed(options?.authority === 'viewer' ? { id: 'book-1', slug: 'progbook' } : null),
      ),
      run: vi.fn((_read, _params, options) =>
        Effect.succeed([{ id: 'book-1', optionAuthority: options?.authority }]),
      ),
      count: vi.fn(() => Effect.succeed(1)),
      stream: vi.fn(() => Stream.fromIterable([{ id: 'book-1' }])),
      runCommand: vi.fn((command, options) =>
        Effect.succeed({
          operation: command.operation,
          name: command.name,
          payload: command.payload,
          returning: command.returning,
          cardinality: command.cardinality,
          upsert: command.upsert,
          authority: options?.authority,
        }),
      ),
    }) as DataGraphExecutionRuntime<never, { authority: 'viewer' }, { authority: 'system' }>;

  it('binds raw reads and entity selections to the current runtime', async () => {
    const runtime = createRuntime();
    const api = createRuntimeBoundDataGraphApi(() => runtime);
    const read = query(Book).where(book => book.slug.eq('progbook'));
    const boundRead = api.bindGraphRead(read);
    const BookEntity = api.bindSelectionEntity(Book);
    const selection = BookEntity.where(book => book.slug.eq('progbook')).select(book => ({
      slug: book.slug,
    }));

    await expect(
      Effect.runPromise(boundRead.get(undefined, { authority: 'viewer' })),
    ).resolves.toEqual({ id: 'book-1', slug: 'progbook' });
    await expect(Effect.runPromise(selection.get({ authority: 'viewer' }))).resolves.toEqual({
      id: 'book-1',
      slug: 'progbook',
    });
    await expect(Effect.runPromise(selection.run({ authority: 'viewer' }))).resolves.toEqual([
      { id: 'book-1', optionAuthority: 'viewer' },
    ]);
    await expect(Effect.runPromise(selection.count({ authority: 'viewer' }))).resolves.toBe(1);
    await expect(
      Effect.runPromise(runCollectArray(selection.stream({ authority: 'viewer' }))),
    ).resolves.toEqual([{ id: 'book-1' }]);
    await expect(Effect.runPromise(selection.exists({ authority: 'viewer' }))).resolves.toBe(true);
    const executable = selection.exec();
    expect(executable.pipe(value => value)).toBe(executable);
    expect(selection.pipe(value => value)).toBe(selection);
  });

  it('creates runtime-bound insert, update, delete, upsert, and named-read helpers', async () => {
    const runtime = createRuntime();
    const api = createRuntimeBoundDataGraphApi(() => runtime);
    const BookEntity = api.bindSelectionEntity(Book);
    const selection = BookEntity.where(book => book.slug.eq('progbook'));

    await expect(
      Effect.runPromise(
        BookEntity.insertReturning({ slug: 'progbook', title: 'Progbook' }, ['id']).run({
          authority: 'system',
        }),
      ),
    ).resolves.toMatchObject({
      operation: 'insert',
      payload: { slug: 'progbook', title: 'Progbook' },
      returning: ['id'],
      cardinality: 'one',
      authority: 'system',
    });
    await expect(
      Effect.runPromise(
        BookEntity.insertManyReturning([{ slug: 'a' }, { slug: 'b' }], ['id']).run({
          authority: 'system',
        }),
      ),
    ).resolves.toMatchObject({
      operation: 'insert_many',
      returning: ['id'],
    });
    await expect(
      Effect.runPromise(
        BookEntity.upsert(
          { slug: 'progbook', title: 'Progbook' },
          { conflictOn: ['slug'], strategy: 'merge' },
        ).run({ authority: 'system' }),
      ),
    ).resolves.toMatchObject({
      operation: 'upsert',
      upsert: { conflictOn: ['slug'], strategy: 'merge' },
    });
    await expect(
      Effect.runPromise(
        BookEntity.upsertMany(
          [
            { slug: 'progbook', title: 'Progbook' },
            { slug: 'living-systems', title: 'Living Systems' },
          ],
          { conflictOn: ['slug'], strategy: 'ignore' },
        ).run({ authority: 'system' }),
      ),
    ).resolves.toMatchObject({
      operation: 'upsert',
      payload: [
        { slug: 'progbook', title: 'Progbook' },
        { slug: 'living-systems', title: 'Living Systems' },
      ],
      upsert: { conflictOn: ['slug'], strategy: 'ignore' },
    });
    await expect(
      Effect.runPromise(
        selection.updateOneReturning({ title: 'Updated' }, ['id']).run({ authority: 'system' }),
      ),
    ).resolves.toMatchObject({
      operation: 'update',
      returning: ['id'],
      cardinality: 'one',
    });
    await expect(
      Effect.runPromise(selection.deleteManyReturning(['id']).run({ authority: 'system' })),
    ).resolves.toMatchObject({
      operation: 'delete',
      returning: ['id'],
    });

    const namedFromSelection = selection.named('bookBySlug');
    const namedFromEntity = api.namedGraphRead(
      'bookBySlugParam',
      Book,
      (params: { slug: string }) =>
        api.selectionAssembly.createGraphSelection(
          query(Book).where(book => book.slug.eq(params.slug)),
        ),
    );

    expect(namedFromSelection.name).toBe('bookBySlug');
    expect(namedFromEntity.name).toBe('bookBySlugParam');
    await expect(
      Effect.runPromise(namedFromEntity.get({ slug: 'progbook' }, { authority: 'viewer' })),
    ).resolves.toEqual({ id: 'book-1', slug: 'progbook' });
    expect(() => api.namedGraphRead('missingBuilder', Book)).toThrow(
      'namedGraphRead(missingBuilder) requires a selection or a builder function.',
    );
  });

  it('keeps command failures separate from infallible graph reads', async () => {
    const commandFailure = { _tag: 'CommandFailure', message: 'write failed' } as const;
    const runtime = {
      ...createRuntime(),
      runCommand: () => Effect.fail(commandFailure),
    } as DataGraphExecutionRuntime<
      never,
      { authority: 'viewer' },
      { authority: 'system' },
      typeof commandFailure
    >;
    const api = createRuntimeBoundDataGraphApi(() => runtime);
    const BookEntity = api.bindSelectionEntity(Book);

    await expect(
      Effect.runPromise(
        BookEntity.insert({ slug: 'progbook', title: 'Progbook' })
          .run({ authority: 'system' })
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: commandFailure,
    });
  });
});
