// Environment is loaded by config/db.js (backend/.env, then repo-root .env) before
// anything touches the database; ES module imports are evaluated first anyway.
import app from './app.js';
import { pool, ping } from './config/db.js';
import { ensureMigrations } from './config/autoMigrate.js';
import { attachChatWs } from './ws/chat.js';
import { startLrSyncWorker } from './workers/lrSyncWorker.js';

const port = process.env.PORT || 4040;

// ── Boot diagnostics: verify MySQL & apply pending migrations before serving ──
async function probeDatabase() {
  try {
    const info = await ping();
    console.log(`✓ MySQL ${info.version} connected (database: ${info.database}) in ${info.ms} ms — database ready`);
    await ensureMigrations();
    startLrSyncWorker(20);
  } catch (e) {
    const reason = e.code === 'ECONNREFUSED'
      ? 'connection refused — MySQL service is not running'
      : e.message;
    console.error(`
⚠ DATABASE WARNING: ${reason}`);
    console.error('  The API will still start, but every /api route will fail until MySQL is reachable.');
    console.error('  Diagnose with:  cd backend && npm run db:check');
  }
}
probeDatabase();

const server = app.listen(port, () => {
  console.log(`POMS API listening on http://localhost:${port}`);
  console.log(`  frontend dev proxy target: http://localhost:${port} (must match frontend/vite.config.js)`);

  // Keep application warm on LiteSpeed / lsnode (prevent 300-second idle sleep)
  const PING_INTERVAL = 240_000; // 4 minutes (< 300s timeout)
  setInterval(async () => {
    try {
      const urls = [`http://127.0.0.1:${port}/api/health`];
      if (process.env.APP_URL) urls.push(`${process.env.APP_URL}/api/health`);
      for (const u of urls) {
        await fetch(u, { headers: { 'User-Agent': 'POMS-KeepAlive' } }).catch(() => {});
      }
    } catch (_) {}
  }, PING_INTERVAL).unref();
});

// Keep chat/notify WebSockets alive; log upstream socket errors instead of crashing
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${port} is already in use — another POMS API instance is probably running.`);
    console.error(`  Stop it or change PORT in backend/.env. (Frontend proxy expects port 4040.)`);
    process.exit(1);
  }
  console.error('Server error:', e.message);
});

// Global safety nets — log loudly in dev instead of dying silently
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('Uncaught exception:', e?.message || e));

attachChatWs(server); // live team chat on ws://localhost:<port>/ws/chat

async function shutdown(signal) {
  console.log(`\n${signal} received — closing server and DB pool`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
