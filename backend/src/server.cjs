// CommonJS entry wrapper for Hostinger / LiteSpeed Web Server (lsnode.js)
import('./server.js').catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
