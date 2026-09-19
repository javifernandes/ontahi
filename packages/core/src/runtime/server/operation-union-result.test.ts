import { Effect } from 'effect';
import { expect, expectTypeOf, it } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  value,
} from '../../data-graph/index.js';

import { entity, ontahi } from './index.js';

type Page = { state: 'not_found' } | { state: 'ready'; title: string; internal?: boolean };

it.each([false, true])(
  'preserves discriminated result unions in configured invocations (%s)',
  async found => {
    const Book = entity({
      name: 'UnionResultBook',
      fields: { id: field.id() },
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
        layer: 'test.union',
      },
      operations: ({ app }) => ({
        page: app.operation.define({
          input: value('UnionPageInput', { found: field.boolean() }),
          output: graphSchema.discriminatedUnion('state', [
            value('MissingPage', { state: graphSchema.literal('not_found') }),
            value('ReadyPage', { state: graphSchema.literal('ready'), title: field.string() }),
          ]),
          run: ({ found }): Effect.Effect<Page> =>
            Effect.succeed(found ? { state: 'ready', title: 'Book' } : { state: 'not_found' }),
        }),
      }),
    });
    const application = ontahi({
      entities: [Book],
      storage: createInMemoryDataGraphStorage({ dataset: {} }),
    });
    const operation = application.graph.entities.UnionResultBook.domain.page;
    const result = await application.app.operation.invoke(operation, { found });
    if (!result.ok) throw new Error(result.message);
    expectTypeOf(result.value).toEqualTypeOf<Page>();
    expect(result.value).toEqual(
      found ? { state: 'ready', title: 'Book' } : { state: 'not_found' },
    );
    const raw = await application.app.operation.runRaw(operation, { found });
    if (!raw.success) throw new Error('Expected success');
    expectTypeOf(raw.data).toEqualTypeOf<Page | undefined>();
  },
);
