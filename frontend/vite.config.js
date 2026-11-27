import { defineConfig, createLogger, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const logger = createLogger();
const originalError = logger.error.bind(logger);

// Suppress benign client disconnect ECONNRESET errors from the dev WebSocket proxy
logger.error = (msg, options) => {
  if (
    options?.error?.code === 'ECONNRESET' ||
    (typeof msg === 'string' && (msg.includes('ECONNRESET') || msg.includes('ws proxy socket error')))
  ) {
    return;
  }
  originalError(msg, options);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT || 5173);
  const backendTarget = env.VITE_BACKEND_URL || 'http://localhost:4040';

  return {
    customLogger: logger,
    plugins: [react()],
    server: {
      port,
      strictPort: false,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Backend API unreachable',
                  message: `Cannot connect to backend at ${backendTarget}. Make sure the backend server is running on port 4040.`,
                  code: err.code || 'ECONNREFUSED'
                }));
              }
            });
          },
        },
        '/uploads': { target: backendTarget, changeOrigin: true },
        '/ws': {
          target: backendTarget,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              if (err?.code === 'ECONNRESET') return;
            });
            proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
              socket.on('error', (err) => {
                if (err?.code === 'ECONNRESET') return;
              });
            });
          },
        },
      },
    },
  };
});
