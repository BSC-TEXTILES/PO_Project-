# Production Deployment & Infrastructure Guide (DEPLOYMENT) — BSC Exclusive POMS

> **Hosting Platform**: Hostinger Cloud Linux / LiteSpeed Enterprise Web Server  
> **Process Manager**: `lsnode.js` / Node.js 20+ LTS  
> **Production Domain**: `po.bsctextiles.in`  
> **Database Engine**: MariaDB 11.8.9-log (`u101820758_PO_PROJECT_1`)

---

## 1. LiteSpeed & Node.js Execution Architecture

Hostinger manages Node.js applications through the LiteSpeed `lsnode` reverse-proxy engine:
1. LiteSpeed maps external web requests (ports 80/443) directly to the designated Node.js entry point (`backend/src/server.js` or `app.js`).
2. **Idle Process Termination**: By default, `lsnode` terminates application worker processes if no inbound HTTP requests are registered within 300 seconds (5 minutes), emitting `SIGTERM: lsnode: no request in 300 seconds, exit`.
3. **The Keep-Alive Solution**: `backend/src/server.js` runs an internal self-ping interval every 240 seconds (`240,000ms`) querying `/api/health`. This continuous micro-ping guarantees that `lsnode` never encounters an idle window, maintaining 100% uptime without process restarts.

```javascript
// Internal 240s Keep-Alive Loop in backend/src/server.js
const KEEP_ALIVE_INTERVAL_MS = 240 * 1000;
setInterval(() => {
  http.get(`http://localhost:${PORT}/api/health`, (res) => {
    res.resume();
  }).on('error', () => {});
}, KEEP_ALIVE_INTERVAL_MS);
```

---

## 2. Environment Variables Configuration

A production `.env` file must be created inside `backend/` (or repository root for Hostinger's environment manager). **Never commit credentials to version control.**

```ini
# Production Environment Configuration
NODE_ENV=production
PORT=4040

# Database Connection (Hostinger MariaDB 11.8)
DB_HOST=localhost
DB_PORT=3306
DB_USER=u101820758_PO_1
DB_PASSWORD="<STRONG_PRODUCTION_PASSWORD>"
DB_NAME=u101820758_PO_PROJECT_1
DB_CONNECTION_LIMIT=10

# Security Secrets (Generate using openssl rand -hex 32)
JWT_SECRET="<64_CHARACTER_RANDOM_HEX_STRING>"
SESSION_SECRET="<64_CHARACTER_RANDOM_HEX_STRING>"

# Static Uploads & Media
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=10

# Timezone Configuration
TZ=Asia/Kolkata
```

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Clone or Pull Latest Code
```bash
git fetch origin main
git checkout main
git pull origin main
```

### Step 2: Install Backend & Frontend Dependencies
```bash
npm install --prefix backend --omit=dev
npm install --prefix frontend
```

### Step 3: Compile Production Frontend Assets
```bash
npm run build --prefix frontend
# Sync built assets to all candidate static directories
cp -r frontend/dist/* backend/dist/
cp -r frontend/dist/* public/
cp -r frontend/dist/* dist/
```

### Step 4: Verify Tests & Database Migrations
```bash
npm test --prefix backend
# Migrations automatically execute on next server boot via autoMigrate.js
```

### Step 5: Restart LiteSpeed Application
In Hostinger hPanel:
1. Navigate to **Websites** $\rightarrow$ **Node.js Manager**.
2. Select `po.bsctextiles.in`.
3. Click **Restart Application**.
4. Check the application log to verify:
   ```
   ✓ MySQL 11.8.9-MariaDB-log connected in 124 ms — database ready
   ✓ Keep-alive loop scheduled (every 240s)
   POMS API listening on http://localhost:4040
   ```

---

## 4. Disaster Recovery & Rollback Plan

1. **Daily Database Dumps**: An automated cron job executes daily at 00:00 IST:
   ```bash
   mysqldump -u u101820758_PO_1 -p u101820758_PO_PROJECT_1 | gzip > /backups/db_$(date +%Y%m%d).sql.gz
   ```
2. **Instant Git Rollback**: If a deployment raises unhandled regressions:
   ```bash
   git revert HEAD --no-edit
   npm run build --prefix frontend
   # Restart Node.js in Hostinger hPanel
   ```
