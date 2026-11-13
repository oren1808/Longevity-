import { defineConfig } from 'vite';

// Static build: `npm run build` → apps/pilot/dist, deployable to any static host (relative base).
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
  server: { fs: { allow: ['../..'] } },
});
