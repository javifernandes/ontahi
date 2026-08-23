import {
  getActionInvalidationQueryKeys,
  getActionQueryKey,
  getActionRuntime,
} from '@ontahi/core/runtime/actions';
import { DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import {
  createFeatureActionsFactory,
  createNextActionTransport,
  UserFacingActionError,
} from './server.js';

const getAuthContextMock = vi.fn();
const handleServerErrorMock = vi.fn();

const createFeatureActions = () => {
  const transport = createNextActionTransport({
    getAuthContext: getAuthContextMock,
    handleServerError: ({ error, metadata, defaultMessage }) => {
      handleServerErrorMock(error, metadata, defaultMessage);
      return defaultMessage;
    },
  });

  return createFeatureActionsFactory({
    actionClient: transport.actionClient,
    authActionClient: transport.authActionClient,
  });
};

describe('action builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthContextMock.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('passes action return values through as next-safe-action data', async () => {
    const service = vi.fn().mockResolvedValue({
      success: true,
      data: { threadId: 'thread-1' },
    });

    const action = createFeatureActions()('conversations')
      .public('createThread')
      .input(
        z.object({
          body: z.string().min(1),
        }),
      )
      .run(({ parsedInput }) => service(parsedInput));

    const result = await action({ body: 'Hello' });

    expect(service).toHaveBeenCalledWith({ body: 'Hello' });
    expect(result.data).toEqual({
      success: true,
      data: { threadId: 'thread-1' },
    });
    expect(result.serverError).toBeUndefined();
  });

  it('does not interpret success-shaped objects as a special action envelope', async () => {
    const service = vi.fn().mockResolvedValue({
      success: true,
      threadId: 'thread-1',
      state: 'resolved',
    });

    const action = createFeatureActions()('conversations')
      .public('toggleThreadState')
      .run(() => service());

    const result = await action(undefined);

    expect(result.data).toEqual({
      success: true,
      threadId: 'thread-1',
      state: 'resolved',
    });
  });

  it('passes through non-service return values unchanged', async () => {
    const service = vi.fn().mockResolvedValue({
      threadId: 'thread-1',
      messageId: 'message-1',
    });

    const action = createFeatureActions()('conversations')
      .public('customShape')
      .run(() => service());

    const result = await action(undefined);

    expect(result.data).toEqual({
      threadId: 'thread-1',
      messageId: 'message-1',
    });
  });

  it('maps user-facing action errors to server errors', async () => {
    const service = vi.fn().mockRejectedValue(new UserFacingActionError('Nope'));

    const action = createFeatureActions()('conversations')
      .public('createThread')
      .run(() => service());

    const result = await action(undefined);

    expect(result.serverError).toBe('Nope');
    expect(handleServerErrorMock).not.toHaveBeenCalled();
  });

  it('blocks authenticated actions when there is no auth context', async () => {
    getAuthContextMock.mockResolvedValueOnce(null);
    const service = vi.fn();

    const action = createFeatureActions()('notifications')
      .auth('markNotificationRead')
      .run(() => service());

    const result = await action(undefined);

    expect(service).not.toHaveBeenCalled();
    expect(result.serverError).toBe('Not authenticated');
  });

  it('returns validation errors before the server code runs', async () => {
    const service = vi.fn();

    const action = createFeatureActions()('notifications')
      .public('listNotifications')
      .inputType(
        z.object({
          limit: z.number().int().min(1),
        }),
      )
      .run(({ parsedInput }) => service(parsedInput));

    const result = await action({ limit: 0 });

    expect(service).not.toHaveBeenCalled();
    expect(result.validationErrors).toBeDefined();
  });

  it('runs domain operations through the same operation path', async () => {
    const operation = vi.fn().mockResolvedValue({
      success: true,
      data: { inviteId: 'invite-1' },
    });

    const action = createFeatureActions()('sharing')
      .public('getInviteInfo')
      .inputType(
        z.object({
          token: z.string().min(1),
        }),
      )
      .runDomainOperation({
        operation,
      });

    const result = await action({ token: 'token-1' });

    expect(operation).toHaveBeenCalledWith({ token: 'token-1' });
    expect(result).toEqual({
      data: {
        success: true,
        data: { inviteId: 'invite-1' },
      },
    });
  });

  it('attaches canonical query-key metadata to read actions', async () => {
    const action = createFeatureActions()('notifications')
      .auth('listNotifications')
      .inputType(
        z.object({
          limit: z.number().int().min(1).optional(),
        }),
      )
      .key([
        'notifications',
        'list',
        (input: { limit?: number } | undefined) => input ?? {},
      ] as const)
      .run(async ({ parsedInput }) => ({
        notifications: [],
        unreadCount: 0,
        limit: parsedInput.limit,
      }));

    expect(getActionRuntime(action)).toEqual(
      expect.objectContaining({
        feature: 'notifications',
        actionName: 'listNotifications',
        queryKeyPrefix: ['notifications', 'listNotifications'],
        invalidationQueryKeyPrefix: ['notifications', 'list'],
      }),
    );
    expect(getActionQueryKey(action, { limit: 8 })).toEqual([
      'notifications',
      'list',
      { limit: 8 },
    ]);
  });

  it('resolves falsy scalar query specs instead of falling back to canonical prefixes', async () => {
    const action = createFeatureActions()('feature-flags')
      .public('getEmptyState')
      .key('')
      .run(async () => ({ enabled: true }));

    expect(getActionQueryKey(action, undefined)).toEqual(['']);
  });

  it('rejects legacy getQueryKey callbacks that return non-array values', async () => {
    const action = createFeatureActions()('notifications')
      .auth('listNotifications')
      .key((() => 'invalid-key') as any)
      .run(async () => ({
        notifications: [],
        unreadCount: 0,
      }));

    expect(() => getActionQueryKey(action, undefined)).toThrow(
      'notifications.listNotifications getQueryKey must resolve to an array query key.',
    );
  });

  it('maps mutation invalidation targets from actions and feature sentinels', async () => {
    const notificationsActions = createFeatureActions()('notifications');
    const listAction = notificationsActions
      .auth('listNotifications')
      .inputType(
        z.object({
          limit: z.number().int().min(1).optional(),
        }),
      )
      .key([
        'notifications',
        'list',
        (input: { limit?: number } | undefined) => input ?? {},
      ] as const)
      .run(async ({ parsedInput }) => ({
        notifications: [],
        unreadCount: parsedInput.limit ?? 0,
      }));

    const mutation = notificationsActions
      .auth('markNotificationRead')
      .inputType(
        z.object({
          notificationId: z.string().min(1),
        }),
      )
      .affects(() => [listAction, notificationsActions.ALL, ['custom', 'notifications'] as const])
      .run(async () => ({ notificationId: 'notification-1' }));

    expect(
      getActionInvalidationQueryKeys(mutation, {
        input: { notificationId: 'notification-1' },
        data: { notificationId: 'notification-1' },
      }),
    ).toEqual([['notifications', 'list'], ['notifications'], ['custom', 'notifications']]);
  });

  it('reports unexpected errors through the configured transport and returns a safe fallback', async () => {
    const service = vi.fn().mockRejectedValue(new Error('Exploded'));

    const action = createFeatureActions()('conversations')
      .auth('deleteThread')
      .run(() => service());

    const result = await action(undefined);

    expect(result.serverError).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
    expect(handleServerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Exploded' }),
      {
        actionName: 'deleteThread',
        feature: 'conversations',
        requiresAuth: true,
      },
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
  });
});
