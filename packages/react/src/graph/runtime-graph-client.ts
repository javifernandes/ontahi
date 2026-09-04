'use client';

import { createRuntimeBoundDataGraphApi } from '@ontahi/core/data-graph';
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
  readonly reflectedEntityData?: false | FetchReflectedEntityDataReaderOptions;
  readonly reflectedRelatedEntityData?: false | FetchReflectedRelatedEntityDataReaderOptions;
};

export const createRuntimeGraphClient = <TTransportOptions = unknown>({
  runtimeTransport,
  requestId,
  reflectedEntityData = {},
  reflectedRelatedEntityData = {},
}: RuntimeGraphClientOptions<TTransportOptions>): FetchGraphClient<TTransportOptions> => {
  const graph = createFetchGraphReadCapability({ runtimeTransport, requestId });
  const operation = { runtimeTransport, requestId };

  return {
    graph: createRuntimeBoundDataGraphApi(() => graph.runtime),
    graphExecutor: graph.graphExecutor,
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
