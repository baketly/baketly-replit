import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  root: import.meta.dirname,
  server: { port, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'dist/public', emptyOutDir: true },
});
