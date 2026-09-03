'use client';

import type {
  ReflectedEntityDataReader,
  ReflectedEntityDataResult,
  ReflectedRelatedEntityDataReader,
  ReflectedRelatedEntityDataQuery,
  ReflectedOperationInvoker,
  RemoteDataGraphError,
  RuntimeBoundDataGraphApi,
} from '@ontahi/core/data-graph';
import { createRuntimeBoundDataGraphApi } from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';

import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
  type AnyOperationBridgeAdapter,
  type FetchOperationBridgeOptions,
} from '../actions/index.js';

import type { ReactGraphExecutor } from './executor.js';
import type { FetchGraphReadExecutorOptions } from './fetch-graph-read-executor.js';
import { createFetchGraphReadCapability } from './fetch-graph-runtime.js';
import {
  createFetchRuntimeTransport,
  type FetchRuntimeTransportOptions,
} from './fetch-runtime-transport.js';

export type FetchReflectedEntityDataReaderOptions = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
};

export type FetchReflectedRelatedEntityDataReaderOptions = FetchReflectedEntityDataReaderOptions;

export type OntahiGraphClient<TReadOptions = unknown, TCommandOptions = TReadOptions> = {
  graph?: RuntimeBoundDataGraphApi<
    RemoteDataGraphError,
    TReadOptions,
    TCommandOptions,
    RemoteDataGraphError
  >;
  graphExecutor?: ReactGraphExecutor<TReadOptions, TCommandOptions>;
  runtimeTransport?: RuntimeTransport<TReadOptions | TCommandOptions>;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedRelatedEntityDataReader?: ReflectedRelatedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
};

export type FetchGraphClient<TOptions = undefined> = OntahiGraphClient<TOptions, TOptions> & {
  graph: RuntimeBoundDataGraphApi<RemoteDataGraphError, TOptions, TOptions, RemoteDataGraphError>;
  graphExecutor: ReactGraphExecutor<TOptions, TOptions>;
};

export type FetchGraphClientCompatibilityOptions = {
  operation?: {
    endpoint?: string;
    mountPath?: string;
  };
  graphRead?: {
    endpoint?: string;
  };
  graphCommand?: {
    endpoint?: string;
  };
};

export type FetchGraphClientOptions<TOptions = undefined> = {
  compatibility?: FetchGraphClientCompatibilityOptions;
  graphRead?: false | FetchGraphReadExecutorOptions<TOptions>;
  operations?: false | FetchOperationBridgeOptions<TOptions>;
  runtimeTransport?: false | FetchRuntimeTransportOptions<TOptions>;
  reflectedEntityData?: false | FetchReflectedEntityDataReaderOptions;
  reflectedRelatedEntityData?: false | FetchReflectedRelatedEntityDataReaderOptions;
};

const DEFAULT_LEGACY_OPERATION_ENDPOINT = '/operations';
const DEFAULT_LEGACY_GRAPH_READ_ENDPOINT = '/graph/reads';
const DEFAULT_LEGACY_GRAPH_COMMAND_ENDPOINT = '/graph/commands';
const DEFAULT_REFLECTED_ENTITY_DATA_ENDPOINT = '/explorer/entities';
const DEFAULT_REFLECTED_RELATED_ENTITY_DATA_ENDPOINT = '/explorer/related-entities';

const postReflectedEntityDataQuery = async (
  endpoint: string,
  query:
    | ReflectedRelatedEntityDataQuery
    | Parameters<ReflectedEntityDataReader['readEntityData']>[0],
  fetchRequest: typeof globalThis.fetch,
) => {
  const response = await fetchRequest(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`Reflected entity data request failed with status ${response.status}.`);
  }

  return response.json() as Promise<ReflectedEntityDataResult>;
};

export const createFetchReflectedEntityDataReader = ({
  endpoint = DEFAULT_REFLECTED_ENTITY_DATA_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
}: FetchReflectedEntityDataReaderOptions = {}): ReflectedEntityDataReader => ({
  readEntityData: query => postReflectedEntityDataQuery(endpoint, query, fetchRequest),
});

export const createFetchReflectedRelatedEntityDataReader = ({
  endpoint = DEFAULT_REFLECTED_RELATED_ENTITY_DATA_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
}: FetchReflectedRelatedEntityDataReaderOptions = {}): ReflectedRelatedEntityDataReader => ({
  readRelatedEntityData: query => postReflectedEntityDataQuery(endpoint, query, fetchRequest),
});

