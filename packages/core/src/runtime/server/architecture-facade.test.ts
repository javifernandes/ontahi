import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { field, value } from '../../data-graph/index.js';

import { architecture, getArchitecture, type ArchitectureDefinition } from './index.js';

describe('architecture app facade', () => {
  afterEach(() => {
    architecture({});
  });

  it('stores configured engines and exposes facade namespaces', async () => {
    const graph = {
      name: 'graph-engine',
    };
    const transport = {
      name: 'transport-engine',
    };
    const client = {
      name: 'client-engine',
    };
    const auth = {
      currentUser: () => 'user-1',
    };

    const definition = architecture({
      graph,
      transport,
      client,
      auth,
    });

    await expect(getArchitecture()).resolves.toMatchObject({
      graph,
      transport,
      client,
      auth,
    } satisfies Partial<ArchitectureDefinition>);

    expect(definition.app.graph.name).toBe('graph-engine');
    expect(definition.app.auth.currentUser()).toBe('user-1');
    expect(definition.app.operation).toEqual(
      expect.objectContaining({
        define: expect.any(Function),
        invoke: expect.any(Function),
        runRaw: expect.any(Function),
        toInvocationResult: expect.any(Function),
      }),
    );
    expect(definition.app.require).toEqual(
      expect.objectContaining({
        combine: expect.any(Function),
      }),
    );
    expect(definition.app.concern).toEqual(
      expect.objectContaining({
        apply: expect.any(Function),
        combine: expect.any(Function),
      }),
    );
    expect(definition.app.validation).toEqual(
      expect.objectContaining({
        contract: expect.any(Function),
        contractFromZod: expect.any(Function),
      }),
    );
    expect(definition.app.cache).toEqual(
      expect.objectContaining({
        memoizeInServerContext: expect.any(Function),
      }),
    );
    expect(definition.app.effects).toEqual(
      expect.objectContaining({
        run: expect.any(Function),
        withEffects: expect.any(Function),
      }),
    );
    expect(definition.app.runtime).toEqual(
      expect.objectContaining({
        runServerEffect: expect.any(Function),
      }),
    );
    expect(definition.app.task).toEqual(
      expect.objectContaining({
        define: expect.any(Function),
        defineForEntity: expect.any(Function),
        start: expect.any(Function),
        getSnapshot: expect.any(Function),
        createInMemoryTaskStorage: expect.any(Function),
        createInProcessTaskRuntime: expect.any(Function),
      }),
    );
  });

  it('merges namespace overrides without replacing default helpers', () => {
    const customDefine = () => 'custom-operation';
    const definition = architecture({
      operation: {
        customDefine,
      },
      require: {
        customRequirement: () => true,
      },
    });

    expect(definition.app.operation.customDefine).toBe(customDefine);
    expect(definition.app.operation.define).toEqual(expect.any(Function));
    expect(definition.app.require.customRequirement).toEqual(expect.any(Function));
    expect(definition.app.require.combine).toEqual(expect.any(Function));
  });

  it('separates raw runtime execution from semantic invocation', async () => {
    const definition = architecture({});
    const onSuccess = vi.fn();
    const readBook = definition.app.operation.define({
      authority: 'server',
      exposure: 'server-only',
      layer: 'features.books',
      input: value('ReadBookInput', {
        bookSlug: field.string(),
      }),
      run: (input: { bookSlug: string }) =>
        Effect.succeed({
          data: {
            title: input.bookSlug.toUpperCase(),
          },
        }),
      onSuccess,
    });
    const operations = definition.app.operation.defineForEntity('Book', {
      readBook,
    });
    const input = {
      bookSlug: 'progbook',
    };

    await expect(definition.app.operation.runRaw(operations.readBook, input)).resolves.toEqual({
      success: true,
      data: {
        title: 'PROGBOOK',
      },
    });
    expect(onSuccess).not.toHaveBeenCalled();
    await expect(definition.app.operation.invoke(operations.readBook, input)).resolves.toEqual({
      ok: true,
      kind: 'success',
      value: {
        title: 'PROGBOOK',
      },
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith({
      input,
      result: {
        success: true,
        data: {
          title: 'PROGBOOK',
        },
      },
    });
  });
});
