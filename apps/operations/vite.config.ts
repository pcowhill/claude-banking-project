import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Operations simulator runs on port 5174 (one above the customer app) so both
// can be open side by side in separate browser tabs/windows.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, host: true },
  preview: { port: 5174, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
