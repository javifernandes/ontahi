'use client';

import {
  createGraphClientCache,
  type GraphClientCache,
  type ReflectedEntityDataReader,
  type ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { AnyOperationBridgeAdapter } from '../actions/index.js';

import type { ReactGraphExecutor } from './executor.js';

const GraphRuntimeContext = createContext<unknown | null>(null);
const GraphExecutorContext = createContext<ReactGraphExecutor<any, any> | null>(null);
const GraphClientCacheContext = createContext<GraphClientCache | null>(null);
const OperationBridgeAdaptersContext = createContext<Map<string, AnyOperationBridgeAdapter> | null>(
  null,
);
const ReflectedEntityDataReaderContext = createContext<ReflectedEntityDataReader | null>(null);
const ReflectedOperationInvokerContext = createContext<ReflectedOperationInvoker | null>(null);

export type OntahiGraphProviderProps<
  TGraphRuntime = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
> = {
  children: ReactNode;
  runtime: TGraphRuntime;
  graphExecutor?: ReactGraphExecutor<TReadOptions, TCommandOptions>;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
  clientCache?: GraphClientCache;
};

export function OntahiGraphProvider<
  TGraphRuntime = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>({
  children,
  runtime,
  graphExecutor,
  operationBridgeAdapters = [],
  reflectedEntityDataReader,
  reflectedOperationInvoker,
  clientCache,
}: OntahiGraphProviderProps<TGraphRuntime, TReadOptions, TCommandOptions>) {
  const [defaultClientCache] = useState(() => createGraphClientCache());
  const graphClientCache = clientCache ?? defaultClientCache;
  const bridgeAdapterMap = useMemo(
    () => new Map(operationBridgeAdapters.map(adapter => [adapter.name, adapter])),
    [operationBridgeAdapters],
  );

  return (
    <ReflectedOperationInvokerContext.Provider value={reflectedOperationInvoker ?? null}>
      <ReflectedEntityDataReaderContext.Provider value={reflectedEntityDataReader ?? null}>
        <OperationBridgeAdaptersContext.Provider value={bridgeAdapterMap}>
          <GraphClientCacheContext.Provider value={graphClientCache}>
            <GraphExecutorContext.Provider value={graphExecutor ?? null}>
              <GraphRuntimeContext.Provider value={runtime}>
                {children}
              </GraphRuntimeContext.Provider>
            </GraphExecutorContext.Provider>
          </GraphClientCacheContext.Provider>
        </OperationBridgeAdaptersContext.Provider>
      </ReflectedEntityDataReaderContext.Provider>
    </ReflectedOperationInvokerContext.Provider>
  );
}

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

export type { GraphClientCache };
