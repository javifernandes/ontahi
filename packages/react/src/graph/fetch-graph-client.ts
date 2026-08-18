'use client';

import type {
  ReflectedEntityDataReader,
  ReflectedEntityDataResult,
  ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';

import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
  type AnyOperationBridgeAdapter,
  type FetchOperationBridgeOptions,
} from '../actions/index.js';

import type { ReactGraphExecutor } from './executor.js';
import {
  createFetchGraphReadExecutor,
  type FetchGraphReadExecutorOptions,
} from './fetch-graph-read-executor.js';

export type FetchReflectedEntityDataReaderOptions = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
};

export type OntahiGraphClient<TReadOptions = unknown, TCommandOptions = TReadOptions> = {
  graphExecutor?: ReactGraphExecutor<TReadOptions, TCommandOptions>;
  operationBridgeAdapters?: AnyOperationBridgeAdapter[];
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
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

export const createFetchGraphClient = <TOptions = undefined>({
  graphRead = {},
  operations = {},
  reflectedEntityData = {},
}: FetchGraphClientOptions<TOptions> = {}): OntahiGraphClient<TOptions, TOptions> => {
  const operationOptions =
    operations === false ? undefined : conventionalOperationOptions(operations);

  return {
    ...(graphRead === false ? {} : { graphExecutor: createFetchGraphReadExecutor(graphRead) }),
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
};
