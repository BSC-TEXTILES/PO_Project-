import express from 'express';
import cors from 'cors';
import { selfTest } from './utils/pricing.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { helmetMiddleware, additionalSecurityHeaders, rateLimit } from './middleware/security.js';
import { securityContext, logRateLimit } from './middleware/securityLogger.js';
import { sanitizeInput, rejectSuspiciousPayload } from './middleware/sanitize.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import mastersRoutes from './routes/masters.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import approvalRoutes from './routes/approvals.js';
import receiptRoutes from './routes/receipts.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import miscRoutes from './routes/misc.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/uploads.js';
import searchRoutes from './routes/search.js';
import manufacturerRoutes from './routes/manufacturers.js';
import roleRoutes from './routes/roles.js';
import pricingRoutes from './routes/pricing.js';
import videoRoutes from './routes/videos.js';
import locationRoutes from './routes/locations.js';
import productTypeRoutes from './routes/productTypes.js';
import collectionRoutes from './routes/collections.js';
import fileRoutes from './routes/files.js';
import importRoutes from './routes/import.js';
import trackingRoutes from './routes/tracking.js';

selfTest(); // RB-017 guard: engine must reproduce FRS §13.3 exactly at boot

const app = express();
// Render / Vercel sit behind a reverse proxy — required for correct client IPs.
app.set('trust proxy', 1);

// ─── SECURITY LAYER 1: Helmet (HTTP security headers) ─────────────────────
app.use(helmetMiddleware);
app.use(additionalSecurityHeaders);

// ─── SECURITY LAYER 2: CORS ───────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
  origin(origin, cb) {
    // Allow requests without Origin header (curl, mobile apps, same-origin, server-to-server)
    if (!origin) return cb(null, true);

    // In development mode, allow any local origin (localhost / 127.0.0.1 on any port)
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }

    // Check explicitly configured origins from CORS_ORIGIN
    if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }

    // Reject unlisted cross-origin requests cleanly without throwing an unhandled exception
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With', 'X-Tab-Id'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 86400, // preflight cache 24h
}));

// ─── SECURITY LAYER 3: Global rate limiting ───────────────────────────────
const apiLimiter = rateLimit(600, 60 * 1000);

// ─── SECURITY LAYER 4: Body parsing with size limits ──────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

// ─── SECURITY LAYER 5: Security context for logging ──────────────────────
app.use(securityContext);

// ─── SECURITY LAYER 6: Suspicious payload detection ──────────────────────
app.use(rejectSuspiciousPayload);

// ─── SECURITY LAYER 7: Rate limit event logging ──────────────────────────
app.use(logRateLimit);

// ─── Request timing logger ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.originalUrl !== '/api/health') {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
});

// ─── Public endpoints (no auth required) ───────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  const engine = 'mysql';
  try {
    const { ping } = await import('./config/db.js');
    await ping();
    dbStatus = 'connected (mysql)';
  } catch (e) {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    service: 'poms-api',
    database: engine,
    dbStatus,
    time: new Date().toISOString(),
    version: '1.0.0',
  });
});

// General per-IP budget for the whole API surface.
app.use('/api', apiLimiter);

// Uploaded files (product images, PO attachments, avatars — every file type) as
// read-only static assets so <img>/<video>/PDF previews work with plain URLs.
import { uploadsDir } from './utils/storage.js';
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', index: false }));

// ─── Protected API routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes); // /api/uploads, avatars — MUST precede /api/users
app.use('/api/users', usersRoutes);
app.use('/api', mastersRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', miscRoutes); // /api/audit-logs, /api/notifications, /api/settings
app.use('/api/chat', chatRoutes);
app.use('/api', searchRoutes);
app.use('/api/manufacturers', manufacturerRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/product-types', productTypeRoutes);
app.use('/api', collectionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/import', importRoutes);

// ─── Serve the built React client (single-origin full-stack site) ──────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const candidateDirs = [
  path.join(currentDir, '..', 'public'),
  path.join(currentDir, '..', 'dist'),
  path.join(currentDir, '..', '..', 'public'),
  path.join(currentDir, '..', '..', 'dist'),
  path.join(currentDir, '..', '..', 'frontend', 'dist'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(process.cwd(), 'backend', 'public'),
  path.resolve(process.cwd(), 'backend', 'dist'),
  path.resolve(process.cwd(), 'frontend', 'dist'),
  path.resolve(process.cwd(), '..', 'frontend', 'dist'),
];

// Deduplicate directories and register static middleware
const registeredDirs = new Set();
for (const dir of candidateDirs) {
  const resolved = path.resolve(dir);
  if (fs.existsSync(resolved) && !registeredDirs.has(resolved)) {
    registeredDirs.add(resolved);
    app.use(express.static(resolved));
  }
}

// Client-side SPA routing fallback: serve index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  // Do not serve index.html for missing static asset files (avoids MIME type errors)
  if (/\.[a-zA-Z0-9]{2,8}$/.test(req.path)) {
    return next();
  }
  // 1. Check all registered directories
  for (const dir of registeredDirs) {
    const file = path.join(dir, 'index.html');
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  }
  // 2. Dynamic check across all candidate directories
  for (const dir of candidateDirs) {
    const resolved = path.resolve(dir);
    const file = path.join(resolved, 'index.html');
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  }
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BSC Exclusive POMS</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
    .card { background: #fff; padding: 36px 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 480px; text-align: center; }
    h1 { color: #1e40af; margin-top: 0; font-size: 22px; }
    p { color: #64748b; font-size: 14px; line-height: 1.6; }
    a { display: inline-block; margin-top: 14px; color: #1e40af; font-weight: 600; text-decoration: none; border: 1px solid #93c5fd; padding: 8px 18px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>BSC Exclusive POMS API</h1>
    <p>The backend service is running and ready. The web application build is initializing.</p>
    <a href="/api/health">Verify API Health</a>
  </div>
</body>
</html>`);
});

// ─── Error handling (must be last) ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
