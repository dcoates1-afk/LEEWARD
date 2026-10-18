/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { marnavServer } from './server/marnavServer';

const PREVIEW_HOST = 'pv-4e1b47965a0a-e20c7739-64dd-41c7-a006-929c049b531a.style.dev';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.MARNAV_PORT || 3000);

  return {
    plugins: [react(), marnavServer({ aisKey: env.AISSTREAM_API_KEY ?? '' })],
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: [PREVIEW_HOST, 'localhost', '127.0.0.1'],
    },
    preview: {
      host: '0.0.0.0',
      port,
      allowedHosts: [PREVIEW_HOST, 'localhost', '127.0.0.1'],
    },
    build: {
      target: 'es2020',
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
