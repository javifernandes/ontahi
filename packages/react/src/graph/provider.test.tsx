import {
  createGraphClientCache,
  entity,
  field,
  type GraphClientCache,
  type ReflectedEntityDataReader,
  type ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import type { ExecutionIdentity } from '@ontahi/core/runtime/identity';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AnyOperationBridgeAdapter } from '../actions/index.js';

import {
  OntahiGraphProvider,
  type OntahiGraphClient,
  useDefaultOperationBridgeAdapter,
  useGraphClientCache,
  useGraphClientCacheSnapshot,
  useGraphExecutor,
  useGraphExecutorCapability,
  useExecutionIdentity,
  useGraphRuntime,
  useHasReflectedEntityDataReader,
  useHasReflectedOperationInvoker,
  useHasOperationBridgeRuntime,
  useOperationBridgeAdapter,
  useReflectedEntityDataReader,
  useReflectedOperationExecutionAffordance,
  useReflectedOperationInvoker,
  type ReactGraphExecutor,
} from './index.js';

const createAdapter = (name: string): AnyOperationBridgeAdapter =>
  ({
    name,
    useBridgeAction: vi.fn(),
    useBridgeMutation: vi.fn(),
    useBridgeQuery: vi.fn(),
    usePermission: vi.fn(),
  }) as AnyOperationBridgeAdapter;

const createWrapper = ({
  runtime,
  clientCache,
  graphExecutor,
  operationBridgeAdapters,
  reflectedEntityDataReader,
  reflectedOperationInvoker,
  identity,
  client,
}: {
  runtime: unknown;
  clientCache?: GraphClientCache;
  graphExecutor?: ReactGraphExecutor;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
  identity?: ExecutionIdentity;
  client?: OntahiGraphClient | false;
}) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <OntahiGraphProvider
        runtime={runtime}
        graphExecutor={graphExecutor}
        clientCache={clientCache}
        operationBridgeAdapters={operationBridgeAdapters}
        reflectedEntityDataReader={reflectedEntityDataReader}
        reflectedOperationInvoker={reflectedOperationInvoker}
        identity={identity}
        client={client}
      >
        {children}
      </OntahiGraphProvider>
    );
  };

