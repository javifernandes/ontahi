import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./src/server-only.test-support.ts', import.meta.url)),
      workflow: fileURLToPath(new URL('./src/workflow.test-support.ts', import.meta.url)),
    },
  },
  test: {
    server: {
      deps: {
        inline: ['@ontahi/runtime-vercel-workflows'],
      },
    },
  },
});
