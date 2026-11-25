# BSC Exclusive POMS — Deployment Instructions

## Overview

This document provides complete deployment instructions for the BSC Exclusive Purchase Order Management System (POMS).

**Architecture:**
- **Backend:** Node.js 20+ / Express 4.19 / MySQL 8.0
- **Frontend:** React 18 / Vite 5 / Single-page application
- **Database:** MySQL 8.0.19+ (only supported engine)

---

## Prerequisites

### System Requirements
- **OS:** Linux (Ubuntu 22.04+ / RHEL 9+) or Windows Server 2022+
- **Node.js:** 20.x LTS or 22.x LTS
- **MySQL:** 8.0.19 or newer (8.0.46 recommended)
- **RAM:** 2 GB minimum (4 GB recommended for production)
- **Disk:** 10 GB minimum for application + database
- **Network:** Port 4040 (backend), 80/443 (frontend via reverse proxy)

### Required Software
```bash
# Ubuntu/Debian
apt-get update && apt-get install -y nodejs npm mysql-server nginx

# RHEL/Fedora
dnf install -y nodejs npm mysql-server nginx

# Verify versions
node --version    # v20.x or v22.x
npm --version     # 10.x+
mysql --version   # 8.0.19+
nginx -v          # 1.24+
```

---

## Database Setup

### 1. Create Database and User
```sql
-- Run as MySQL root
CREATE DATABASE IF NOT EXISTS bsc_textiles
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'poms_app'@'%' IDENTIFIED BY 'STRONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON bsc_textiles.* TO 'poms_app'@'%';
FLUSH PRIVILEGES;

-- Verify
SHOW GRANTS FOR 'poms_app'@'%';
```

### 2. Configure MySQL for Production
```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf (or /etc/my.cnf.d/server.cnf)
[mysqld]
# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_0900_ai_ci

# Connection limits
max_connections = 200
max_connect_errors = 100000

# InnoDB tuning
innodb_buffer_pool_size = 1G  # 70-80% of RAM
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 1
innodb_flush_method = O_DIRECT

# Binary logging (required for replication, optional otherwise)
log_bin = mysql-bin
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 100M

# Security
local_infile = 0
secure_file_priv = /var/lib/mysql-files

# Performance
query_cache_type = 0
query_cache_size = 0
tmp_table_size = 64M
max_heap_table_size = 64M
```

Restart MySQL after changes:
```bash
systemctl restart mysql
```

---

## Backend Deployment

### 1. Clone and Install
```bash
cd /opt
git clone <repository-url> bsc-exclusive-poms
cd bsc-exclusive-poms/backend
npm ci --production
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with production values
```

**Required .env variables:**
```env
# Server
PORT=4040
NODE_ENV=production

# Database (REQUIRED)
DB_HOST=localhost
DB_PORT=3306
DB_USER=poms_app
DB_PASSWORD=STRONG_RANDOM_PASSWORD
DB_NAME=bsc_textiles
DB_CONNECTION_LIMIT=20
# For managed MySQL with TLS:
# DB_SSL=true
# DB_SSL_REJECT_UNAUTHORIZED=true

# Authentication
JWT_SECRET=GENERATE_32_PLUS_CHAR_RANDOM_STRING
JWT_EXPIRES_IN=8h
REFRESH_EXPIRES_IN=7d

# CORS (frontend origin)
CORS_ORIGIN=https://poms.yourdomain.com

# File storage
STORAGE_DRIVER=local  # or 'supabase'
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=xxx
# SUPABASE_BUCKET=poms-uploads

# QR codes / deep links
PUBLIC_APP_ORIGIN=https://poms.yourdomain.com

# Security
RATE_LIMIT_MAX=600
RATE_LIMIT_WINDOW_MS=60000
MAX_FILE_SIZE_MB=200
MAX_FILES_PER_UPLOAD=20

# Logging
LOG_LEVEL=info
SECURITY_LOG_ENABLED=true

# Business timezone
APP_UTC_OFFSET=+05:30
SESSION_MAX_AGE_HOURS=168
```

### 3. Run Migrations and Seed
```bash
# Create database schema (idempotent)
npm run db:migrate -- --create-db

# Seed master data and demo users (idempotent)
npm run seed
```

