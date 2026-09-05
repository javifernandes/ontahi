import { entity, field, query, view, type InferEntityRecord } from '../../../data-graph/index.js';

import type { TaskRunIdentity, TaskSnapshot, TaskStatus, TaskSubject } from './types.js';

const taskStatuses = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly TaskStatus[];

/** Framework-owned, storage-neutral projection of the public Task run lifecycle. */
export const TaskRun = entity('TaskRun', {
  taskId: field.string(),
  runId: field.string(),
  status: field.enum(taskStatuses),
  subject: field.optional(field.json<TaskSubject>()),
  createdAt: field.optional(field.datetime()),
  startedAt: field.optional(field.datetime()),
  updatedAt: field.datetime(),
  completedAt: field.optional(field.datetime()),
  progress: field.optional(field.json<NonNullable<TaskSnapshot['progress']>>()),
  error: field.optional(field.json<NonNullable<TaskSnapshot['error']>>()),
  result: field.optional(field.json<unknown>()),
})
  .locators({
    refByTaskAndRun: ['taskId', 'runId'],
  })
  .identity('refByTaskAndRun');

export type TaskRunEntity = InferEntityRecord<(typeof TaskRun)['fields']>;

export const TaskRunByIdentity = view(
  'taskRunByIdentity',
  TaskRun,
  ({ root, params }: { root: typeof TaskRun; params: TaskRunIdentity }) =>
    query(root)
      .where(run => run.taskId.eq(params.taskId))
      .where(run => run.runId.eq(params.runId))
      .limit(1),
);
