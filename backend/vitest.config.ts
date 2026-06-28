import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Integration tests touch a shared temp filesystem + SQLite file; run files
    // serially to keep isolation fixtures deterministic.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
