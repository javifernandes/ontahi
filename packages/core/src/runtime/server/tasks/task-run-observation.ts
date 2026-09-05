import { Effect, Stream } from 'effect';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  mutateEntity,
  type InferEntityMutationRecord,
} from '../../../data-graph/index.js';

import { toTaskFailure } from './failures.js';
import { TaskRun, TaskRunByIdentity, type TaskRunEntity } from './task-run-entity.js';
import type { TaskFailure, TaskRunIdentity, TaskSnapshot } from './types.js';

export type TaskRunProjection = {
  publish(snapshot: TaskSnapshot): Effect.Effect<void, TaskFailure>;
  observe(ref: TaskRunIdentity): Stream.Stream<TaskSnapshot, TaskFailure>;
};

type TaskRunMutationRecord = InferEntityMutationRecord<(typeof TaskRun)['fields']>;

const toTaskRunEntity = (snapshot: TaskSnapshot): TaskRunMutationRecord => ({
  taskId: snapshot.taskId,
  runId: snapshot.runId,
  status: snapshot.status,
  updatedAt: snapshot.updatedAt,
  ...(snapshot.subject ? { subject: snapshot.subject } : {}),
  ...(snapshot.createdAt ? { createdAt: snapshot.createdAt } : {}),
  ...(snapshot.startedAt ? { startedAt: snapshot.startedAt } : {}),
  ...(snapshot.completedAt ? { completedAt: snapshot.completedAt } : {}),
  ...(snapshot.progress ? { progress: snapshot.progress } : {}),
  ...(snapshot.error ? { error: snapshot.error } : {}),
  ...(snapshot.result !== undefined ? { result: snapshot.result } : {}),
});

const keyOf = (ref: TaskRunIdentity) => `${ref.taskId}:${ref.runId}`;

export const createInMemoryTaskRunProjection = (): TaskRunProjection => {
  const runtime = createInMemoryDataGraphRuntime({
    dataset: { TaskRun: [] },
    entities: [TaskRun],
  });
  const mutation = mutateEntity(TaskRun);
  const published = new Set<string>();

  return {
    publish: snapshot =>
      Effect.gen(function* () {
        const key = keyOf(snapshot);
        const value = toTaskRunEntity(snapshot);
        if (published.has(key)) {
          yield* runtime.runEntityMutationCommand(
            mutation.update(
              createEntityRef(TaskRun, {
                taskId: snapshot.taskId,
                runId: snapshot.runId,
              }),
              value,
            ),
          );
        } else {
          yield* runtime.runEntityMutationCommand(mutation.create(value));
          published.add(key);
        }
      }).pipe(Effect.mapError(toTaskFailure), Effect.asVoid),
    observe: ref =>
      runtime.observe(TaskRunByIdentity, ref).pipe(
        Stream.mapError(toTaskFailure),
        Stream.map(snapshots => snapshots[0]),
        Stream.filter((snapshot): snapshot is TaskRunEntity => snapshot !== undefined),
      ),
  };
};