export function createFetchGraphClient<TOptions = undefined>(): FetchGraphClient<TOptions>;
export function createFetchGraphClient<TOptions = undefined>(
  options: FetchGraphClientOptions<TOptions> & { graphRead: false },
): OntahiGraphClient<TOptions, TOptions>;
export function createFetchGraphClient<TOptions = undefined>(
  options: FetchGraphClientOptions<TOptions> & {
    graphRead?: FetchGraphReadExecutorOptions<TOptions>;
  },
): FetchGraphClient<TOptions>;
export function createFetchGraphClient<TOptions = undefined>({
  compatibility = {},
  graphRead = {},
  operations = {},
  runtimeTransport = {},
  reflectedEntityData = {},
  reflectedRelatedEntityData = {},
}: FetchGraphClientOptions<TOptions> = {}): OntahiGraphClient<TOptions, TOptions> {
  const graphReadOptions =
    graphRead === false
      ? undefined
      : {
          ...graphRead,
          ...(compatibility.graphRead === undefined
            ? {}
            : {
                endpoint: compatibility.graphRead.endpoint ?? DEFAULT_LEGACY_GRAPH_READ_ENDPOINT,
              }),
          ...(compatibility.graphCommand === undefined
            ? {}
            : {
                commandEndpoint:
                  compatibility.graphCommand.endpoint ?? DEFAULT_LEGACY_GRAPH_COMMAND_ENDPOINT,
              }),
        };
  const operationOptions = (() => {
    if (operations === false) return undefined;
    if (compatibility.operation === undefined) return operations;
    const { endpoint: _endpoint, mountPath: _mountPath, ...sharedOptions } = operations;
    if (compatibility.operation.endpoint !== undefined) {
      return { ...sharedOptions, endpoint: compatibility.operation.endpoint };
    }
    if (compatibility.operation.mountPath !== undefined) {
      return { ...sharedOptions, mountPath: compatibility.operation.mountPath };
    }
    return { ...sharedOptions, endpoint: DEFAULT_LEGACY_OPERATION_ENDPOINT };
  })();
  const commonTransportRequired =
    (graphReadOptions !== undefined &&
      (graphReadOptions.endpoint === undefined ||
        graphReadOptions.commandEndpoint === undefined)) ||
    (operationOptions !== undefined &&
      operationOptions.endpoint === undefined &&
      operationOptions.mountPath === undefined);
  if (runtimeTransport === false && commonTransportRequired) {
    throw new TypeError(
      'runtimeTransport cannot be disabled while a common Runtime Protocol family is enabled.',
    );
  }
  const requestId =
    runtimeTransport === false
      ? undefined
      : (runtimeTransport.requestId ?? graphReadOptions?.requestId ?? operationOptions?.requestId);
  const runtimeTransportOptions =
    runtimeTransport === false
      ? undefined
      : {
          ...(graphReadOptions?.fetch ? { fetch: graphReadOptions.fetch } : {}),
          ...(graphReadOptions?.requestInit ? { requestInit: graphReadOptions.requestInit } : {}),
          ...runtimeTransport,
          requestId,
        };
  const resolvedRuntimeTransport =
    runtimeTransportOptions === undefined
      ? undefined
      : createFetchRuntimeTransport<TOptions>(runtimeTransportOptions);
  const graphReadCapability =
    graphReadOptions === undefined
      ? undefined
      : createFetchGraphReadCapability({
          ...graphReadOptions,
          ...(runtimeTransportOptions?.fetch ? { fetch: runtimeTransportOptions.fetch } : {}),
          ...(runtimeTransportOptions?.requestInit
            ? { requestInit: runtimeTransportOptions.requestInit }
            : {}),
          ...(resolvedRuntimeTransport
            ? { runtimeTransport: resolvedRuntimeTransport, requestId }
            : {}),
        });
  const resolvedOperationOptions =
    operationOptions === undefined
      ? undefined
      : {
          ...operationOptions,
          ...(runtimeTransportOptions?.fetch ? { fetch: runtimeTransportOptions.fetch } : {}),
          ...(runtimeTransportOptions?.requestInit
            ? { requestInit: runtimeTransportOptions.requestInit }
            : {}),
          ...(resolvedRuntimeTransport
            ? { runtimeTransport: resolvedRuntimeTransport, requestId }
            : {}),
        };

  return {
    ...(graphReadCapability
      ? {
          graph: createRuntimeBoundDataGraphApi(() => graphReadCapability.runtime),
          graphExecutor: graphReadCapability.graphExecutor,
        }
      : {}),
    ...(resolvedRuntimeTransport ? { runtimeTransport: resolvedRuntimeTransport } : {}),
    ...(resolvedOperationOptions
      ? {
          operationBridgeAdapters: [createFetchOperationBridgeAdapter(resolvedOperationOptions)],
          reflectedOperationInvoker: createFetchReflectedOperationInvoker(resolvedOperationOptions),
        }
      : {}),
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
}
