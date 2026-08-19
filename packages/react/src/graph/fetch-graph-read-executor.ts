'use client';

import type { ReactGraphExecutor } from './executor.js';
import {
  createFetchGraphReadCapability,
  type FetchGraphReadExecutorOptions,
} from './fetch-graph-runtime.js';

export type { FetchGraphReadExecutorOptions } from './fetch-graph-runtime.js';

export const createFetchGraphReadExecutor = <TOptions = undefined>(
  options: FetchGraphReadExecutorOptions<TOptions> = {},
): ReactGraphExecutor<TOptions, TOptions> => createFetchGraphReadCapability(options).graphExecutor;
