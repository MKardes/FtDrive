import { defineConfig } from 'tsup';

// Builds the backend to ESM. node_modules (incl. native bindings: better-sqlite3,
// sharp, argon2) are kept external. Produces dist/index.js plus the migrate +
// create-owner CLI entrypoints for production use without devDependencies.
export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/cli/create-owner.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
  skipNodeModulesBundle: true,
  dts: false,
});
