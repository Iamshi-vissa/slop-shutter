import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// The web app lives in web/ and imports the shared engine from src/ and the samples from
// samples/, so the dev server is allowed to read the whole project.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    fs: { allow: [root] },
    // In development, send API calls to the Node server (npm run serve:api).
    proxy: { '/api': 'http://127.0.0.1:4173' },
  },
});
