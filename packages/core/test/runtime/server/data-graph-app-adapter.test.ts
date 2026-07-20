import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { entity, field, type DataGraphExecutionRuntime } from '../../../src/data-graph/index.js';
import { createDataGraphArchitectureAdapter, layer } from '../../../src/runtime/server/index.js';

describe('data graph architecture adapter', () => {
  const BookDefinition = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });

  const createRuntime = (tenant: string) =>
    ({
      get: vi.fn((_read, _params, options) =>
        Effect.succeed({ id: 'book-1', slug: 'progbook', tenant, authority: options?.authority }),
      ),
      run: vi.fn((_read, _params, options) =>
        Effect.succeed([{ id: 'book-1', tenant, authority: options?.authority }]),
      ),
      count: vi.fn(() => Effect.succeed(1)),
      stream: vi.fn(() => Stream.empty),
      runCommand: vi.fn((command, options) =>
        Effect.succeed({
          operation: command.operation,
          payload: command.payload,
          tenant,
          authority: options?.authority,
        }),
      ),
    }) as DataGraphExecutionRuntime<never, { authority: 'viewer' }, { authority: 'system' }>;

  it('binds graph helpers to the runtime created by the active layer context', async () => {
    const runtimeFactory = vi.fn(runtime => createRuntime(runtime.input.tenant));
    const graph = createDataGraphArchitectureAdapter<
      { tenant: string },
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({
      createRuntime: runtimeFactory,
    });
    const Book = graph.defineEntity(BookDefinition);
    const bookBySlug = graph.namedGraphRead(
      'bookBySlug',
      BookDefinition,
      (params: { slug: string }) => Book.where(book => book.slug.eq(params.slug)),
    );
    const readRuntime = layer('features.books', {
      concerns: [graph.withRuntime<{ tenant: string }>()],
    }).effect('readRuntime', (input: { tenant: string }) =>
      Effect.gen(function* () {
        const rows = yield* Book.where(book => book.slug.eq('progbook')).run({
          authority: 'viewer',
        });
        const named = yield* bookBySlug.get({ slug: 'progbook' }, { authority: 'viewer' });
        const inserted = yield* Book.insertReturning({ slug: 'progbook', title: 'Progbook' }, [
          'id',
        ]).run({ authority: 'system' });

        return { rows, named, inserted, input };
      }),
    );

    await expect(readRuntime({ tenant: 'tenant-a' })).resolves.toEqual({
      input: { tenant: 'tenant-a' },
      inserted: {
        authority: 'system',
        operation: 'insert',
        payload: { slug: 'progbook', title: 'Progbook' },
        tenant: 'tenant-a',
      },
      named: {
        authority: 'viewer',
        id: 'book-1',
        slug: 'progbook',
        tenant: 'tenant-a',
      },
      rows: [{ authority: 'viewer', id: 'book-1', tenant: 'tenant-a' }],
    });
    expect(runtimeFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { tenant: 'tenant-a' },
        scope: 'features.books.readRuntime',
      }),
    );
  });
});
