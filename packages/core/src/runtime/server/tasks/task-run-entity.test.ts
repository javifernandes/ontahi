import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEntityIdentityRef,
  createInMemoryDataGraphRuntime,
  getEntityIdentityLocator,
} from '../../../data-graph/index.js';

import { TaskRun, TaskRunByIdentity, type TaskRunEntity } from './task-run-entity.js';
import type { TaskSnapshot } from './types.js';

describe('TaskRun Entity', () => {
  it('owns Task run identity independently from an execution engine', () => {
    const identity = getEntityIdentityLocator(TaskRun);

    expect(identity?.name).toBe('refByTaskAndRun');
    expect(identity?.locator.fields).toEqual(['taskId', 'runId']);
    expect(
      createEntityIdentityRef(TaskRun, {
        taskId: 'TodoItem.completeAll',
        runId: 'run-1',
        status: 'running',
        updatedAt: '2026-09-05T00:00:00.000Z',
      }),
    ).toEqual({
      kind: 'entity-ref',
      entityName: 'TaskRun',
      locator: {
        taskId: 'TodoItem.completeAll',
        runId: 'run-1',
      },
    });
  });

  it('projects one public Task snapshot by composite identity', async () => {
    const snapshot = {
      taskId: 'TodoItem.completeAll',
      runId: 'run-1',
      status: 'running',
      updatedAt: '2026-09-05T00:00:00.000Z',
      progress: { phase: 'todos', percent: 50 },
    } satisfies TaskSnapshot;
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        TaskRun: [
          snapshot,
          {
            ...snapshot,
            runId: 'run-2',
            status: 'completed',
          },
        ],
      },
      entities: [TaskRun],
    });

    const result = await Effect.runPromise(
      runtime.run(TaskRunByIdentity, {
        taskId: snapshot.taskId,
        runId: snapshot.runId,
      }),
    );

    expect(result).toEqual([snapshot]);
    expectTypeOf(result[0]).toMatchTypeOf<TaskRunEntity | undefined>();
    expectTypeOf<TaskRunEntity>().toMatchTypeOf<TaskSnapshot>();
  });
});
