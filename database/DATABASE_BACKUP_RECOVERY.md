# BSC Exclusive POMS — Database Backup & Recovery Procedures

## Overview

This document provides comprehensive backup and recovery procedures for the POMS MySQL database.

**Database:** MySQL 8.0.46  
**Database Name:** `bsc_textiles`  
**Application User:** `poms_app`  
**Character Set:** utf8mb4  
**Collation:** utf8mb4_0900_ai_ci

---

## Backup Strategy

### Backup Types

| Type | Frequency | Retention | Use Case |
|------|-----------|-----------|----------|
| **Full Logical Backup** | Daily (2 AM) | 30 days | Point-in-time recovery, migration |
| **Incremental (Binary Log)** | Continuous | 7 days | Point-in-time recovery between full backups |
| **Schema-only Backup** | Before each deploy | 90 days | Schema comparison, rollback reference |

### Backup Storage
- **Primary:** Local disk (`/opt/bsc-exclusive-poms/backups/`)
- **Secondary (Recommended):** S3/Blob storage with lifecycle policy
- **Encryption:** AES-256 at rest (if using cloud storage)

---

## Automated Backup Configuration

### 1. Full Logical Backup (mysqldump)

**Script:** `/opt/bsc-exclusive-poms/scripts/backup.sh`

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/bsc-exclusive-poms/backups"
DB_NAME="bsc_textiles"
DB_USER="poms_app"
DB_PASS="${DB_PASSWORD}"  # From .env
DATE=$(date +%Y%m%d-%H%M%S)
FILENAME="poms-full-${DATE}.sql.gz"

mkdir -p "${BACKUP_DIR}"

mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --column-statistics=0 \
  --master-data=2 \
  --flush-logs \
  -u "${DB_USER}" -p"${DB_PASS}" \
  "${DB_NAME}" | gzip -c > "${BACKUP_DIR}/${FILENAME}"

# Verify
if [ -s "${BACKUP_DIR}/${FILENAME}" ]; then
    echo "SUCCESS: ${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"
    # Retention: 30 days
    find "${BACKUP_DIR}" -name "poms-full-*.sql.gz" -mtime +30 -delete
else
    echo "FAILED: Backup empty or missing" >&2
    exit 1
fi
```

**Cron Entry:**
```bash
# Daily at 2:00 AM
0 2 * * * /opt/bsc-exclusive-poms/scripts/backup.sh >> /var/log/poms-backup.log 2>&1
```

### 2. Binary Log Configuration (for Point-in-Time Recovery)

**MySQL Config** (`/etc/mysql/mysql.conf.d/mysqld.cnf`):
```ini
[mysqld]
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800  # 7 days
max_binlog_size = 100M
binlog_row_image = FULL
sync_binlog = 1
```

**Verify Binary Logging:**
```sql
SHOW VARIABLES LIKE 'log_bin';
SHOW BINARY LOGS;
```

### 3. npm Script Integration

**package.json** (backend):
```json
{
  "scripts": {
    "db:backup": "node scripts/backup-cli.mjs",
    "db:migrate": "node scripts/db-migrate.mjs",
    "db:restore": "node scripts/restore-cli.mjs"
  }
}
```

---

## Backup Verification

### Automated Verification
```bash
# 1. Check file exists and non-zero
if [ ! -s "${BACKUP_DIR}/${FILENAME}" ]; then
    echo "ERROR: Backup file missing or empty"
    exit 1
fi

# 2. Test restore to temporary database (weekly)
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS bsc_textiles_verify;"
gunzip -c "${BACKUP_DIR}/${FILENAME}" | mysql -u root -p bsc_textiles_verify

# 3. Verify key tables
mysql -u root -p bsc_textiles_verify -e "
  SELECT 'users' AS t, COUNT(*) FROM users
  UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
  UNION ALL SELECT 'products', COUNT(*) FROM products;
"

# 4. Cleanup
mysql -u root -p -e "DROP DATABASE bsc_textiles_verify;"
```

### Manual Verification Commands
```bash
# List backups
ls -lh /opt/bsc-exclusive-poms/backups/

# Check backup contents
gunzip -c backups/poms-full-20261125-020000.sql.gz | head -50

# Verify table counts in backup
gunzip -c backups/poms-full-20261125-020000.sql.gz | grep -c "INSERT INTO"
```

---

## Recovery Procedures

### Scenario 1: Full Database Restore (Disaster Recovery)

**When:** Complete data loss, corruption, or new environment setup

**Prerequisites:**
- Latest full backup file (`poms-full-YYYYMMDD-HHMMSS.sql.gz`)
- MySQL server running
- Root or admin MySQL access

**Procedure:**
```bash
# 1. STOP APPLICATION
systemctl stop poms-backend