describe('OntahiGraphProvider', () => {
  it('installs the conventional Fetch graph client by default', () => {
    const { result } = renderHook(
      () => ({
        executor: useGraphExecutor(),
        adapter: useDefaultOperationBridgeAdapter(),
        entityReader: useReflectedEntityDataReader(),
        operationInvoker: useReflectedOperationInvoker(),
      }),
      { wrapper: createWrapper({ runtime: { name: 'browser' } }) },
    );

    expect(result.current.executor).toBeDefined();
    expect(result.current.adapter.name).toBe('fetch');
    expect(result.current.entityReader).toBeDefined();
    expect(result.current.operationInvoker).toBeDefined();
  });

  it('exposes anonymous identity by default and a host identity when supplied', () => {
    const anonymous = renderHook(() => useExecutionIdentity(), {
      wrapper: createWrapper({ runtime: { name: 'anonymous' } }),
    });
    const identity: ExecutionIdentity = {
      principal: { subject: 'service:worker', kind: 'service' },
      cacheScope: 'tenant-1',
    };
    const authenticated = renderHook(() => useExecutionIdentity(), {
      wrapper: createWrapper({ runtime: { name: 'authenticated' }, identity }),
    });

    expect(anonymous.result.current).toEqual({ principal: null });
    expect(authenticated.result.current).toBe(identity);
  });

  it('exposes the host-supplied graph runtime and client cache', () => {
    const runtime = { name: 'bookops-runtime' };
    const clientCache = createGraphClientCache();
    const graphExecutor = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      runCommand: vi.fn(),
    };

    const { result } = renderHook(
      () => ({
        runtime: useGraphRuntime<typeof runtime>(),
        graphExecutor: useGraphExecutor(),
        clientCache: useGraphClientCache(),
      }),
      {
        wrapper: createWrapper({ runtime, clientCache, graphExecutor }),
      },
    );

    expect(result.current.runtime).toBe(runtime);
    expect(result.current.graphExecutor).toBe(graphExecutor);
    expect(result.current.clientCache).toBe(clientCache);
  });

  it('creates a default client cache and subscribes to its snapshots', async () => {
    const runtime = { name: 'bookops-runtime' };
    const BookEntity = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({
        refById: 'id',
        refBySlug: 'slug',
      })
      .identity('refById');

    const { result } = renderHook(
      () => ({
        clientCache: useGraphClientCache(),
        snapshot: useGraphClientCacheSnapshot(),
      }),
      {
        wrapper: createWrapper({ runtime }),
      },
    );

    expect(result.current.snapshot.version).toBe(0);
    expect(result.current.snapshot.records).toEqual([]);

    act(() => {
      result.current.clientCache.writeEntity(BookEntity, {
        id: 'book-1',
        slug: 'ontahi',
        title: 'Ontahi',
      });
    });

    await waitFor(() => {
      expect(result.current.snapshot.version).toBe(1);
    });
    expect(result.current.snapshot.records[0]?.value).toEqual({
      id: 'book-1',
      slug: 'ontahi',
      title: 'Ontahi',
    });
  });

  it('resolves bridge adapters by name and exposes the first adapter as default', () => {
    const firstAdapter = createAdapter('first');
    const secondAdapter = createAdapter('second');

    const { result } = renderHook(
      () => ({
        defaultAdapter: useDefaultOperationBridgeAdapter(),
        namedAdapter: useOperationBridgeAdapter('second'),
        hasRuntime: useHasOperationBridgeRuntime(),
      }),
      {
        wrapper: createWrapper({
          runtime: { name: 'bookops-runtime' },
          operationBridgeAdapters: [firstAdapter, secondAdapter],
        }),
      },
    );

    expect(result.current.defaultAdapter).toBe(firstAdapter);
    expect(result.current.namedAdapter).toBe(secondAdapter);
    expect(result.current.hasRuntime).toBe(true);
  });

  it('reports when no operation bridge runtime is registered', () => {
    const Wrapper = createWrapper({ runtime: { name: 'bookops-runtime' }, client: false });

    const { result } = renderHook(() => useHasOperationBridgeRuntime(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(false);
  });

  it('exposes graph execution as an optional capability', () => {
    const Wrapper = createWrapper({ runtime: { name: 'bookops-runtime' }, client: false });

    const { result } = renderHook(() => useGraphExecutorCapability(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBeUndefined();
  });

  it('exposes the host-supplied reflected entity data reader', () => {
    const reflectedEntityDataReader = {
      readEntityData: vi.fn(),
    };

    const { result } = renderHook(
      () => ({
        reader: useReflectedEntityDataReader(),
        hasReader: useHasReflectedEntityDataReader(),
      }),
      {
        wrapper: createWrapper({
          runtime: { name: 'bookops-runtime' },
          reflectedEntityDataReader,
        }),
      },
    );

    expect(result.current.reader).toBe(reflectedEntityDataReader);
    expect(result.current.hasReader).toBe(true);
  });

  it('reports when no reflected entity data reader is registered', () => {
    const Wrapper = createWrapper({ runtime: { name: 'bookops-runtime' }, client: false });

    const { result } = renderHook(() => useHasReflectedEntityDataReader(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(false);
  });

  it('exposes the host-supplied reflected operation invoker', () => {
    const reflectedOperationInvoker = {
      invokeOperation: vi.fn(),
    };

    const { result } = renderHook(
      () => ({
        invoker: useReflectedOperationInvoker(),
        hasInvoker: useHasReflectedOperationInvoker(),
      }),
      {
        wrapper: createWrapper({
          runtime: { name: 'bookops-runtime' },
          reflectedOperationInvoker,
        }),
      },
    );

    expect(result.current.invoker).toBe(reflectedOperationInvoker);
    expect(result.current.hasInvoker).toBe(true);
  });

  it('exposes the runtime execution affordance for a reflected operation', () => {
    const getOperationExecutionAffordance = vi.fn(() => ({
      status: 'bridge' as const,
      authority: 'server',
      bridge: 'fetch',
    }));
    const reflectedOperationInvoker = {
      getOperationExecutionAffordance,
      invokeOperation: vi.fn(),
    };
    const operation = {
      id: 'Book.transfer',
      entityName: 'Book',
      name: 'transfer',
      kind: 'domain' as const,
      authority: 'server',
      exposure: 'bridge',
      execution: { atomicity: 'required' as const },
    };

    const { result } = renderHook(() => useReflectedOperationExecutionAffordance(operation), {
      wrapper: createWrapper({
        runtime: { name: 'bookops-runtime' },
        reflectedOperationInvoker,
      }),
    });

    expect(result.current).toEqual({
      status: 'bridge',
      authority: 'server',
      bridge: 'fetch',
    });
    expect(getOperationExecutionAffordance).toHaveBeenCalledWith(operation);
  });

  it('reports when no reflected operation invoker is registered', () => {
    const Wrapper = createWrapper({ runtime: { name: 'bookops-runtime' }, client: false });

    const { result } = renderHook(() => useHasReflectedOperationInvoker(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(false);
  });
});
