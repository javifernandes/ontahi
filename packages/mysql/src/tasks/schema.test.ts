import { describe, expect, it } from 'vitest';

import { createMysqlTaskSchemaSql, resolveMysqlTaskTableName } from './schema.js';

describe('MySQL Task schema', () => {
  it('creates an InnoDB Task run table with indexed actor projection', () => {
    expect(createMysqlTaskSchemaSql({ runs: 'custom_task_runs' }).join('\n')).toContain(
      'CREATE TABLE IF NOT EXISTS `custom_task_runs`',
    );
    expect(createMysqlTaskSchemaSql({ runs: 'custom_task_runs' }).join('\n')).toContain(
      'ENGINE=InnoDB',
    );
    expect(createMysqlTaskSchemaSql({ runs: 'custom_task_runs' }).join('\n')).toContain(
      '`ontahi_task_actor_idx`',
    );
  });

  it('rejects unsafe or oversized table identifiers', () => {
    expect(() => resolveMysqlTaskTableName({ runs: 'unsafe-name' })).toThrow(
      'Invalid MySQL Task table name',
    );
    expect(() => resolveMysqlTaskTableName({ runs: `tasks_${'x'.repeat(60)}` })).toThrow(
      '64 characters or fewer',
    );
  });
});