# 2. Create fresh database
mysql -u root -p -e "
  DROP DATABASE IF EXISTS bsc_textiles;
  CREATE DATABASE bsc_textiles
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;
"

# 3. Restore from backup
gunzip -c /opt/bsc-exclusive-poms/backups/poms-full-20261125-020000.sql.gz \
  | mysql -u root -p bsc_textiles

# 4. Recreate application user (if not in backup)
mysql -u root -p -e "
  CREATE USER IF NOT EXISTS 'poms_app'@'%' IDENTIFIED BY 'NEW_STRONG_PASSWORD';
  GRANT ALL PRIVILEGES ON bsc_textiles.* TO 'poms_app'@'%';
  FLUSH PRIVILEGES;
"

# 5. Run migrations (idempotent, applies only missing)
cd /opt/bsc-exclusive-poms/backend
npm run db:migrate

# 6. Verify data integrity
npm run db:check

# 7. START APPLICATION
systemctl start poms-backend

# 8. Verify application health
curl -f http://localhost:4040/api/health
```

**Expected Downtime:** 5-15 minutes (depends on database size)

---

### Scenario 2: Point-in-Time Recovery (PITR)

**When:** Accidental data deletion/modification, need to recover to specific moment

**Prerequisites:**
- Full backup from before the incident
- Binary logs covering the period since backup
- Known timestamp of incident

**Procedure:**
```bash
# 1. STOP APPLICATION
systemctl stop poms-backend

# 2. Restore base backup (Scenario 1, steps 2-3)
mysql -u root -p -e "DROP DATABASE IF EXISTS bsc_textiles; CREATE DATABASE bsc_textiles CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gunzip -c backups/poms-full-20261124-020000.sql.gz | mysql -u root -p bsc_textiles

# 3. Find binary log position at incident time
# Example: Incident at 2026-11-25 10:30:00
mysqlbinlog \
  --start-datetime="2026-11-24 02:00:00" \
  --stop-datetime="2026-11-25 10:30:00" \
  /var/log/mysql/mysql-bin.000001 \
  > /tmp/recovery.sql

# 4. Apply binary logs up to incident (EXCLUDE the problematic transaction)
# Review /tmp/recovery.sql first to identify the exact position
mysqlbinlog \
  --start-datetime="2026-11-24 02:00:00" \
  --stop-datetime="2026-11-25 10:29:59" \
  /var/log/mysql/mysql-bin.000001 \
  | mysql -u root -p bsc_textiles

# 5. Run migrations
cd /opt/bsc-exclusive-poms/backend
npm run db:migrate

# 6. Verify
npm run db:check

# 7. START APPLICATION
systemctl start poms-backend
```

**Alternative: Use Position-based Recovery**
```bash
# If you know the exact binlog position of the bad transaction:
mysqlbinlog \
  --start-position=12345 \
  --stop-position=12344 \
  /var/log/mysql/mysql-bin.000001 \
  | mysql -u root -p bsc_textiles
```

---

### Scenario 3: Single Table Recovery

**When:** Specific table corrupted or accidentally truncated

**Procedure:**
```bash
# 1. Extract single table from backup
gunzip -c backups/poms-full-20261125-020000.sql.gz \
  | sed -n '/^CREATE TABLE `purchase_orders`/,/^UNLOCK TABLES;/p' \
  > /tmp/purchase_orders_restore.sql

# 2. Create temporary table
mysql -u root -p bsc_textiles -e "
  CREATE TABLE purchase_orders_recovered LIKE purchase_orders;
"

# 3. Load data into temp table
mysql -u root -p bsc_textiles < /tmp/purchase_orders_restore.sql

# 4. Verify row count
mysql -u root -p bsc_textiles -e "
  SELECT COUNT(*) FROM purchase_orders_recovered;
"

# 5. Swap tables (atomic)
mysql -u root -p bsc_textiles -e "
  RENAME TABLE purchase_orders TO purchase_orders_corrupted,
               purchase_orders_recovered TO purchase_orders;
"

# 6. Verify
mysql -u root -p bsc_textiles -e "SELECT COUNT(*) FROM purchase_orders;"
```

---

### Scenario 4: Schema-Only Recovery (Migration Rollback)

**When:** Migration applied incorrectly, need to revert schema

**Procedure:**
```bash
# 1. Get schema-only backup from before migration
gunzip -c backups/poms-schema-20261125-010000.sql.gz > /tmp/schema_restore.sql

