import { describe, expect, it } from 'vitest';

import {
  deriveOperationExecutionRequirements,
  resolveOperationExecutionAffordance,
} from './operation-execution.js';

const atomicOperation = {
  authority: 'server',
  exposure: 'bridge',
  execution: { atomicity: 'required' },
} as const;

describe('Operation execution planning', () => {
  it('derives the atomic Data Graph capability from static Operation metadata', () => {
    expect(deriveOperationExecutionRequirements(atomicOperation)).toEqual([
      { kind: 'data-graph.atomicity' },
    ]);
  });

  it('prefers a compatible local binding without projecting topology into the Operation', () => {
    expect(
      resolveOperationExecutionAffordance(atomicOperation, {
        local: {
          runtime: 'postgres',
          capabilities: [{ kind: 'data-graph.atomicity' }],
        },
        bridge: { authority: 'server', bridge: 'fetch' },
      }),
    ).toEqual({ status: 'local', runtime: 'postgres' });
    expect(atomicOperation).toEqual({
      authority: 'server',
      exposure: 'bridge',
      execution: { atomicity: 'required' },
    });
  });

  it('routes through a configured bridge when the local runtime cannot satisfy atomicity', () => {
    expect(
      resolveOperationExecutionAffordance(atomicOperation, {
        local: { runtime: 'browser', capabilities: [] },
        bridge: { authority: 'server', bridge: 'fetch' },
      }),
    ).toEqual({ status: 'bridge', authority: 'server', bridge: 'fetch' });
  });

  it('reports the derived missing capability when no valid route exists', () => {
    expect(
      resolveOperationExecutionAffordance(
        { ...atomicOperation, exposure: 'server-only' },
        { local: { runtime: 'supabase', capabilities: [] } },
      ),
    ).toEqual({
      status: 'unavailable',
      missingCapabilities: [{ kind: 'data-graph.atomicity' }],
    });
  });
});
