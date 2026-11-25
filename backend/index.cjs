// CommonJS entry wrapper for Hostinger / LiteSpeed Web Server (lsnode.js)
// Dynamically imports the ESM server so lsnode's require() succeeds cleanly.
import('./src/server.js').catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
