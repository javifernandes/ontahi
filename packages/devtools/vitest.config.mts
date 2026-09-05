import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      thresholds: {
        lines: 0.8,
        branches: 0.75,
        functions: 0.8,
        statements: 0.8,
      },
    },
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'jsdom',
    include: ['src/**/*.{test.ts,test.tsx}'],
  },
});
