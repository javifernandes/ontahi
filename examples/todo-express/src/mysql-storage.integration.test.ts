import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { createPool } from 'mysql2/promise';
import { GenericContainer, Wait } from 'testcontainers';
import { expect, it } from 'vitest';

it('runs Todo operations and preserves tags and ordering across Express host restarts with MySQL', async () => {
  const password = randomUUID();
  const container = await new GenericContainer('mysql:8.4')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: password, MYSQL_DATABASE: 'ontahi_todos' })
    .withExposedPorts(3306)
    .withHealthCheck({
      test: [
        'CMD-SHELL',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot --silent',
      ],
      interval: 1000,
      timeout: 3000,
      retries: 60,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();
  const uri = `mysql://root:${password}@${container.getHost()}:${container.getMappedPort(3306)}/ontahi_todos`;
  const pool = createPool(uri);
  try {
    const migration = await readFile(
      new URL('../migrations-mysql/001-create-todos.sql', import.meta.url),
      'utf8',
    );
    for (const statement of migration
      .replaceAll(/^DELIMITER .*$/gm, '')
      .split('$$')
      .map(sql => sql.trim())
      .filter(Boolean))
      await pool.query(statement);
    const invoke = promisify(execFile);
    for (const phase of ['write', 'read']) {
      const result = await invoke(
        process.execPath,
        [
          '--import',
          'tsx',
          new URL('./mysql-process.test-support.ts', import.meta.url).pathname,
          phase,
        ],
        {
          env: {
            ...process.env,
            TODO_STORAGE: 'mysql',
            DATABASE_URL: uri,
            TODO_AUTH_MODE: 'disabled',
          },
          timeout: 30_000,
        },
      );
      expect(result.stderr).toBe('');
    }
  } finally {
    await pool.end();
    await container.stop();
  }
}, 180_000);
