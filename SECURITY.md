# Security Architecture & Threat Model (SECURITY) — BSC Exclusive POMS

> **Classification**: Enterprise Confidential  
> **Standard Compliance**: OWASP Top 10 (2021), OWASP API Security Top 10 (2023), ASVS Level 2 Guidelines  
> **Security Posture**: Zero-Trust, Defense-in-Depth, Immutable Cryptographic Auditability

---

## 1. Threat Modeling (STRIDE Methodology)

| Threat Category | Potential Attack Vector | Mitigating System Controls |
| :--- | :--- | :--- |
| **Spoofing** | Credential stuffing, session hijacking, JWT forgery | Bcrypt (10 rounds), HS256 secret keys, session fingerprinting (`ip_address`, `user_agent`), SVG CAPTCHA on login. |
| **Tampering** | Intercepting and altering PO line item prices | Parameterized SQL queries, DB transactions, client-side prices ignored on backend; server recalculates totals from DB catalog. |
| **Repudiation** | User claiming they did not approve a PO | Immutable `audit_logs` storing SHA-256 payload checksums, timestamps, user ID, and IP address. |
| **Information Disclosure** | Unauthorized users reading another store's financial data | Strict RBAC middleware (`requirePermission`), division/location scoping (`RB-001`), filtered SQL result sets. |
| **Denial of Service** | Flooding API with automated requests or login attempts | Adaptive Token Bucket rate limiting (60 requests/min per IP on auth routes), internal keep-alive loop, memory-bounded caches. |
| **Elevation of Privilege** | Purchase Executive accessing User Management | Role guards rejecting non-Super-Admin users at both the API and client-routing layers (`RequireAuth`). |

---

## 2. OWASP Top 10 Defense Matrix

### 2.1 A01: Broken Access Control
- Every route handler in `backend/src/routes/` is protected by `requireAuth` and explicit `requirePermission('domain.action')`.
- Direct Object Reference (IDOR) attacks are mitigated by verifying that the requesting user's division/location matches the requested entity's location.

### 2.2 A02: Cryptographic Failures
- Passwords are never stored in plaintext or weak hashes (MD5/SHA1). Bcrypt with a work factor of 10 is enforced.
- JWT tokens are signed using a 256-bit cryptographically random secret string configured via `JWT_SECRET`.
- Sensitive `.env` files are excluded from Git version control via `.gitignore`.

### 2.3 A03: Injection (SQL & Command)
- Direct string concatenation in SQL queries is strictly prohibited across the codebase.
- The database wrapper (`backend/src/db.js`) uses `mysql2` prepared statements where all values are passed as bound parameters (`?`).

### 2.4 A04: Insecure Design
- Multi-tier approval workflows (`AP-01`) enforce separation of duties. A Purchase Executive cannot approve their own purchase order.
- Rejection or send-back actions mandate an explanatory comment (`AP-012`).

### 2.5 A05: Security Misconfiguration
- LiteSpeed and Express headers hide technology signatures (`app.disable('x-powered-by')`).
- Secure HTTP response headers applied: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`.

### 2.6 A07: Identification and Authentication Failures
- Native anti-bot CAPTCHA generator (`backend/src/routes/auth.js`) blocks automated brute-force attacks.
- Expired or consumed CAPTCHA challenges are immediately purged from in-memory stores.

---

## 3. Session & Credential Security Guidelines

1. **Token Lifespan**: JWT tokens expire after 12 hours (`12h`). Refresh requires re-authentication.
2. **Session Invalidation**: When a user logs out (`POST /api/auth/logout`), the token hash is revoked in `user_sessions`, instantly rejecting subsequent requests even if the token has not expired.
3. **Password Rules**: Minimum 8 characters with at least one uppercase letter, one digit, and one special character.
