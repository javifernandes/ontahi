import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.mjs'],
      exclude: ['test/**/*.js'],
      thresholds: {
        statements: 78,
        branches: 71,
        functions: 82,
        lines: 78,
      },
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
