# REST API Reference (API) — BSC Exclusive POMS

> **Base URL**: `https://po.bsctextiles.in/api`  
> **Auth Scheme**: HTTP Bearer Token (`Authorization: Bearer <JWT>`)  
> **Standard Response Envelope**: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`

---

## 1. Authentication & Security Endpoints

### 1.1 GET `/api/auth/captcha`
- **Auth**: Public
- **Description**: Generates an unambiguous 5-character SVG anti-bot challenge.
- **Response `200 OK`**:
  ```json
  { "ok": true, "data": { "id": "uuid-string", "svg": "<svg xmlns=...>...</svg>" } }
  ```

### 1.2 POST `/api/auth/login`
- **Auth**: Public (Rate-limited: 60/min)
- **Payload**:
  ```json
  { "email": "user@bsctextiles.in", "password": "Password123!", "captcha_id": "...", "captcha_solution": "..." }
  ```
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 1,
      "email": "user@bsctextiles.in",
      "fullName": "Rajeshwar V. Rao",
      "roles": ["super_admin"],
      "permissions": ["dashboard.view", "po.view", "po.create", "..."]
    }
  }
  ```

### 1.3 GET `/api/auth/me`
- **Auth**: Bearer Token
- **Description**: Returns currently authenticated user context and active permissions.

### 1.4 POST `/api/auth/logout`
- **Auth**: Bearer Token
- **Description**: Revokes active session token in `user_sessions`.

---

## 2. Purchase Orders Endpoints

### 2.1 GET `/api/purchase-orders`
- **Auth**: Bearer Token (`po.view`)
- **Query Params**:
  - `status`: Filter by status (`draft`, `submitted`, `approved`, `issued`, `in_transit`, `closed`).
  - `location`: Filter by store branch (`BEL`, `DVG`, `SHI`).
  - `start_date`, `end_date`: Filter by creation timestamp.
  - `limit`, `offset`: Pagination controls.
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "data": [
      {
        "id": 101,
        "po_number": "PO-2611-0001",
        "supplier_name": "Raymond Fabrics Ltd",
        "division_name": "Men's Collection",
        "location_code": "BEL",
        "status": "approved",
        "grand_total": 145000.00,
        "created_at": "2026-11-26T10:30:00Z"
      }
    ],
    "pagination": { "total": 1, "limit": 20, "offset": 0 }
  }
  ```

### 2.2 POST `/api/purchase-orders`
- **Auth**: Bearer Token (`po.create`)
- **Payload**:
  ```json
  {
    "supplier_id": 12,
    "location_id": 2,
    "delivery_date": "2026-12-10",
    "notes": "Urgent festive season order",
    "items": [
      { "product_id": 45, "quantity": 100, "unit_price": 450.00, "tax_rate": 5.0 }
    ]
  }
  ```

### 2.3 GET `/api/purchase-orders/:id`
- **Auth**: Bearer Token (`po.view`)
- **Description**: Retrieves complete PO details including line items, supplier terms, and approval history.

### 2.4 POST `/api/purchase-orders/:id/approval-action`
- **Auth**: Bearer Token (`approvals.view`)
- **Payload**:
  ```json
  { "action": "approved", "comments": "Price within authorized budget" }
  ```
- **Allowed Actions**: `approved`, `rejected`, `send_back`, `hold`. (Comments mandatory for `rejected` and `send_back`).

---

## 3. Lorry Receipt (LR) & Logistics Endpoints

### 3.1 POST `/api/lr/upload`
- **Auth**: Bearer Token (`lr.upload` or authenticated user)
- **Form Data**:
  - `file`: Image/PDF document
  - `po_id`: Associated Purchase Order ID (optional)
  - `location_code`: Receiving hub (`BEL`, `DVG`, `SHI`)
- **Response `201 Created`**:
  ```json
  {
    "ok": true,
    "data": {
      "lr_id": 88,
      "lr_number": "1098234712",
      "transporter": "VRL Logistics",
      "extracted_data": { "origin": "SURAT", "destination": "BELAGAVI", "boxes": 12 }
    }
  }
  ```

### 3.2 GET `/api/lr/track/:id`
- **Auth**: Bearer Token
- **Description**: Returns live movement timeline and estimated arrival.

### 3.3 GET `/api/lr/dashboard`
- **Auth**: Bearer Token
- **Description**: Returns summary shipment metrics across stores (`in_transit`, `delayed_count`, `delivered`).

---

## 4. Reports & Analytics Endpoints

### 4.1 GET `/api/reports/dashboard`
- **Auth**: Bearer Token (`reports.view`)
- **Query Params**: `range` (`today`, `yesterday`, `week`, `month`, `custom`), `start`, `end`, `location`.
- **Response**: Summary metrics and branch performance totals.

### 4.2 GET `/api/reports/export`
- **Auth**: Bearer Token (`reports.export`)
- **Query Params**: `format` (`xlsx`, `pdf`, `csv`), `type` (`po_summary`, `brand_wise`, `lr_shipments`).
- **Response**: Binary file stream with appropriate `Content-Disposition`.

## Import mapping preview

### POST `/api/import/:id/preview`

- Authentication: Bearer token; requires `masters.manage` or `import.manage`.
- Body: `{ "mapping": { ... } }`, using the column-to-field mapping from the import review workflow.
- Requires an existing import in `awaiting_confirmation` status. Re-parses the staged file and returns `{ data: { importId, preview } }` with mapped records and validation results; does not apply product changes.
- Returns 400 for a missing/invalid mapping or non-reviewable status, and 404 for an unknown import session.
- Apply changes separately through `POST /api/import/:id/confirm`; confirmation revalidates records and locks the history row transactionally to prevent concurrent duplicate application.
