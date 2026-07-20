import {
  createEntityRef,
  defineClientDomainOperation,
  defineEntityRefInput,
  entity,
  field,
  queryRef,
} from '@ontahi/core/data-graph';
import { getActionInvalidationQueryKeys, getActionQueryKey } from '@ontahi/core/runtime/actions';
import { describe, expect, it } from 'vitest';

import { attachOperationBridgeActionRuntime } from '../../src/actions/index.js';

describe('operation bridge query keys', () => {
  const successResult = {
    ok: true,
    kind: 'success',
    value: {},
  } as const;

  it('normalizes direct entity refs before resolving action query keys', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const operation = {
      id: 'CommentThread.listThreadsForBook',
      entityName: 'CommentThread',
      name: 'listThreadsForBook',
      ...defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        inputRefs: {
          book: defineEntityRefInput(Book),
        },
        bridge: {
          query: [({ cursor: _cursor, ...rest }: Record<string, unknown>) => rest],
        },
      }),
    };
    const action = attachOperationBridgeActionRuntime(
      operation,
      async () => ({
        data: successResult,
      }),
      {
        requiresAuth: true,
      },
    );

    expect(
      getActionQueryKey(action, {
        book: createEntityRef(Book, {
          slug: 'progbook',
        }),
        cursor: 'next-page',
        stateFilter: 'all',
      }),
    ).toEqual([
      'CommentThread',
      'listThreadsForBook',
      { bookSlug: 'progbook', stateFilter: 'all' },
    ]);
  });

  it('resolves semantic ref query key segments from direct refs and legacy fields', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refById: 'id',
      refBySlug: 'slug',
    });
    const operation = {
      id: 'Book.fetchBookInfo',
      entityName: 'Book',
      name: 'fetchBookInfo',
      ...defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        inputRefs: {
          book: defineEntityRefInput(Book),
        },
        bridge: {
          query: [queryRef('book')],
        },
      }),
    };
    const action = attachOperationBridgeActionRuntime(
      operation,
      async () => ({
        data: successResult,
      }),
      {
        requiresAuth: false,
      },
    );

    expect(
      getActionQueryKey(action, {
        book: createEntityRef(Book, {
          slug: 'progbook',
        }),
      }),
    ).toEqual(['Book', 'fetchBookInfo', 'progbook']);

    expect(
      getActionQueryKey(action, {
        bookSlug: 'progbook',
      }),
    ).toEqual(['Book', 'fetchBookInfo', 'progbook']);
  });

  it('normalizes direct entity refs before resolving affected query keys', () => {
    const Thread = entity('CommentThread', {
      id: field.id(),
    }).locators({
      refById: 'id',
    });
    const operation = {
      id: 'CommentThread.toggleThreadState',
      entityName: 'CommentThread',
      name: 'toggleThreadState',
      ...defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        inputRefs: {
          thread: defineEntityRefInput(Thread),
        },
        bridge: {
          invalidate: [['CommentThread', (input: { threadId: string }) => input.threadId]],
        },
      }),
    };
    const action = attachOperationBridgeActionRuntime(
      operation,
      async () => ({
        data: successResult,
      }),
      {
        requiresAuth: true,
      },
    );

    expect(
      getActionInvalidationQueryKeys(action, {
        data: {},
        input: {
          thread: createEntityRef(Thread, {
            id: 'thread-1',
          }),
        },
      }),
    ).toEqual([['CommentThread', 'thread-1']]);
  });
});
