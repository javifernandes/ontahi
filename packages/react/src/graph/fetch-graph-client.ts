'use client';

import type {
  ReflectedEntityDataReader,
  ReflectedEntityDataResult,
  ReflectedOperationInvoker,
  RemoteDataGraphError,
  RuntimeBoundDataGraphApi,
} from '@ontahi/core/data-graph';
import { createRuntimeBoundDataGraphApi } from '@ontahi/core/data-graph';

import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
  type AnyOperationBridgeAdapter,
  type FetchOperationBridgeOptions,
} from '../actions/index.js';

import type { ReactGraphExecutor } from './executor.js';
import type { FetchGraphReadExecutorOptions } from './fetch-graph-read-executor.js';
import { createFetchGraphReadCapability } from './fetch-graph-runtime.js';

export type FetchReflectedEntityDataReaderOptions = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
};

export type OntahiGraphClient<TReadOptions = unknown, TCommandOptions = TReadOptions> = {
  graph?: RuntimeBoundDataGraphApi<
    RemoteDataGraphError,
    TReadOptions,
    TCommandOptions,
    RemoteDataGraphError
  >;
  graphExecutor?: ReactGraphExecutor<TReadOptions, TCommandOptions>;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
};

export type FetchGraphClient<TOptions = undefined> = OntahiGraphClient<TOptions, TOptions> & {
  graph: RuntimeBoundDataGraphApi<RemoteDataGraphError, TOptions, TOptions, RemoteDataGraphError>;
  graphExecutor: ReactGraphExecutor<TOptions, TOptions>;
};

export type FetchGraphClientOptions<TOptions = undefined> = {
  graphRead?: false | FetchGraphReadExecutorOptions<TOptions>;
  operations?: false | FetchOperationBridgeOptions;
  reflectedEntityData?: false | FetchReflectedEntityDataReaderOptions;
};

const DEFAULT_OPERATIONS_ENDPOINT = '/operations';
const DEFAULT_TASKS_ENDPOINT = '/operations/tasks';
const DEFAULT_REFLECTED_ENTITY_DATA_ENDPOINT = '/explorer/entities';

const conventionalOperationOptions = (
  options: FetchOperationBridgeOptions,
): FetchOperationBridgeOptions =>
  options.mountPath === undefined
    ? {
        endpoint: DEFAULT_OPERATIONS_ENDPOINT,
        taskEndpoint: DEFAULT_TASKS_ENDPOINT,
        ...options,
      }
    : options;

export const createFetchReflectedEntityDataReader = ({
  endpoint = DEFAULT_REFLECTED_ENTITY_DATA_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
}: FetchReflectedEntityDataReaderOptions = {}): ReflectedEntityDataReader => ({
  readEntityData: async query => {
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
  },
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
  graphRead = {},
  operations = {},
  reflectedEntityData = {},
}: FetchGraphClientOptions<TOptions> = {}): OntahiGraphClient<TOptions, TOptions> {
  const operationOptions =
    operations === false ? undefined : conventionalOperationOptions(operations);
  const graphReadCapability =
    graphRead === false ? undefined : createFetchGraphReadCapability(graphRead);

  return {
    ...(graphReadCapability
      ? {
          graph: createRuntimeBoundDataGraphApi(() => graphReadCapability.runtime),
          graphExecutor: graphReadCapability.graphExecutor,
        }
      : {}),
    ...(operationOptions
      ? {
          operationBridgeAdapters: [createFetchOperationBridgeAdapter(operationOptions)],
          reflectedOperationInvoker: createFetchReflectedOperationInvoker(operationOptions),
        }
      : {}),
    ...(reflectedEntityData === false
      ? {}
      : { reflectedEntityDataReader: createFetchReflectedEntityDataReader(reflectedEntityData) }),
  };
}