### 4. Configure Systemd Service
```ini
# /etc/systemd/system/poms-backend.service
[Unit]
Description=BSC Exclusive POMS Backend
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=poms
WorkingDirectory=/opt/bsc-exclusive-poms/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=poms-backend

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/bsc-exclusive-poms/backend/uploads
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
# Create user
useradd -r -s /bin/false -d /opt/bsc-exclusive-poms poms
chown -R poms:poms /opt/bsc-exclusive-poms

# Enable and start
systemctl daemon-reload
systemctl enable --now poms-backend
systemctl status poms-backend
```

### 5. Verify Backend
```bash
# Health check
curl http://localhost:4040/api/health
# Expected: {"status":"ok","database":"mysql","dbStatus":"connected (mysql)",...}

# Test authentication
curl -X POST http://localhost:4040/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bsc.local","password":"Admin@123"}'
```

---

## Frontend Deployment

### 1. Build Production Bundle
```bash
cd /opt/bsc-exclusive-poms/frontend

# Create production env
cat > .env <<EOF
VITE_API_BASE=https://poms.yourdomain.com/api
EOF

npm ci
npm run build
# Output: dist/
```

### 2. Configure Nginx
```nginx
# /etc/nginx/sites-available/poms-frontend
server {
    listen 80;
    listen [::]:80;
    server_name poms.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name poms.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/poms.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/poms.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /opt/bsc-exclusive-poms/frontend/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://poms.yourdomain.com wss://poms.yourdomain.com;" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/javascript application/json application/xml;

    # Static assets - long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # WebSocket endpoints
    location /ws/ {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # SPA fallback - serve index.html for all non-API routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Uploaded files (if using local storage)
    location /uploads/ {
        alias /opt/bsc-exclusive-poms/backend/uploads/;
        expires 1d;
        add_header Cache-Control "public";
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/poms-frontend /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 3. SSL Certificate (Let's Encrypt)
```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d poms.yourdomain.com
# Follow prompts, select "Redirect HTTP to HTTPS"
```

---

## Database Backup & Recovery

### Automated Backup Script
```bash
#!/bin/bash
# /opt/bsc-exclusive-poms/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="/opt/bsc-exclusive-poms/backups"
DB_NAME="bsc_textiles"
DB_USER="poms_app"
DB_PASS="$(grep DB_PASSWORD /opt/bsc-exclusive-poms/backend/.env | cut -d'=' -f2)"
DATE=$(date +%Y%m%d-%H%M%S)
FILENAME="poms-backup-${DATE}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "Starting backup at $(date)..."

mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --column-statistics=0 \
  -u "${DB_USER}" -p"${DB_PASS}" \
  "${DB_NAME}" | gzip > "${BACKUP_DIR}/${FILENAME}"

# Verify backup
if [ -f "${BACKUP_DIR}/${FILENAME}" ] && [ -s "${BACKUP_DIR}/${FILENAME}" ]; then
    echo "Backup completed: ${BACKUP_DIR}/${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"
    
    # Keep last 30 days
    find "${BACKUP_DIR}" -name "poms-backup-*.sql.gz" -mtime +30 -delete
else
    echo "ERROR: Backup failed or empty!" >&2
    exit 1
fi
```

```bash
chmod +x /opt/bsc-exclusive-poms/scripts/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/bsc-exclusive-poms/scripts/backup.sh >> /var/log/poms-backup.log 2>&1") | crontab -
```

### Manual Backup
```bash
cd /opt/bsc-exclusive-poms/backend
npm run db:backup
# Output: backups/poms-backup-YYYYMMDD-HHMMSS.sql.gz
```

### Recovery Procedure

#### Option 1: Full Restore (Fresh Database)
```bash
# 1. Stop application
systemctl stop poms-backend

# 2. Create fresh database
mysql -u root -p -e "DROP DATABASE IF EXISTS bsc_textiles; CREATE DATABASE bsc_textiles CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

# 3. Restore from backup
gunzip -c /opt/bsc-exclusive-poms/backups/poms-backup-YYYYMMDD-HHMMSS.sql.gz | mysql -u root -p bsc_textiles

# 4. Run migrations (idempotent, safe)
cd /opt/bsc-exclusive-poms/backend
npm run db:migrate

# 5. Start application
systemctl start poms-backend
```

#### Option 2: Point-in-Time Recovery (If Binary Logging Enabled)
```bash
# 1. Find binary log position from backup timestamp
# 2. Restore base backup (Option 1)
# 3. Apply binary logs up to desired point
mysqlbinlog --start-datetime="2026-11-25 10:00:00" --stop-datetime="2026-11-25 10:30:00" /var/lib/mysql/mysql-bin.000001 | mysql -u root -p bsc_textiles
```

---

## Post-Deployment Verification

### 1. Health Checks
```bash
# Backend
curl -f https://poms.yourdomain.com/api/health

