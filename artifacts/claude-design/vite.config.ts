import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);

// Local development only: the app fetches /api/* on its own origin, which the
// Vite dev server does not serve. Set API_PROXY_TARGET (e.g. http://localhost:5000)
// to forward those calls to a locally running api-server. Unset in production,
// where a single origin serves both, so this changes nothing there.
const apiProxyTarget = process.env.API_PROXY_TARGET;

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  root: import.meta.dirname,
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    ...(apiProxyTarget
      ? { proxy: { '/api': { target: apiProxyTarget, changeOrigin: false } } }
      : {}),
  },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'dist/public', emptyOutDir: true },
});
