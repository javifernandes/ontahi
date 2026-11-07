import { describe, expect, it } from 'vitest';

import {
  MAX_TASK_RUNS_BY_SUBJECT_LIMIT,
  normalizeTaskRunsBySubjectQuery,
} from './subject-discovery.js';

describe('Task subject discovery query', () => {
  it('requires a stable subject and explicit bounded limit', () => {
    expect(() =>
      normalizeTaskRunsBySubjectQuery({ subject: { type: '', id: 'source-1' }, limit: 1 }),
    ).toThrow('non-empty strings');
    expect(() =>
      normalizeTaskRunsBySubjectQuery({
        subject: { type: 'workspace-source', id: 'source-1' },
        limit: 0,
      }),
    ).toThrow('positive safe integer');
    expect(() =>
      normalizeTaskRunsBySubjectQuery({
        subject: { type: 'workspace-source', id: 'source-1' },
        limit: MAX_TASK_RUNS_BY_SUBJECT_LIMIT + 1,
      }),
    ).toThrow(`cannot exceed ${MAX_TASK_RUNS_BY_SUBJECT_LIMIT}`);
  });

  it('deduplicates valid status filters and rejects unknown statuses', () => {
    expect(
      normalizeTaskRunsBySubjectQuery({
        subject: { type: 'workspace-source', id: 'source-1' },
        statuses: ['running', 'running', 'failed'],
        limit: 20,
      }),
    ).toEqual({
      subject: { type: 'workspace-source', id: 'source-1' },
      statuses: ['running', 'failed'],
      limit: 20,
    });
    expect(() =>
      normalizeTaskRunsBySubjectQuery({
        subject: { type: 'workspace-source', id: 'source-1' },
        statuses: ['unknown'] as never,
        limit: 20,
      }),
    ).toThrow('status is invalid');
  });
});
