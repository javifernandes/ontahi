import { describe, expect, it, vi } from 'vitest';

import { withInvocationContext } from './invocation-context.js';
import {
  resolveResourceBinding,
  resourceBinding,
  ResourceBindingResolutionError,
} from './resource-binding.js';

describe('contextual Resource bindings', () => {
  const analysisModel = resourceBinding<{ readonly provider: string; readonly apiKey: string }>(
    'model.analysis',
  );

  it('resolves one stable Resource identity for two trusted scopes', async () => {
    const configurations = {
      alpha: { provider: 'openai', apiKey: 'alpha-secret' },
      beta: { provider: 'anthropic', apiKey: 'beta-secret' },
    } as const;
    const resolve = vi.fn(({ scope }) => {
      if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw new Error('scope');
      return configurations[scope.id as keyof typeof configurations];
    });
    const resourceBindings = { 'model.analysis': resolve };

    const alpha = await withInvocationContext(
      { principal: null, resourceBindings, resourceBindingScope: { id: 'alpha' } },
      async () => {
        const first = await resolveResourceBinding(analysisModel);
        expect(await resolveResourceBinding(analysisModel)).toBe(first);
        return first;
      },
    );
    const beta = await withInvocationContext(
      { principal: null, resourceBindings, resourceBindingScope: { id: 'beta' } },
      () => resolveResourceBinding(analysisModel),
    );

    expect(alpha).toBe(configurations.alpha);
    expect(beta).toBe(configurations.beta);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(analysisModel).toEqual({ kind: 'resource-binding', id: 'model.analysis' });
    expect(JSON.stringify(analysisModel)).not.toContain('secret');
  });

  it('inherits bindings and one invocation-scoped resolution cache', async () => {
    const configured = { provider: 'deepseek', apiKey: 'static-secret' };
    const resolve = vi.fn(() => configured);

    await withInvocationContext(
      {
        principal: { kind: 'service', subject: 'atlas' },
        resourceBindings: { 'model.analysis': resolve },
      },
      async () => {
        const outer = await resolveResourceBinding(analysisModel);
        const nested = await withInvocationContext({}, () => resolveResourceBinding(analysisModel));
        expect(nested).toBe(outer);
      },
    );

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({
      principal: { kind: 'service', subject: 'atlas' },
      scope: undefined,
    });
  });

  it('fails safely when a binding is missing or resolution fails', async () => {
    await expect(
      withInvocationContext({ principal: null }, () => resolveResourceBinding(analysisModel)),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'resource_binding_not_configured',
        resourceId: 'model.analysis',
      }),
    );
    await expect(
      withInvocationContext({ principal: null }, () =>
        resolveResourceBinding(resourceBinding('constructor')),
      ),
    ).rejects.toMatchObject({ code: 'resource_binding_not_configured' });

    const secret = 'do-not-leak-this-key';
    const failure = await withInvocationContext(
      {
        principal: null,
        resourceBindings: {
          'model.analysis': () => {
            throw new Error(secret);
          },
        },
      },
      () => resolveResourceBinding(analysisModel).catch(error => error),
    );
    expect(failure).toBeInstanceOf(ResourceBindingResolutionError);
    expect(failure).toMatchObject({
      code: 'resource_binding_resolution_failed',
      resourceId: 'model.analysis',
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);

    const configured = { provider: 'openai', apiKey: 'recovered-secret' };
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(configured);
    await withInvocationContext(
      { principal: null, resourceBindings: { 'model.analysis': resolve } },
      async () => {
        await expect(resolveResourceBinding(analysisModel)).rejects.toBeInstanceOf(
          ResourceBindingResolutionError,
        );
        await expect(resolveResourceBinding(analysisModel)).resolves.toBe(configured);
      },
    );
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it.each(['', '   ', 'x'.repeat(257)])('rejects an invalid stable identity: %j', id => {
    expect(() => resourceBinding(id)).toThrow(
      'Resource binding id must contain between 1 and 256 characters.',
    );
  });
});
