import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.mjs'],
      exclude: ['test/**/*.js'],
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
