import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverOrigin = process.env.TODO_SERVER_ORIGIN ?? 'http://127.0.0.1:3002';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  server: {
    proxy: {
      '/application': serverOrigin,
      '/auth': serverOrigin,
      '/graph': serverOrigin,
      '/model': serverOrigin,
      '/operations': serverOrigin,
      '/runtime': { target: serverOrigin, ws: true },
      '^/explorer/(snapshot|entities|related-entities)': serverOrigin,
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
});
