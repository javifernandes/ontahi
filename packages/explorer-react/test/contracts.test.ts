import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ExplorerSnapshot, ExplorerTaskRunListItem } from '../src/contracts/index.js';

describe('Explorer contracts', () => {
  it('accept neutral task run list items from the Ontahi task runtime', () => {
    const run = {
      taskId: 'book.import',
      runId: 'run-1',
      status: 'queued',
      updatedAt: '2026-07-16T00:00:00.000Z',
      trigger: {
        cause: 'system',
      },
    } satisfies ExplorerTaskRunListItem;

    const snapshot: ExplorerSnapshot = {
      metrics: [],
      entities: [],
      operations: [],
      tasks: [],
      events: [],
      recentTaskRuns: [run],
    };

    expect(snapshot.recentTaskRuns).toHaveLength(1);
    expectTypeOf(snapshot.recentTaskRuns[0]).toMatchTypeOf<ExplorerTaskRunListItem>();
  });
});
