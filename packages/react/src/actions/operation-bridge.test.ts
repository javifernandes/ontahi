import {
  createEntityRef,
  defineClientDomainOperation,
  entity,
  field,
  graphSchema,
  queryRef,
} from '@ontahi/core/data-graph';
import { getActionInvalidationQueryKeys, getActionQueryKey } from '@ontahi/core/runtime/actions';
import { describe, expect, it } from 'vitest';

import {
  attachOperationBridgeActionRuntime,
  OperationInvocationResultError,
  unwrapOperationInvocationValue,
} from './index.js';

describe('operation bridge query keys', () => {
  const successResult = {
    ok: true,
    kind: 'success',
    value: {},
  } as const;

  it('separates caller-authored Operation Views in query identity', () => {
    const Trip = entity('Trip', { id: field.id(), status: field.string() });
    const operation = {
      id: 'Trip.available',
      entityName: 'Trip',
      name: 'available',
      ...defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        output: graphSchema.selection(Trip, { cardinality: 'many' }),
      }),
    };
    const TripIds = Trip.view('TripIds', { id: true });
    const TripStatuses = Trip.view('TripStatuses', { status: true });

    const idsAction = attachOperationBridgeActionRuntime(
      operation.as(TripIds),
      async () => ({ data: successResult }),
      { requiresAuth: false },
    );
    const statusesAction = attachOperationBridgeActionRuntime(
      operation.as(TripStatuses),
      async () => ({ data: successResult }),
      { requiresAuth: false },
    );

    expect(getActionQueryKey(idsAction, undefined)).not.toEqual(
      getActionQueryKey(statusesAction, undefined),
    );
  });

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

    const book = createEntityRef(Book, { slug: 'progbook' });

    expect(
      getActionQueryKey(action, {
        book,
        cursor: 'next-page',
        stateFilter: 'all',
      }),
    ).toEqual(['CommentThread', 'listThreadsForBook', { book, stateFilter: 'all' }]);
  });

  it('resolves semantic ref query key segments from direct refs', () => {
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
    ).toEqual(['Book', 'fetchBookInfo', 'Book:{"slug":"progbook"}']);
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
        bridge: {
          invalidate: [
            [
              'CommentThread',
              (input: { thread: { locator: { id: string } } }) => input.thread.locator.id,
            ],
          ],
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

  it('preserves transported operation failure details as the client error cause', () => {
    const failure = {
      success: false,
      reason: 'internal_error',
      message: 'Failed to load trips',
      cause: {
        name: 'Error',
        message: 'Failed to execute in-memory read.',
        cause: {
          name: 'Error',
          message: 'Relation Trip.driver is missing mapping metadata.',
        },
      },
    };
    const result = {
      ok: false,
      kind: 'failed',
      executed: true,
      message: failure.message,
      failure,
    } as const;

    expect(() => unwrapOperationInvocationValue(result)).toThrow(
      expect.objectContaining({
        name: 'OperationInvocationResultError',
        cause: failure,
        result,
      }),
    );

    try {
      unwrapOperationInvocationValue(result);
    } catch (error) {
      expect(JSON.parse(JSON.stringify(error as OperationInvocationResultError))).toMatchObject({
        name: 'OperationInvocationResultError',
        message: 'Failed to load trips',
        cause: failure,
      });
    }
  });
});
