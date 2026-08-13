import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', ['junit', { outputFile: './coverage/junit.xml' }]],
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
