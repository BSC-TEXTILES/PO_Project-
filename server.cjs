// Root entry wrapper for Hostinger / LiteSpeed Web Server (lsnode.js)
import('./backend/src/server.js').catch((err) => {
  console.error('Fatal error starting server from server.cjs wrapper:', err);
  process.exit(1);
});
