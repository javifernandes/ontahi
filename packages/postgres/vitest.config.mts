import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        ['lcov', { projectRoot: fileURLToPath(new URL('../../', import.meta.url)) }],
      ],
      reportsDirectory: './coverage',
      // The PostgreSQL suite runs every case in Core's shared durable-operation contract.
      allowExternal: true,
      include: [
        'src/**/*.ts',
        '**/core/dist/runtime/server/tasks/durable-operation-conformance.js',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-support.ts'],
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
