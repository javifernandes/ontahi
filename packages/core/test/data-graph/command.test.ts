import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  GraphCommand,
  createBoundGraphCommand,
  createExecutableGraphCommand,
  createUpdateCommandSpec,
  entity,
  field,
  query,
  type GraphCommandExecutor,
} from '../../src/data-graph/index.js';

describe('data-graph commands', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });
  const where = query(Book)
    .where(book => book.slug.eq('progbook'))
    .build().where;

  it('builds immutable named command specs and supports pipe helpers', () => {
    const command = new GraphCommand(createUpdateCommandSpec(Book, where, { title: 'Updated' }));
    const named = command.named('renameBook');

    expect(command.build().name).toBeUndefined();
    expect(named.build()).toMatchObject({
      name: 'renameBook',
      operation: 'update',
      payload: { title: 'Updated' },
    });
    expect(named.pipe(value => value.build().name)).toBe('renameBook');
  });

  it('binds executable commands to an executor with options', async () => {
    const command = createUpdateCommandSpec(Book, where, { title: 'Updated' });
    const executor = {
      run: vi.fn((spec, options?: { authority: 'system' }) =>
        Effect.succeed({
          name: spec.name,
          operation: spec.operation,
          authority: options?.authority,
        }),
      ),
    } as unknown as GraphCommandExecutor<never, { authority: 'system' }>;
    const executable = createExecutableGraphCommand(command, executor);
    const bound = createBoundGraphCommand(command, executor);
    const namedBound = bound.named('renameBook');

    expect(executable.pipe(value => value)).toBe(executable);
    await expect(Effect.runPromise(executable.run({ authority: 'system' }))).resolves.toEqual({
      name: undefined,
      operation: 'update',
      authority: 'system',
    });
    expect(bound.exec()).toBe(bound.exec());
    await expect(Effect.runPromise(namedBound.run({ authority: 'system' }))).resolves.toEqual({
      name: 'renameBook',
      operation: 'update',
      authority: 'system',
    });
  });
});
