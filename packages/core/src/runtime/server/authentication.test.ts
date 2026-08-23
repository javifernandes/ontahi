import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  architecture,
  checkServerDomainOperationPermission,
  getOrCreateServerContextResource,
  runServerEffect,
  type OperationRequirement,
  type Principal,
} from './index.js';

const userPrincipal: Principal = {
  subject: 'github:123',
  kind: 'user',
  issuer: 'https://github.com',
};

describe('authentication Principal and invocation context', () => {
  it('exposes the current Principal only inside its invocation scope', async () => {
    const { app } = architecture({});

    expect(app.auth.currentPrincipal()).toBeNull();

    await expect(
      app.runtime.withInvocationContext({ principal: userPrincipal }, async () => {
        await Promise.resolve();
        return app.auth.currentPrincipal();
      }),
    ).resolves.toEqual(userPrincipal);
    expect(app.auth.currentPrincipal()).toBeNull();
  });

  it('provides one standard authenticated requirement', async () => {
    const { app } = architecture({});
    const requirement = app.require.authenticated();

    await expect(Effect.runPromise(requirement.run({}).pipe(Effect.flip))).resolves.toMatchObject({
      reason: 'not_authenticated',
      message: 'Not authenticated',
    });
    await expect(
      app.runtime.withInvocationContext({ principal: userPrincipal }, () =>
        Effect.runPromise(requirement.run({})),
      ),
    ).resolves.toBeUndefined();
    await expect(
      app.runtime.withInvocationContext({ principal: userPrincipal }, () =>
        Effect.runPromise(app.auth.requirePrincipal()),
      ),
    ).resolves.toEqual(userPrincipal);
  });

  it('shares invocation resources across permission checks', async () => {
    const factory = vi.fn(async () => userPrincipal);
    const requirement: OperationRequirement = {
      run: () =>
        Effect.promise(() => getOrCreateServerContextResource('auth.principal', factory)).pipe(
          Effect.asVoid,
        ),
    };
    const operation = {
      id: 'Todo.complete',
      description: 'Complete a Todo',
      requires: [requirement],
    } as unknown as Parameters<typeof checkServerDomainOperationPermission>[0];
    const { app } = architecture({});

    await app.runtime.withInvocationContext({ principal: userPrincipal }, async () => {
      await expect(checkServerDomainOperationPermission(operation, {})).resolves.toEqual({
        allowed: true,
      });
      await expect(checkServerDomainOperationPermission(operation, {})).resolves.toEqual({
        allowed: true,
      });
    });

    expect(factory).toHaveBeenCalledOnce();
  });

  it('shares invocation resources with generic server effects', async () => {
    const factory = vi.fn(async () => userPrincipal);
    const { app } = architecture({});

    await app.runtime.withInvocationContext(
      {
        principal: userPrincipal,
        resources: new Map([['auth.principal', Promise.resolve(userPrincipal)]]),
      },
      async () => {
        await expect(
          runServerEffect(
            Effect.promise(() => getOrCreateServerContextResource('auth.principal', factory)),
            { scope: 'tests.auth.server-effect' },
          ),
        ).resolves.toEqual(userPrincipal);
      },
    );

    expect(factory).not.toHaveBeenCalled();
  });

  it('shares portable execution identity while preserving nested scope inheritance', async () => {
    const { app } = architecture({});

    await app.runtime.withInvocationContext(
      { principal: userPrincipal, cacheScope: { workspaceId: 'workspace-1' } },
      async () => {
        expect(app.runtime.getCurrentInvocationContext()).toMatchObject({
          principal: userPrincipal,
          cacheScope: { workspaceId: 'workspace-1' },
        });

        await app.runtime.withInvocationContext({ principal: null }, async () => {
          expect(app.runtime.getCurrentInvocationContext()).toMatchObject({
            principal: null,
            cacheScope: { workspaceId: 'workspace-1' },
          });
        });
      },
    );
  });
});
