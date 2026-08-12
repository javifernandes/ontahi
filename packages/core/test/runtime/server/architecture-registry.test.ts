import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('architecture registry', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('loads the configured architecture module lazily and exposes effectors', async () => {
    const {
      configureServerRuntime,
      getArchitecture,
      getArchitectureEffectors,
      resetServerRuntimeForTests,
    } = await import('../../../src/runtime/server/index.js');
    const emitEvent = vi.fn(() => Effect.void);
    const loadArchitecture = vi.fn(async () => ({
      effectors: {
        'emit-event': emitEvent,
      },
    }));

    configureServerRuntime({ loadArchitecture });

    await expect(getArchitecture()).resolves.toEqual({
      effectors: {
        'emit-event': emitEvent,
      },
    });
    await expect(getArchitectureEffectors()).resolves.toEqual({
      'emit-event': emitEvent,
    });
    await getArchitecture();
    expect(loadArchitecture).toHaveBeenCalledTimes(1);
    resetServerRuntimeForTests();
  });

  it('wraps configured architecture load failures with a stable error', async () => {
    const { configureServerRuntime, getArchitecture, resetServerRuntimeForTests } =
      await import('../../../src/runtime/server/index.js');
    const cause = new Error('dynamic import exploded');

    configureServerRuntime({
      loadArchitecture: async () => {
        throw cause;
      },
    });

    await expect(getArchitecture()).rejects.toMatchObject({
      message: 'Failed to load configured architecture module',
      cause,
    });
    resetServerRuntimeForTests();
  });

  it('resolves layered defaults from broad to specific prefixes', async () => {
    const { configureServerRuntime, resolveArchitectureLayerDefaults, resetServerRuntimeForTests } =
      await import('../../../src/runtime/server/index.js');
    const baseRequirement = { kind: 'base' };
    const specificRequirement = { kind: 'specific' };
    const baseConcern = { run: vi.fn() };
    const specificConcern = { run: vi.fn() };

    configureServerRuntime({
      loadArchitecture: async () => ({
        layers: {
          'features.books': {
            requires: [baseRequirement as never],
            concerns: [baseConcern],
          },
          'features.books.chapter': {
            requires: [specificRequirement as never],
            concerns: [specificConcern],
          },
          'features.other': {
            requires: [{ kind: 'ignored' } as never],
          },
        },
      }),
    });

    await expect(resolveArchitectureLayerDefaults('features.books.chapter.load')).resolves.toEqual({
      requires: [baseRequirement, specificRequirement],
      concerns: [baseConcern, specificConcern],
    });
    await expect(resolveArchitectureLayerDefaults('features.unknown')).resolves.toEqual({
      requires: undefined,
      concerns: undefined,
    });
    resetServerRuntimeForTests();
  });
});
