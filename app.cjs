// Root entry wrapper for Hostinger / LiteSpeed Web Server (lsnode.js / CommonJS)
import('./backend/src/server.js').catch((err) => {
  console.error('Fatal error starting server from app.cjs wrapper:', err);
  process.exit(1);
});
