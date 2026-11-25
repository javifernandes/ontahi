import { describe, expect, it } from 'vitest';

import {
  createPostgresTaskSchemaSql,
  resolvePostgresTaskTableName,
  resolveTaskObservationTableName,
} from './schema.js';

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
  it('keeps a valid 63-byte runs name and derives distinct names within the limit', () => {
    const runs = 'r'.repeat(63);
    expect(resolvePostgresTaskTableName({ runs })).toBe(runs);
    const journal = resolveTaskObservationTableName({ runs });
    expect(journal).not.toBe(runs);
    const sql = createPostgresTaskSchemaSql({ runs }).join('\n');
    const names = [
      ...sql.matchAll(/(?:INDEX IF NOT EXISTS|FUNCTION|TABLE IF NOT EXISTS) "([^"]+)"/g),
    ].map(match => match[1]!);
    expect(names).toContain(journal);
    expect(names.every(name => name.length <= 63)).toBe(true);
    expect(new Set(names).size).toBeGreaterThan(7);
    expect(() => resolvePostgresTaskTableName({ runs: runs + 'r' })).toThrow('Invalid');
  });
});
