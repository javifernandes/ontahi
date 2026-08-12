import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'test/**/*.{ts,tsx}'],
      thresholds: {
        lines: 1,
        branches: 0.9,
        functions: 1,
        statements: 1,
      },
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
        },
      },
    ],
  },
});
