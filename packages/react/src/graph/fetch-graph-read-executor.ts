'use client';

import {
  createRemoteDataGraphRuntime,
  type RemoteGraphReadTransport,
} from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';

import type { ReactGraphExecutor } from './executor.js';

export type FetchGraphReadExecutorOptions<TOptions = undefined> = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestInit?: (options?: TOptions) => Omit<RequestInit, 'body' | 'method'>;
};

const DEFAULT_GRAPH_READ_ENDPOINT = '/graph/reads';

export const createFetchGraphReadExecutor = <TOptions = undefined>({
  endpoint = DEFAULT_GRAPH_READ_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
  requestInit,
}: FetchGraphReadExecutorOptions<TOptions> = {}): ReactGraphExecutor<TOptions, TOptions> => {
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
      return await response.json();
    } catch {
      throw new Error(`Graph read request failed with status ${response.status}.`);
    }
  };
  const runtime = createRemoteDataGraphRuntime({ transport });

  return {
    get: (read, params, options) => runBrowserEffect(runtime.get(read, params, options)),
    run: (read, params, options) => runBrowserEffect(runtime.run(read, params, options)),
    count: (read, params, options) => runBrowserEffect(runtime.count(read, params, options)),
    runCommand: (command, options) => runBrowserEffect(runtime.runCommand(command, options)),
  };
};
