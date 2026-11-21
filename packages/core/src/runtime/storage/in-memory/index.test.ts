import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime as createCompatibilityRuntime,
  createInMemoryDataGraphStorage as createCompatibilityStorage,
  executeInMemoryGraphCommandEffect as executeCompatibilityCommand,
} from '../../../data-graph/index.js';

import {
  createInMemoryDataGraphRuntime,
  createInMemoryDataGraphStorage,
  executeInMemoryGraphCommandEffect,
} from './index.js';

describe('in-memory storage runtime boundary', () => {
  it('owns the implementation behind the historical data-graph exports', () => {
    expect(createCompatibilityRuntime).toBe(createInMemoryDataGraphRuntime);
    expect(createCompatibilityStorage).toBe(createInMemoryDataGraphStorage);
    expect(executeCompatibilityCommand).toBe(executeInMemoryGraphCommandEffect);
  });
});
