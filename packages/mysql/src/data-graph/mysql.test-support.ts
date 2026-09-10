import { randomUUID } from 'node:crypto';

import { createPool } from 'mysql2/promise';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export const startMysqlTestDatabase = async () => {
  let container: StartedTestContainer | undefined;
  let uri = process.env.ONTAHI_MYSQL_TEST_URL;
  if (!uri) {
    const password = randomUUID();
    container = await new GenericContainer('mysql:8.4')
      .withEnvironment({ MYSQL_ROOT_PASSWORD: password, MYSQL_DATABASE: 'ontahi' })
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
    uri = `mysql://root:${password}@${container.getHost()}:${container.getMappedPort(3306)}/ontahi`;
  }
  const pool = createPool(uri);
  return {
    pool,
    close: async () => {
      await pool.end();
      await container?.stop();
    },
  };
};
