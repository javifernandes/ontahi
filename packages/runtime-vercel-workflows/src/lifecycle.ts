import type {
  TaskRunIdentity,
  TaskRunSource,
  TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

type LifecycleStorage = Pick<TaskStorage, 'loadSource' | 'update' | 'updateIfStatus'>;

export const isActiveVercelTask = (source: Pick<TaskRunSource, 'status'>) =>
  source.status === 'queued' || source.status === 'running' || source.status === 'waiting';

/** Retry a storage compare-and-set while the caller still owns the transition. */
export const updateVercelTask = (
  storage: LifecycleStorage,
  ref: TaskRunIdentity,
  canUpdate: (source: TaskRunSource) => boolean,
  patch: (source: TaskRunSource) => Partial<TaskRunSource>,
) =>
  Effect.gen(function* () {
    while (true) {
      const source = yield* storage.loadSource(ref);
      if (!canUpdate(source)) return undefined;
      const snapshot = storage.updateIfStatus
        ? yield* storage.updateIfStatus(ref, source.status, patch(source), {
            runtime: source.runtime,
          })
        : yield* storage.update(ref, patch(source));
      if (snapshot) return snapshot;
    }
  });
