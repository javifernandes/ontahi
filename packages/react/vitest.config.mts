import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['test/**/*.{ts,tsx}'],
      thresholds: {
        lines: 1,
        branches: 0.9,
        functions: 1,
        statements: 1,
      },
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'jsdom',
    include: ['test/**/*.{test.ts,test.tsx}'],
  },
});
