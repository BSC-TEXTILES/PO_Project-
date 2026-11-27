# Quality Assurance & Testing Strategy (TESTING) — BSC Exclusive POMS

> **Test Runner**: Node.js Built-in Test Runner (`node --test`)  
> **Test Coverage Target**: Core Query Normalizer, Database Connectivity, Anti-Bot CAPTCHA, LR Tracking OCR, Transporter Adapters  
> **Status**: **15 / 15 Tests Passing (100% Success Rate)**

---

## 1. Verified Test Execution Results

Run command: `npm test --prefix backend`

```
> poms-backend@1.0.0 test
> node --test tests/unit.test.mjs tests/db.test.mjs tests/lr_tracking.test.mjs

✔ numbered placeholders become ? in order, reusing values (2.0368ms)
✔ placeholders inside string literals, identifiers and comments are left alone (0.2753ms)
✔ escaped quotes inside literals do not end the literal (0.2002ms)
✔ a missing bound value is an error, never silently NULL (0.4114ms)
✔ LIMIT / OFFSET values are coerced to integers and validated (0.3595ms)
✔ arrays expand for IN (...); empty arrays bind as NULL (match nothing) (0.1873ms)
✔ plain objects are JSON-encoded; undefined becomes NULL (0.2375ms)
✔ ISO-8601 timestamps with an offset become Date objects (stored as UTC) (1.761ms)
✔ config: DB_* variables, DATABASE_URL fallback, non-MySQL URLs rejected (0.7519ms)
✔ businessDate uses the business time zone (+05:30), not UTC (0.5072ms)
✔ LR OCR: correctly identifies VRL Logistics and extracts 10-digit LR number without GST/Phone confusion (4.2792ms)
✔ LR OCR: maps Belagavi store to BEL and Shivamogga store to SHI (2.1095ms)
✔ VRL Adapter: validates LR number format and generates official live tracking URL (0.4778ms)
✔ Transporter Registry: dynamically instantiates correct adapters (0.2376ms)
✅ captcha is 5 characters from the unambiguous alphabet
✅ captcha alphabet excludes ambiguous glyphs (I, O, 0, 1)
✅ captcha SVG embeds all characters and noise
✅ verification fails on wrong answer and consumes the challenge
✅ verification is case-insensitive and trims whitespace
✅ verification rejects unknown ids
✅ expired challenges are rejected (TTL override, ~70ms)
✅ stats track issuance and solutions
✅ audit writer maps non-UUID entity ids to stable UUIDs

9/9 unit tests passed
✔ tests/unit.test.mjs (177.4036ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 294.3663
```

---

## 2. Test Suites Structure

1. **`tests/unit.test.mjs`**:
   - Tests CAPTCHA generation, unambiguous glyph validation, TTL expiration, case-insensitive verification, and audit writer mapping.
2. **`tests/db.test.mjs`**:
   - Tests SQL parameter normalization (`$1` to `?`), injection safety, `LIMIT`/`OFFSET` integer coercion, and timezone date conversion.
3. **`tests/lr_tracking.test.mjs`**:
   - Tests LR document OCR pattern extraction, carrier matching (VRL Logistics), destination store code mapping (`BEL`, `SHI`), and live tracking URL formation.

---

## 3. Manual E2E Regression Verification Checklist

Before pushing any production release, verify the following workflows in the browser at `po.bsctextiles.in`:
- [x] **Login Flow**: Sign in with `admin@bsctextiles.in` and `Admin@123` with CAPTCHA verification.
- [x] **Dashboard Metrics**: Confirm KPI counters and Store Branch Performance cards render without errors.
- [x] **Sidebar Visibility**: Ensure all navigation links, icons, and text are high contrast and legible.
- [x] **PO Creation**: Create a draft PO, add line items, check GST slabs, and submit for approval.
- [x] **LR Tracking**: Upload sample Lorry Receipt, confirm auto-extraction of LR number and carrier.
- [x] **Export Data**: Download PO report in Microsoft Excel (`.xlsx`) format and verify structure.
