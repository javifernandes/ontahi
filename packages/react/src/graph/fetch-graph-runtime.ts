'use client';

import {
  createRemoteDataGraphRuntime,
  isGraphCommandRejection,
  isGraphCommandProtocolError,
  isGraphReadProtocolError,
  type DataGraphExecutionRuntime,
  type EntityMutationCommandExecutionRuntime,
  type RemoteDataGraphError,
  type RemoteGraphCommandTransport,
  type RemoteGraphReadTransport,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
} from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';
import {
  createRuntimeProtocolExchange,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from '@ontahi/core/runtime/protocol';

import type { ReactGraphExecutor } from './executor.js';
import { createFetchRuntimeTransport } from './fetch-runtime-transport.js';

export type FetchGraphReadExecutorOptions<TOptions = undefined> = {
  /** @deprecated Select the legacy Graph Read route through createFetchGraphClient compatibility. */
  endpoint?: string;
  /** @deprecated Select the legacy Graph Command route through createFetchGraphClient compatibility. */
  commandEndpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestId?: () => string;
  requestInit?: (options?: TOptions) => Omit<RequestInit, 'body' | 'method'>;
  runtimeTransport?: RuntimeTransport<TOptions>;
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
export type FetchEntityMutationRuntime<TOptions = undefined> =
  EntityMutationCommandExecutionRuntime<RemoteDataGraphError, TOptions>;

export type FetchGraphReadCapability<TOptions = undefined> = {
  runtime: FetchGraphRuntime<TOptions> &
    FetchRelationshipRuntime<TOptions> &
    FetchEntityMutationRuntime<TOptions>;
  graphExecutor: ReactGraphExecutor<TOptions, TOptions>;
};

export const createFetchGraphReadCapability = <TOptions = undefined>({
  endpoint,
  commandEndpoint,
  fetch: fetchRequest = globalThis.fetch,
  requestId,
  requestInit,
  runtimeTransport,
}: FetchGraphReadExecutorOptions<TOptions> = {}): FetchGraphReadCapability<TOptions> => {
  const legacyReadTransport: RemoteGraphReadTransport<TOptions> = async (request, options) => {
    const init = requestInit?.(options) ?? {};
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');

    const response = await fetchRequest(endpoint!, {
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
  const legacyCommandTransport: RemoteGraphCommandTransport<TOptions> = async (
    request,
    options,
  ) => {
    const init = requestInit?.(options) ?? {};
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetchRequest(commandEndpoint!, {
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
  const exchange =
    endpoint && commandEndpoint
      ? undefined
      : createRuntimeProtocolExchange({
          transport:
            runtimeTransport ??
            createFetchRuntimeTransport<TOptions>({ fetch: fetchRequest, requestInit }),
          requestId,
        });
  const exchangeOptions = (
    options: TOptions | undefined,
  ): RuntimeTransportRequestOptions<TOptions> | undefined =>
    options === undefined ? undefined : { transportOptions: options };
  const transport: RemoteGraphReadTransport<TOptions> = endpoint
    ? legacyReadTransport
    : (request, options) =>
        exchange!({ family: 'graph.read', body: request }, exchangeOptions(options));
  const commandTransport: RemoteGraphCommandTransport<TOptions> = commandEndpoint
    ? legacyCommandTransport
    : (request, options) =>
        exchange!({ family: 'graph.command', body: request }, exchangeOptions(options));
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
      runEntityMutationCommand: (command, options) =>
        runBrowserEffect(runtime.runEntityMutationCommand(command, options)),
    },
  };
};
