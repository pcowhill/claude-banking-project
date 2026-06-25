import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Customer app runs on port 5173. `host: true` exposes it on the network, which
// is convenient when reviewing from Windows against a WSL Ubuntu dev server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
