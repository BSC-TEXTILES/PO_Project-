import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  cacheDir: 'node_modules/.vite-review',
  plugins: [{ name: 'isolated-ui-review', enforce: 'pre', configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.headers.accept?.includes('text/html')) req.url = '/tests/preview/index.html'; next(); }); }, resolveId(source, importer) {
    if (!importer?.includes('/src/') && !importer?.includes('\\src\\')) return;
    if (source.endsWith('/auth.jsx') || source === './auth.jsx') return path.join(root, 'tests/preview/auth.jsx');
    if (source.endsWith('/api.js') || source === './api.js') return path.join(root, 'tests/preview/api.js');
  } }, react()],
  optimizeDeps: { entries: ['tests/preview/index.html'] },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
