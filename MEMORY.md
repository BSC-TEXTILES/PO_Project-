# Persistent Architectural Memory & Knowledge Base (MEMORY) — BSC Exclusive POMS

> **Purpose**: Serves as the authoritative source of truth for all historical decisions, critical bug resolutions, architectural constraints, and synchronization requirements across development iterations.

---

## 1. Resolved Critical Bugs & Architectural Decisions

### 1.1 MariaDB 11.8 Generated Column Limitation (Error 1901)
- **Problem**: Migration `001_schema.sql` failed with:
  `Function or expression 'ifnull(parent_category_id,'')' cannot be used in the GENERATED ALWAYS AS clause of parent_category_id_uk`.
- **Root Cause**: MariaDB 11.8 explicitly forbids functions (`IFNULL`, `COALESCE`, `ROUND`) inside virtual generated column expressions.
- **Resolution**: Dropped artificial `_uk` columns from `categories`, `departments`, `number_sequences`, and `product_variants`. Replaced with standard composite unique constraints in migration `008_remove_uk_columns.sql`.

### 1.2 LiteSpeed Idle SIGTERM Shutdown (300s Exit)
- **Problem**: Hostinger LiteSpeed `lsnode` process killed the Node.js backend every 5 minutes if no external requests arrived (`lsnode: no request in 300 seconds, exit`).
- **Resolution**: Added an automated 240s HTTP keep-alive ping loop in `backend/src/server.js` targeting `/api/health`.

### 1.3 Invisible Sidebar Navigation Text & Contrast
- **Problem**: In light mode, the sidebar was white (`#ffffff`) while `.nav-link` or `.sidebar .brand-name` retained white or low-opacity color rules (`color: #fff`, `rgba(255, 255, 255, 0.88)`), rendering text invisible.
- **Resolution**: Updated `frontend/src/styles.css` and `frontend/src/workspace.css` to enforce high-contrast slate (`#0f172a` and `#334155`) on light surfaces and crisp white/ice blue on navy surfaces.

### 1.4 MariaDB Reserved Keyword in SQL Query (`delayed`)
- **Problem**: `ER_PARSE_ERROR` on `/api/lr/dashboard` near `'delayed'`.
- **Root Cause**: `DELAYED` is a reserved SQL keyword in MariaDB/MySQL.
- **Resolution**: Renamed query alias `AS delayed` to `AS delayed_count` in `backend/src/routes/lrTracking.js`.

---

## 2. Core Architectural Invariants (DO NOT VIOLATE)

1. **Collation Uniformity**: Every new or altered table must strictly use `COLLATE utf8mb4_unicode_ci` and `ENGINE=InnoDB`.
2. **Zero-Secret Commits**: Never stage `.env` or credential files to Git.
3. **No Destructive Drops**: Never drop production database tables without prior export and backward-compatible migration files.
4. **Parameter Binding**: Never concatenate raw variables into SQL queries; always use `?` placeholders with `db.query()`.
