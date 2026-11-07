import type { TaskStatus } from '../../contracts.js';

import type { TaskRunsBySubjectQuery } from './types.js';

const taskStatuses = new Set<TaskStatus>([
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);

export const MAX_TASK_RUNS_BY_SUBJECT_LIMIT = 100;

export const normalizeTaskRunsBySubjectQuery = (
  query: TaskRunsBySubjectQuery,
): TaskRunsBySubjectQuery => {
  if (
    typeof query.subject.type !== 'string' ||
    query.subject.type.length === 0 ||
    typeof query.subject.id !== 'string' ||
    query.subject.id.length === 0
  ) {
    throw new TypeError('Task subject type and id must be non-empty strings.');
  }
  if (!Number.isSafeInteger(query.limit) || query.limit < 1) {
    throw new TypeError('Task subject discovery limit must be a positive safe integer.');
  }
  if (query.limit > MAX_TASK_RUNS_BY_SUBJECT_LIMIT) {
    throw new TypeError(
      `Task subject discovery limit cannot exceed ${MAX_TASK_RUNS_BY_SUBJECT_LIMIT}.`,
    );
  }
  const statuses = [...new Set(query.statuses ?? [])];
  if (statuses.some(status => !taskStatuses.has(status))) {
    throw new TypeError('Task subject discovery status is invalid.');
  }
  return {
    subject: query.subject,
    limit: query.limit,
    ...(statuses.length === 0 ? {} : { statuses }),
  };
};
