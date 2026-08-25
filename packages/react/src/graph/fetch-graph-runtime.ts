'use client';

import {
  createRemoteDataGraphRuntime,
  isGraphCommandRejection,
  isGraphCommandProtocolError,
  isGraphReadProtocolError,
  type DataGraphExecutionRuntime,
  type RemoteDataGraphError,
  type RemoteGraphCommandTransport,
  type RemoteGraphReadTransport,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
} from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';

import type { ReactGraphExecutor } from './executor.js';

export type FetchGraphReadExecutorOptions<TOptions = undefined> = {
  endpoint?: string;
  commandEndpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestInit?: (options?: TOptions) => Omit<RequestInit, 'body' | 'method'>;
};

export type FetchGraphRuntime<TOptions = undefined> = DataGraphExecutionRuntime<
  RemoteDataGraphError,
  TOptions,
  TOptions,
  RemoteDataGraphError
>;
export type FetchRelationshipRuntime<TOptions = undefined> = RelationshipCommandExecutionRuntime<
  RemoteDataGraphError,
  TOptions
> &
  ManyToManyRelationshipCommandExecutionRuntime<RemoteDataGraphError, TOptions>;

export type FetchGraphReadCapability<TOptions = undefined> = {
  runtime: FetchGraphRuntime<TOptions> & FetchRelationshipRuntime<TOptions>;
  graphExecutor: ReactGraphExecutor<TOptions, TOptions>;
};

const DEFAULT_GRAPH_READ_ENDPOINT = '/graph/reads';
const DEFAULT_GRAPH_COMMAND_ENDPOINT = '/graph/commands';

export const createFetchGraphReadCapability = <TOptions = undefined>({
  endpoint = DEFAULT_GRAPH_READ_ENDPOINT,
  commandEndpoint = DEFAULT_GRAPH_COMMAND_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
  requestInit,
}: FetchGraphReadExecutorOptions<TOptions> = {}): FetchGraphReadCapability<TOptions> => {
  const transport: RemoteGraphReadTransport<TOptions> = async (request, options) => {
    const init = requestInit?.(options) ?? {};
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');

    const response = await fetchRequest(endpoint, {
      ...init,
      method: 'POST',
      headers,
      credentials: init.credentials ?? 'same-origin',
      body: JSON.stringify(request),
    });

    try {
      const payload: unknown = await response.json();
      if (!response.ok && !isGraphReadProtocolError(payload)) {
        throw new Error(`Graph read request failed with status ${response.status}.`);
      }
      return payload;
    } catch {
      throw new Error(`Graph read request failed with status ${response.status}.`);
    }
  };
  const commandTransport: RemoteGraphCommandTransport<TOptions> = async (request, options) => {
    const init = requestInit?.(options) ?? {};
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetchRequest(commandEndpoint, {
      ...init,
      method: 'POST',
      headers,
      credentials: init.credentials ?? 'same-origin',
      body: JSON.stringify(request),
    });
    const payload: unknown = await response.json();
    if (
      !response.ok &&
      !isGraphCommandProtocolError(payload) &&
      !isGraphCommandRejection(payload)
    ) {
      throw new Error(`Graph Command request failed with status ${response.status}.`);
    }
    return payload;
  };
  const runtime = createRemoteDataGraphRuntime({ transport, commandTransport });

  return {
    runtime,
    graphExecutor: {
      get: (read, params, options) => runBrowserEffect(runtime.get(read, params, options)),
      run: (read, params, options) => runBrowserEffect(runtime.run(read, params, options)),
      count: (read, params, options) => runBrowserEffect(runtime.count(read, params, options)),
      runCommand: (command, options) => runBrowserEffect(runtime.runCommand(command, options)),
      runRelationshipCommand: (command, options) =>
        runBrowserEffect(runtime.runRelationshipCommand(command, options)),
      runManyToManyRelationshipCommand: (command, options) =>
        runBrowserEffect(runtime.runManyToManyRelationshipCommand(command, options)),
    },
  };
};
