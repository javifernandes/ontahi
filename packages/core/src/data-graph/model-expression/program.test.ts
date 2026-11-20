import { describe, expect, it } from 'vitest';

import { collectModelExpressionDependencies as collectModelDependencies } from '../../model/expression/program.js';

import { collectModelExpressionDependencies } from './program.js';

describe('data-graph model expression compatibility facade', () => {
  it('preserves the portable model implementation by identity', () => {
    expect(collectModelExpressionDependencies).toBe(collectModelDependencies);
  });
});
