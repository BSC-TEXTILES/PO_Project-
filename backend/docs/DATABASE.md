# POMS Database: MySQL

POMS uses **MySQL 8.0.19 or newer** as its only database. There is no fallback
engine: if MySQL is unreachable, the API starts, reports the reason, and every
`/api` route returns `503` until MySQL is back.

| What | Where |
|---|---|
| Connection pool, query helpers, transactions | `backend/src/config/db.js` |
| Connection settings (env only) | `backend/src/config/dbConfig.js`, `backend/.env` |
| Schema (version-controlled migrations) | `database/mysql/NNN_*.sql` |
| Migration runner | `backend/scripts/db-migrate.mjs` (`npm run db:migrate`) |
| Diagnostics | `npm run db:check` |
| Integrity checks | `npm run db:integrity` |
| Backup | `npm run db:backup` |

## 1. How the Application Talks to MySQL

* **One pool** (`mysql2`) for the whole process. `DB_CONNECTION_LIMIT` sets its size
  (default 10). Keep-alive is on. Dead connections are dropped and replaced by the
  pool. A read (`SELECT`) that hits a dropped connection is retried once. Writes are
  never retried automatically.
* **Parameterized SQL only.** Every value goes through mysql2's escaping, including
  values bound to `$1`/`?` placeholders, arrays for `IN (…)`, and integers for
  `LIMIT`/`OFFSET` (validated). Table and column names are never taken from
  requests. Dynamic `ORDER BY` uses whitelists.
* **Transactions** use `withTransaction(async (tx) => …)`. Any error rolls back the
  whole unit. Flows that must not race take row locks (`SELECT … FOR UPDATE`):
  receipts are serialized per PO (over-receipt guard), and receipt posting is
  locked and re-checked so a double click cannot post inventory twice.
* **Document numbers** (PO, receipt, product serial) come from `nextNumber()`. It
  uses a single atomic `INSERT … ON DUPLICATE KEY UPDATE` on `number_sequences`,
  so it is safe under any concurrency (tested with 20 simultaneous PO creations).
* **Time.** All timestamps are stored as UTC in `DATETIME(6)`. Every connection runs
  with `time_zone = '+00:00'`. Calendar dates (`po_date` and others) are the business
  date in `APP_UTC_OFFSET` (default `+05:30`, IST), so a PO created at 00:30 IST gets
  that day's date, not the previous UTC day. `DATE` columns reach the frontend as
  `YYYY-MM-DD`. Timestamps reach it as ISO-8601 UTC, which the browser shows in local
  time.
* **Collation** `utf8mb4_0900_ai_ci`: text comparison and unique keys are
  case-insensitive, matching the previous `ILIKE`/`lower()` behaviour.
* **Errors.** Duplicate key → `409`, foreign-key conflict → `409`/`400`, constraint
  or data error → `400`, MySQL unavailable or deadlock → `503`. Raw SQL and driver
  messages are never sent to the client.

## 2. Schema

`database/mysql/` holds the full schema as ordered, additive migrations:

| File | Contents |
|---|---|
| `001_schema.sql` | All 62 tables: primary keys, 97 foreign keys, unique keys, indexes, CHECK constraints, generated columns (`profit_amount`, `profit_margin`, `accepted_qty`) |
| `002_audit_log_immutability.sql` | Triggers that block `UPDATE`/`DELETE` on `audit_logs` (optional, needs the TRIGGER privilege; see section 3) |
| `003_password_reset_columns.sql` | `users.reset_otp`, `users.reset_otp_expires_at`, used by forgot-password but missing before |
| `004_import_history.sql` | `import_history`, `import_records`, `products.created_by/updated_by`, used by product import but missing before |
| `005_brand_qr_code.sql` | `brands.qr_code`, written by brand creation but missing before |

The runner records every applied file in `schema_migrations` with a SHA-256 checksum.
An applied file that has since been edited is refused, so add a new file instead.
Re-running is always safe: tables use `IF NOT EXISTS`, and existing foreign keys and
columns are detected and skipped. **No migration drops, truncates, or rewrites data.**

## 3. First-time Setup (Database and Accounts)

As a MySQL administrator (replace the passwords):