# 2. STOP APPLICATION
systemctl stop poms-backend

# 3. Restore schema (data preserved in separate step if needed)
# WARNING: This drops all tables - ensure you have data backup!
mysql -u root -p bsc_textiles < /tmp/schema_restore.sql

# 4. Restore data if needed (from full backup)
gunzip -c backups/poms-full-20261125-020000.sql.gz \
  | sed -n '/^INSERT INTO/,/^UNLOCK TABLES;/p' \
  | mysql -u root -p bsc_textiles

# 5. Run migrations to current version
npm run db:migrate

# 6. START APPLICATION
systemctl start poms-backend
```

---

## Backup File Management

### Naming Convention
```
poms-full-YYYYMMDD-HHMMSS.sql.gz      # Daily full backup
poms-schema-YYYYMMDD-HHMMSS.sql.gz    # Schema-only (pre-deploy)
poms-inc-YYYYMMDD-HHMMSS.sql.gz       # Incremental (if implemented)
```

### Retention Policy
| Backup Type | Retention | Cleanup |
|-------------|-----------|---------|
| Full Daily | 30 days | Auto (cron) |
| Schema | 90 days | Manual |
| Binary Logs | 7 days | MySQL auto |

### Storage Monitoring
```bash
# Check backup disk usage
df -h /opt/bsc-exclusive-poms/backups/

# Alert if > 80% full
# Add to monitoring
```

---

## Recovery Testing Schedule

| Test | Frequency | Procedure |
|------|-----------|-----------|
| Full Restore Test | Monthly | Restore to staging, verify app works |
| PITR Test | Quarterly | Recover to known timestamp |
| Single Table Test | Monthly | Recover `purchase_orders` table |
| Schema Rollback Test | Quarterly | Revert migration on staging |

### Test Documentation Template
```markdown
## Recovery Test Report - YYYY-MM-DD

**Test Type:** Full Restore / PITR / Single Table
**Environment:** Staging / Production
**Backup Used:** poms-full-20261125-020000.sql.gz
**Start Time:** HH:MM
**End Time:** HH:MM
**Duration:** X minutes
**Data Verified:** 
- [ ] Users table (X rows)
- [ ] Purchase Orders (X rows)
- [ ] Products (X rows)
- [ ] Foreign key integrity
**Application Tested:** 
- [ ] Login
- [ ] PO List
- [ ] PO Create
- [ ] Approval Flow
**Result:** PASS / FAIL
**Issues:** None / [Description]
**Tester:** [Name]
```

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Primary DBA | — | — | — |
| Secondary DBA | — | — | — |
| DevOps Lead | — | — | — |
| Application Owner | — | — | — |

---

## Appendix: Key MySQL Commands Reference

### Backup Commands
```bash
# Full backup with GTID (for replication)
mysqldump --single-transaction --routines --triggers --events --master-data=2 --flush-logs -u user -p db | gzip > backup.sql.gz

# Schema only
mysqldump --no-data --routines --triggers --events -u user -p db | gzip > schema.sql.gz

# Specific tables
mysqldump --single-transaction -u user -p db table1 table2 | gzip > tables.sql.gz
```

### Recovery Commands
```bash
# Full restore
gunzip -c backup.sql.gz | mysql -u user -p db

# With progress (pv)
gunzip -c backup.sql.gz | pv | mysql -u user -p db

# Point-in-time
mysqlbinlog --start-datetime="..." --stop-datetime="..." binlog.file | mysql -u user -p db
```

### Verification Commands
```bash
# Check backup integrity
gunzip -t backup.sql.gz && echo "OK"

# Count tables in backup
gunzip -c backup.sql.gz | grep -c "CREATE TABLE"

# Verify no errors in backup
gunzip -c backup.sql.gz | tail -20
```

### Binary Log Commands
```bash
# List binary logs
mysql -u root -p -e "SHOW BINARY LOGS;"

# Show binlog events
mysqlbinlog --base64-output=decode-rows -v /var/log/mysql/mysql-bin.000001 | head -100

# Find transaction by timestamp
mysqlbinlog --start-datetime="2026-11-25 10:00:00" --stop-datetime="2026-11-25 11:00:00" /var/log/mysql/mysql-bin.000001
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-25 | — | Initial release |

---

**Document Classification:** Internal - Operations  
**Review Cycle:** Quarterly  
**Next Review:** 2027-02-25