import { describe, expect, it } from 'vitest';

import { createPostgresTaskSchemaSql, resolvePostgresTaskTableName } from './schema.js';

describe('PostgreSQL Task schema', () => {
  it('creates the task run table and lookup indexes', () => {
    const sql = createPostgresTaskSchemaSql().join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ontahi_task_runs"');
    expect(sql).toContain('PRIMARY KEY (task_id, run_id)');
    expect(sql).toContain('checkpoint jsonb');
    expect(sql).toContain('ontahi_task_runs_admission_uidx');
    expect(sql).toContain('ontahi_task_runs_runnable_idx');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ontahi_task_runs_observations"');
  });

  it('accepts a focused table override and rejects unsafe identifiers', () => {
    expect(resolvePostgresTaskTableName({ runs: 'app_task_runs' })).toBe('app_task_runs');
    expect(() => createPostgresTaskSchemaSql({ runs: 'task-runs' })).toThrow('Invalid');
  });
});