```sql
CREATE DATABASE bsc_textiles CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- runs migrations and the data move (schema changes allowed)
CREATE USER 'poms_migrator'@'%' IDENTIFIED BY '<long random password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP,
      TRIGGER, CREATE VIEW, SHOW VIEW, LOCK TABLES ON bsc_textiles.* TO 'poms_migrator'@'%';

-- the application itself: data access only, no schema changes
CREATE USER 'poms_app'@'%' IDENTIFIED BY '<another long random password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON bsc_textiles.* TO 'poms_app'@'%';

-- binary logging is on by default in MySQL 8; without this, non-SUPER accounts
-- cannot create triggers (migration 002 is then skipped with a warning)
SET GLOBAL log_bin_trust_function_creators = 1;
```

Limit `'%'` to the application server's host or IP where possible. The application
account cannot alter tables, and with migration 002 applied, nobody can edit or delete
audit history through it.

`backend/.env` (never committed; see `backend/.env.example`):

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=poms_app
DB_PASSWORD=<app password>
DB_NAME=bsc_textiles
DB_CONNECTION_LIMIT=10
APP_UTC_OFFSET=+05:30
```

Then:

```bash
cd backend
npm install
DB_USER=poms_migrator DB_PASSWORD=<migrator password> npm run db:migrate
npm run db:check
npm start
```

`run.bat` does this locally: it starts the MySQL80 service if needed, applies pending
migrations, and seeds demo data only if the `users` table is empty.

## 4. Backup and Restore

**Backup** (online, consistent, no table locks):

```bash
cd backend
npm run db:backup                        # → backups/poms_mysql_<UTC>.sql + .sha256
npm run db:backup -- --out D:/poms-backups
```

It uses `mysqldump --single-transaction --routines --triggers`. The password is passed
through the environment, never on the command line. Schedule it daily (Windows Task
Scheduler or cron) and copy the files off the server. `backups/` is git-ignored because
it contains personal data and password hashes.

**Restore** (into an empty database or a new one):

```bash
sha256sum -c backups/poms_mysql_<UTC>.sql.sha256                 # verify the file first
mysql -u root -p < backups/poms_mysql_<UTC>.sql                  # recreates `bsc_textiles`
# into a different database name instead:
sed 's/`bsc_textiles`/`bsc_restore`/g' backups/poms_mysql_<UTC>.sql | mysql -u root -p
cd backend && npm run db:integrity
```

This was tested on 2026-11-24: migrate → full e2e run → backup → restore into a new
database. `CHECKSUM TABLE` matched on all 62 tables.

## 5. Production Deployment

* MySQL 8.0.19+ (self-hosted or managed). Set `DB_SSL=true` for managed or remote
  servers.
* App account `poms_app` with data privileges only. Run migrations with
  `poms_migrator` as a deploy step (`render.yaml` runs `npm run db:migrate` before
  each deploy, so its environment needs the migrator credentials, or run the step
  manually).
* `DB_CONNECTION_LIMIT` × number of API instances must stay below MySQL
  `max_connections`.
* Health check: `GET /api/health` returns `{"database":"mysql","dbStatus":"connected (mysql)"}`.
* Daily `npm run db:backup`, plus `npm run db:integrity` after upgrades.

## 6. Verification on MySQL (2026-11-24, MySQL 8.0.46)

All suites ran against MySQL with the least-privilege `poms_app` account, on the data
migrated from PostgreSQL:

| Suite | Result |
|---|---|
| `npm test` (db layer and unit tests) | 9 / 9 |
| `scripts/e2e.mjs`: PO lifecycle, pricing, approvals, receipts, inventory, scoping | 54 / 54 |
| `tests/crud.e2e.mjs`: create/update/delete for every master, users, roles, settings, files, videos, import, rollback, 20 concurrent POs, idempotency, audit immutability | 70 / 70 |
| `tests/api-sweep.mjs`: all 66 GET routes × admin / scoped buyer / auditor | 0 server errors |
| `tests/security.blackbox.mjs`: injection, brute force, RBAC, scope isolation | 14 / 14 |
| `npm run db:integrity` | pass |
| Fresh install (`setup-db` + seed on an empty database) followed by `e2e.mjs` | 54 / 54 |

---

**POMS is MySQL-only.** No PostgreSQL, MongoDB, SQLite, Firebase, Supabase, or other
database engines are used or supported.