'use client';

import { Stream } from '@ontahi/core/computation/stream';
import {
  createGraphClientCache,
  createRuntimeBoundDataGraphApi,
  reconcileGraphReadSnapshot,
  type GraphClientCache,
  type QueryOrView,
} from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';

import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
} from '../actions/index.js';

import {
  createFetchReflectedEntityDataReader,
  createFetchReflectedRelatedEntityDataReader,
  type FetchGraphClient,
  type FetchReflectedEntityDataReaderOptions,
  type FetchReflectedRelatedEntityDataReaderOptions,
} from './fetch-graph-client.js';
import { createFetchGraphReadCapability } from './fetch-graph-runtime.js';

export type RuntimeGraphClientOptions<TTransportOptions = unknown> = {
  readonly runtimeTransport: RuntimeTransport<TTransportOptions>;
  readonly requestId?: () => string;
  readonly clientCache?: GraphClientCache;
  readonly reflectedEntityData?: false | FetchReflectedEntityDataReaderOptions;
  readonly reflectedRelatedEntityData?: false | FetchReflectedRelatedEntityDataReaderOptions;
};

export const createRuntimeGraphClient = <TTransportOptions = unknown>({
  runtimeTransport,
  requestId,
  clientCache: configuredClientCache,
  reflectedEntityData = {},
  reflectedRelatedEntityData = {},
}: RuntimeGraphClientOptions<TTransportOptions>): FetchGraphClient<TTransportOptions> => {
  const graph = createFetchGraphReadCapability({ runtimeTransport, requestId });
  const clientCache = configuredClientCache ?? createGraphClientCache();
  const runtime = {
    ...graph.runtime,
    observe: <TParams, TResult>(
      read: QueryOrView<TParams, TResult>,
      params: TParams,
      options?: TTransportOptions,
    ) =>
      graph.runtime.observe(read, params, options).pipe(
        Stream.map(snapshot => reconcileGraphReadSnapshot(clientCache, read, params, snapshot).value),
      ),
  };
  const operation = { runtimeTransport, requestId };

  return {
    graph: createRuntimeBoundDataGraphApi(() => runtime),
    graphExecutor: graph.graphExecutor,
    clientCache,
    runtimeTransport,
    operationBridgeAdapters: [createFetchOperationBridgeAdapter(operation)],
    reflectedOperationInvoker: createFetchReflectedOperationInvoker(operation),
    ...(reflectedEntityData === false
      ? {}
      : { reflectedEntityDataReader: createFetchReflectedEntityDataReader(reflectedEntityData) }),
    ...(reflectedRelatedEntityData === false
      ? {}
      : {
          reflectedRelatedEntityDataReader: createFetchReflectedRelatedEntityDataReader(
            reflectedRelatedEntityData,
          ),
        }),
  };
};
