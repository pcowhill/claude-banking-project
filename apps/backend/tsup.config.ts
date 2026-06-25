import { defineConfig } from 'tsup';

// Bundle the backend into dist/ for `npm start`. The shared workspace package is
// bundled in (noExternal) since it is shipped as TypeScript source; runtime deps
// like Fastify, Socket.IO and the Prisma client stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@simbank/shared'],
});
