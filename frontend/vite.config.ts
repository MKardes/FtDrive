import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the backend (default http://localhost:3000) so the
// SPA and API share an origin in development. In production the backend serves
// the built assets from dist/ directly.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 (all interfaces)
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
