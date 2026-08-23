import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-support.ts'],
      thresholds: {
        lines: 1,
        branches: 0.9,
        functions: 1,
        statements: 1,
      },
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
