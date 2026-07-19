import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite'

// const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
// console.log(BACKEND_URL);
// console.log(import.meta.env.VITE_BACKEND_URL);

export default defineConfig(({ mode }) => {
  // 1. Load the environment variables for the current mode
  // The third argument '' loads all env vars regardless of prefix, 
  // or use 'VITE_' to only load VITE_ prefixed ones.
  const env = loadEnv(mode, process.cwd(), '')

  // 2. Return your configuration object
  return {
    plugins: [react()],
    
    // Example: Using the variable to set up a dev server proxy
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL ?? 'http://localhost:3000', // Access your variable here!
          changeOrigin: true,
          secure: false,
        },
      },
    },
    
    // If you need to pass it explicitly to some Vite config property:
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_BACKEND_URL),
    },
  }
});