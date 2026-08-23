import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createNextActionOperationBridgeAdapter, type BridgedOperationLike } from './index.js';

const operation: BridgedOperationLike<{ token: string }, { bookSlug: string }> = {
  kind: 'domain-operation',
  authority: 'server',
  exposure: 'bridge',
  entityName: 'PendingCollaboratorInvite',
  name: 'acceptInvite',
  id: 'PendingCollaboratorInvite.acceptInvite',
  bridge: {
    invalidate: [['PendingCollaboratorInvite', 'getInviteInfo']],
  },
};

describe('createNextActionOperationBridgeAdapter', () => {
  it('creates runtime actions that dispatch by canonical operation id', async () => {
    const bridgeAction = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        kind: 'success',
        value: {
          bookSlug: 'progbook',
        },
      },
    });
    const adapter = createNextActionOperationBridgeAdapter(bridgeAction);

    const { result } = renderHook(() => adapter.useBridgeAction(operation));

    let response: unknown;
    await act(async () => {
      response = await result.current({
        token: 'invite-token',
      });
    });

    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'PendingCollaboratorInvite.acceptInvite',
      input: {
        token: 'invite-token',
      },
    });
    expect(response).toEqual({
      data: {
        ok: true,
        kind: 'success',
        value: {
          bookSlug: 'progbook',
        },
      },
    });
  });
});