# Frontend
curl -f https://poms.yourdomain.com/ | grep -q "BSC Exclusive"

# Database connectivity (via backend)
curl -f https://poms.yourdomain.com/api/health | jq -r .dbStatus
```

### 2. Functional Smoke Tests
```bash
# Login
TOKEN=$(curl -s -X POST https://poms.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bsc.local","password":"Admin@123"}' | jq -r .token)

# List POs
curl -s -H "Authorization: Bearer $TOKEN" https://poms.yourdomain.com/api/purchase-orders | jq '.data | length'

# Create test PO (if permissions allow)
curl -s -X POST https://poms.yourdomain.com/api/purchase-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"supplierId":"...","divisionId":"...","departmentId":"...","sectionId":"...","lines":[...]}'
```

### 3. Security Verification
```bash
# Security headers
curl -I https://poms.yourdomain.com/api/health | grep -i -E "x-frame-options|x-content-type-options|referrer-policy|strict-transport-security"

# Rate limiting
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" https://poms.yourdomain.com/api/health; done | grep 429

# CORS
curl -H "Origin: https://evil.com" -I https://poms.yourdomain.com/api/health | grep -i access-control-allow-origin
```

---

## Monitoring & Maintenance

### Log Files
| Component | Location |
|-----------|----------|
| Backend | `journalctl -u poms-backend -f` |
| Nginx Access | `/var/log/nginx/access.log` |
| Nginx Error | `/var/log/nginx/error.log` |
| MySQL Error | `/var/log/mysql/error.log` |
| Backup | `/var/log/poms-backup.log` |

### Key Metrics to Monitor
- API response time (p95 < 500ms)
- Error rate (< 0.1%)
- Database connection pool usage (< 80%)
- Disk space (> 20% free)
- Memory usage (< 80%)
- SSL certificate expiry (> 30 days)

### Routine Maintenance
| Task | Frequency |
|------|-----------|
| Database backup | Daily (automated) |
| Log rotation | Weekly (logrotate) |
| SSL renewal | Auto (certbot) |
| Security updates | Monthly |
| Dependency audit | Monthly (`npm audit`) |
| Migration check | Before each deploy |

---

## Troubleshooting

### Backend Won't Start
```bash
# Check logs
journalctl -u poms-backend -n 100

# Common issues:
# 1. Database connection failed → check DB_HOST, DB_USER, DB_PASSWORD, MySQL running
# 2. Port 4040 in use → check `ss -tlnp | grep 4040`
# 3. Migration failed → check MySQL version (8.0.19+ required), SUPER privilege for triggers
```

### Frontend Shows Blank Page
```bash
# Check nginx config
nginx -t

# Check browser console for:
# - CORS errors (CORS_ORIGIN mismatch)
# - API base URL wrong (VITE_API_BASE)
# - WebSocket connection failed (WS proxy)
```

### Database Connection Issues
```bash
# Test connection
mysql -h localhost -u poms_app -p bsc_textiles -e "SELECT 1"

# Check MySQL status
systemctl status mysql
mysql -u root -p -e "SHOW PROCESSLIST; SHOW VARIABLES LIKE 'max_connections';"
```

### Permission Denied on File Upload
```bash
# Fix upload directory permissions
chown -R poms:poms /opt/bsc-exclusive-poms/backend/uploads
chmod 755 /opt/bsc-exclusive-poms/backend/uploads
```

---

## Rollback Procedure

If deployment fails:

1. **Frontend:** `nginx -s reload` with previous config, or redeploy previous `dist/` build
2. **Backend:** `systemctl restart poms-backend` (code is backward-compatible with DB)
3. **Database:** Restore from latest backup (see Recovery Procedure)
4. **Full Rollback:** Restore server from snapshot/AMI if using cloud infrastructure

---

## Support Contacts

| Issue Type | Contact |
|------------|---------|
| Infrastructure | DevOps Team |
| Application Bugs | Development Team |
| Database Issues | DBA Team |
| Security Incidents | Security Team |

---

**Document Version:** 1.0  
**Last Updated:** November 25, 2026  
**Next Review:** Before production deployment