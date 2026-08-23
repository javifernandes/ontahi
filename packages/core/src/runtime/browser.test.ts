import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  browserEffect,
  getCurrentBrowserDataGraphRuntimeEffect,
  getRequiredBrowserDataGraphRuntimeEffect,
  runBrowserEffect,
  withBrowserDataGraphRuntime,
} from './browser.js';

describe('browser runtime helpers', () => {
  it('returns no browser data graph runtime when none is configured', async () => {
    await expect(
      runBrowserEffect(getCurrentBrowserDataGraphRuntimeEffect()),
    ).resolves.toBeUndefined();
  });

  it('exposes the injected browser data graph runtime within the effect', async () => {
    const runtime = { name: 'browser-graph-runtime' };

    await expect(
      runBrowserEffect(getCurrentBrowserDataGraphRuntimeEffect<typeof runtime>(), {
        dataGraphRuntime: runtime,
      }),
    ).resolves.toBe(runtime);
  });

  it('fails when a required browser data graph runtime is missing', async () => {
    await expect(
      runBrowserEffect(getRequiredBrowserDataGraphRuntimeEffect<{ name: string }>()),
    ).rejects.toThrow('Data graph runtime is not configured in the current browser context');
  });

  it('preserves typed Effect failures across the browser Promise boundary', async () => {
    const failure = new Error('remote graph denied');

    await expect(runBrowserEffect(Effect.fail(failure))).rejects.toBe(failure);
  });

  it('supports directly scoped browser runtimes and browserEffect factories', async () => {
    const runtime = { name: 'scoped-runtime' };
    const readRuntimeName = browserEffect(() =>
      getRequiredBrowserDataGraphRuntimeEffect<typeof runtime>(),
    );

    await expect(
      runBrowserEffect(
        withBrowserDataGraphRuntime(
          runtime,
          getRequiredBrowserDataGraphRuntimeEffect<typeof runtime>(),
        ),
      ),
    ).resolves.toBe(runtime);
    await expect(readRuntimeName()).rejects.toThrow(
      'Data graph runtime is not configured in the current browser context',
    );
  });
});
