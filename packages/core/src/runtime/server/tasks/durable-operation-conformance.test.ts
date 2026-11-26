import { Effect } from 'effect';
import { it } from 'vitest';

import { verifyDurableOperationConformance } from './durable-operation-conformance.js';
import { createInProcessTaskRuntime } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';

it.each(['atomic-admission', 'approval-resumption'] as const)(
  'runs the durable contract fixture for %s with memory storage',
  name => {
    const storage = createInMemoryTaskStorage();
    return verifyDurableOperationConformance(name, {
      open: task => {
        const runtime = createInProcessTaskRuntime({
          storage,
          deferExplicitExecution: true,
        });
        runtime.register?.(task);
        return {
          runtime,
          drive: async () => {
            const [candidate] = (await Effect.runPromise(storage.listRecent())).filter(
              run =>
                run.taskId === task.id && ['queued', 'running', 'waiting'].includes(run.status),
            );
            if (candidate) await Effect.runPromise(runtime.runCheckpoint(candidate));
          },
        };
      },
    });
  },
);
