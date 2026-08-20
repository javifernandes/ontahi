'use client';

import {
  createGraphClientCache,
  type GraphClientCache,
  type ReflectedEntityDataReader,
  type ReflectedRelatedEntityDataReader,
  type ReflectedOperationDescriptor,
  type ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import { anonymousExecutionIdentity, type ExecutionIdentity } from '@ontahi/core/runtime/identity';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { AnyOperationBridgeAdapter } from '../actions/index.js';

import type { ReactGraphExecutor } from './executor.js';
import { createFetchGraphClient, type OntahiGraphClient } from './fetch-graph-client.js';
import {
  createReflectedOperationInvoker,
  type ReflectedGraphOperationLike,
} from './reflected-operation-invoker.js';

const noReflectedGraphOperations: readonly ReflectedGraphOperationLike[] = [];

const GraphRuntimeContext = createContext<unknown | null>(null);
const ExecutionIdentityContext = createContext<ExecutionIdentity>(anonymousExecutionIdentity);
const GraphExecutorContext = createContext<ReactGraphExecutor<any, any> | null>(null);
const GraphClientCacheContext = createContext<GraphClientCache | null>(null);
const OperationBridgeAdaptersContext = createContext<Map<string, AnyOperationBridgeAdapter> | null>(
  null,
);
const ReflectedEntityDataReaderContext = createContext<ReflectedEntityDataReader | null>(null);
const ReflectedRelatedEntityDataReaderContext =
  createContext<ReflectedRelatedEntityDataReader | null>(null);
const ReflectedOperationInvokerContext = createContext<ReflectedOperationInvoker | null>(null);

export type OntahiGraphProviderProps<
  TGraphRuntime = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
> = {
  children: ReactNode;
  runtime: TGraphRuntime;
  graphExecutor?: ReactGraphExecutor<TReadOptions, TCommandOptions>;
  client?: OntahiGraphClient<TReadOptions, TCommandOptions> | false;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  /** Explicit host capability; unlike entity reads, this has no OntahiGraphClient fallback. */
  reflectedRelatedEntityDataReader?: ReflectedRelatedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
  reflectedGraphOperations?: readonly ReflectedGraphOperationLike[];
  clientCache?: GraphClientCache;
  identity?: ExecutionIdentity;
};

export function OntahiGraphProvider<
  TGraphRuntime = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>({
  children,
  runtime,
  graphExecutor,
  client,
  operationBridgeAdapters,
  reflectedEntityDataReader,
  reflectedRelatedEntityDataReader,
  reflectedOperationInvoker,
  reflectedGraphOperations = noReflectedGraphOperations,
  clientCache,
  identity = anonymousExecutionIdentity,
}: OntahiGraphProviderProps<TGraphRuntime, TReadOptions, TCommandOptions>) {
  const [defaultGraphClient] = useState(() => createFetchGraphClient());
  const [defaultClientCache] = useState(() => createGraphClientCache());
  const graphClient = client === false ? undefined : (client ?? defaultGraphClient);
  const resolvedGraphExecutor = graphExecutor ?? graphClient?.graphExecutor;
  const resolvedOperationBridgeAdapters =
    operationBridgeAdapters ?? graphClient?.operationBridgeAdapters ?? [];
  const resolvedReflectedEntityDataReader =
    reflectedEntityDataReader ?? graphClient?.reflectedEntityDataReader;
  const configuredReflectedOperationInvoker =
    reflectedOperationInvoker ?? graphClient?.reflectedOperationInvoker;
  const graphClientCache = clientCache ?? defaultClientCache;
  const bridgeAdapterMap = useMemo(
    () => new Map(resolvedOperationBridgeAdapters.map(adapter => [adapter.name, adapter])),
    [resolvedOperationBridgeAdapters],
  );
  const resolvedReflectedOperationInvoker = useMemo(
    () =>
      reflectedGraphOperations.length > 0
        ? createReflectedOperationInvoker({
            fallback: configuredReflectedOperationInvoker,
            graphExecutor: resolvedGraphExecutor,
            graphOperations: reflectedGraphOperations,
          })
        : (configuredReflectedOperationInvoker ?? null),
    [configuredReflectedOperationInvoker, reflectedGraphOperations, resolvedGraphExecutor],
  );

  return (
    <ExecutionIdentityContext.Provider value={identity}>
      <ReflectedOperationInvokerContext.Provider value={resolvedReflectedOperationInvoker}>
        <ReflectedRelatedEntityDataReaderContext.Provider
          value={reflectedRelatedEntityDataReader ?? null}
        >
          <ReflectedEntityDataReaderContext.Provider
            value={resolvedReflectedEntityDataReader ?? null}
          >
            <OperationBridgeAdaptersContext.Provider value={bridgeAdapterMap}>
              <GraphClientCacheContext.Provider value={graphClientCache}>
                <GraphExecutorContext.Provider value={resolvedGraphExecutor ?? null}>
                  <GraphRuntimeContext.Provider value={runtime}>
                    {children}
                  </GraphRuntimeContext.Provider>
                </GraphExecutorContext.Provider>
              </GraphClientCacheContext.Provider>
            </OperationBridgeAdaptersContext.Provider>
          </ReflectedEntityDataReaderContext.Provider>
        </ReflectedRelatedEntityDataReaderContext.Provider>
      </ReflectedOperationInvokerContext.Provider>
    </ExecutionIdentityContext.Provider>
  );
}

export const useExecutionIdentity = () => useContext(ExecutionIdentityContext);

export function useGraphRuntime<TGraphRuntime = unknown>() {
  const runtime = useContext(GraphRuntimeContext);

  if (runtime === null) {
    throw new Error('useGraphRuntime must be used within an OntahiGraphProvider');
  }

  return runtime as TGraphRuntime;
}

export function useGraphExecutor<TReadOptions = unknown, TCommandOptions = TReadOptions>() {
  const graphExecutor = useContext(GraphExecutorContext);

  if (graphExecutor === null) {
    throw new Error(
      'useGraphExecutor must be used within an OntahiGraphProvider with graphExecutor',
    );
  }

  return graphExecutor as ReactGraphExecutor<TReadOptions, TCommandOptions>;
}

export function useGraphClientCache() {
  const clientCache = useContext(GraphClientCacheContext);

  if (clientCache === null) {
    throw new Error('useGraphClientCache must be used within an OntahiGraphProvider');
  }

  return clientCache;
}

export function useGraphClientCacheSnapshot() {
  const clientCache = useGraphClientCache();

  useGraphClientCacheVersion(clientCache);

  return clientCache.inspect();
}

export const useGraphClientCacheVersion = (clientCache: GraphClientCache) =>
  useSyncExternalStore(
    clientCache.subscribe,
    () => clientCache.inspect().version,
    () => clientCache.inspect().version,
  );

export function useOperationBridgeAdapter(adapterName: string) {
  const adapters = useContext(OperationBridgeAdaptersContext);

  if (adapters === null) {
    throw new Error('useOperationBridgeAdapter must be used within an OntahiGraphProvider');
  }

  const adapter = adapters.get(adapterName);

  if (!adapter) {
    throw new Error(`No operation bridge adapter registered for "${adapterName}"`);
  }

  return adapter;
}

export function useDefaultOperationBridgeAdapter() {
  const adapters = useContext(OperationBridgeAdaptersContext);

  if (adapters === null) {
    throw new Error('useDefaultOperationBridgeAdapter must be used within an OntahiGraphProvider');
  }

  const [adapter] = adapters.values();

  if (!adapter) {
    throw new Error('No operation bridge adapter registered.');
  }

  return adapter;
}

export function useHasOperationBridgeRuntime() {
  const adapters = useContext(OperationBridgeAdaptersContext);
  return adapters !== null && adapters.size > 0;
}

export function useReflectedEntityDataReader() {
  const reader = useContext(ReflectedEntityDataReaderContext);

  if (reader === null) {
    throw new Error(
      'useReflectedEntityDataReader must be used within an OntahiGraphProvider with reflectedEntityDataReader',
    );
  }

  return reader;
}

export function useHasReflectedEntityDataReader() {
  return useContext(ReflectedEntityDataReaderContext) !== null;
}

export function useReflectedRelatedEntityDataReader() {
  const reader = useContext(ReflectedRelatedEntityDataReaderContext);

  if (reader === null) {
    throw new Error(
      'useReflectedRelatedEntityDataReader must be used within an OntahiGraphProvider with reflectedRelatedEntityDataReader',
    );
  }

  return reader;
}

export const useHasReflectedRelatedEntityDataReader = () =>
  useContext(ReflectedRelatedEntityDataReaderContext) !== null;

export function useReflectedOperationInvoker() {
  const invoker = useContext(ReflectedOperationInvokerContext);

  if (invoker === null) {
    throw new Error(
      'useReflectedOperationInvoker must be used within an OntahiGraphProvider with reflectedOperationInvoker',
    );
  }

  return invoker;
}

export function useHasReflectedOperationInvoker() {
  return useContext(ReflectedOperationInvokerContext) !== null;
}

export function useReflectedOperationSupport() {
  const invoker = useContext(ReflectedOperationInvokerContext);

  return useCallback(
    (operation: ReflectedOperationDescriptor) =>
      Boolean(invoker && (invoker.canInvokeOperation?.(operation) ?? true)),
    [invoker],
  );
}

export type { GraphClientCache };
