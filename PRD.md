# Product Requirements Document (PRD) — BSC Exclusive POMS

> **Project Name**: BSC Exclusive Purchase Order Management System (POMS v2.0)  
> **Client**: BSC Textiles Pvt Ltd  
> **Target Audience**: Store Managers, Purchase Executives, Approval Authorities, Warehouse Receiving Teams, Central Finance & Auditors.  
> **Status**: Production Deployed (`po.bsctextiles.in`)

---

## 1. Product Overview & Strategic Goals

BSC Textiles operates large retail outlets and manufacturing fulfillment centers across Karnataka (Belagavi, Davanagere, Shivamogga). The POMS platform standardizes the end-to-end procurement pipeline, eliminating paper-based slips and manual messaging through an audited, multi-tier procurement portal.

### Strategic Objectives
1. **Zero Discrepancy Receiving**: Align supplier purchase orders with physical delivery manifests (LR) and warehouse dock receipts.
2. **Speed & Control**: Enforce automated approval policies preventing unauthorized purchases while keeping approval latency under 4 business hours.
3. **Audit Compliance**: Meet Indian statutory compliance (GST invoicing, state transit e-way matching) with immutable audit records.

---

## 2. User Personas & Permissions Matrix

| Persona | Code | Responsibilities & Access Scope |
| :--- | :--- | :--- |
| **Super Admin** | `super_admin` | Unrestricted system-wide control; user role provisioning, system settings, global migrations. |
| **Admin** | `admin` | Organization management, division configuration, master data authoring. |
| **Purchase Manager** | `purchase_manager` | Vendor onboarding, catalogue pricing approval, L2 approval threshold (up to ₹2,00,000). |
| **Purchase Executive** | `purchase_executive` | Day-to-day PO creation, product browsing, vendor communication (restricted workspace). |
| **Approver** | `approver` | Executive decision-maker (L1/L2/L3 queues); review, reject, or approve POs. |
| **Receiving User** | `receiving_user` | Warehouse/store dock user; LR intake, barcode scanning, damage recording, GRN generation. |
| **Division Supervisor**| `division_supervisor`| Scoped supervisor role restricted to Men's Collection & store-level purchase orders. |
| **Auditor** | `auditor` | Read-only access to historical purchase orders, pricing revisions, and the audit trail. |

---

## 3. Detailed Functional Requirements Catalog

### Module 1: Authentication & Identity Management
- **REQ-AUTH-001**: User login with email, password, and anti-bot SVG CAPTCHA.
- **REQ-AUTH-002**: Stateless JWT issuance paired with stateful revocation tracking in `user_sessions`.
- **REQ-AUTH-003**: Mandatory profile completion for newly provisioned user accounts prior to first application use.
- **REQ-AUTH-004**: Multi-location scoping enabling users to view data specific to Belagavi (`BEL`), Davanagere (`DVG`), Shivamogga (`SHI`), or aggregate `All Locations`.

### Module 2: Purchase Order Lifecycle & Workflows
- **REQ-PO-001**: Draft PO creation with auto-generated sequential PO numbers (`PO-YYMM-XXXX`).
- **REQ-PO-002**: Multi-item line entry with live GST slab calculation (5%, 12%, 18%, 28%) and rounding.
- **REQ-PO-003**: Tiered approval routing based on monetary limits:
  - $\le \text{₹}50,000$: L1 Store Manager approval required.
  - $\text{₹}50,001$ to $\text{₹}2,00,000$: L2 Purchase Manager approval required.
  - $> \text{₹}2,00,000$: L3 Director / General Manager approval required.
- **REQ-PO-004**: Mandatory rejection / revision comments (`AP-012`) logged immutably.
- **REQ-PO-005**: Vector PDF and formatted Microsoft Excel (`.xlsx`) generation on demand.

### Module 3: Logistics & Lorry Receipt (LR) Tracking
- **REQ-LR-001**: Multipart document upload supporting PDF and image formats (JPEG, PNG).
- **REQ-LR-002**: Offline-first regex and pattern-matching OCR engine extracting carrier, LR number, and store destinations without external cloud costs.
- **REQ-LR-003**: Real-time integration and fallback scraper for VRL Logistics, TCI Express, and Rivigo.
- **REQ-LR-004**: Background recurring polling worker (every 20 minutes) updating shipment statuses automatically.

### Module 4: Dock Receiving & GRN Discrepancy Handling
- **REQ-REC-001**: Quick search and association between incoming physical LR and issued POs.
- **REQ-REC-002**: Line-item count verification with explicit Shortage, Overage, and Damaged stock recording.
- **REQ-REC-003**: Automatic Goods Receipt Note (GRN) generation and state transition of PO to `CLOSED` or `PARTIALLY_RECEIVED`.

### Module 5: Master Data & Catalog Engine
- **REQ-MST-001**: Hierarchical catalog: Division $\rightarrow$ Department $\rightarrow$ Category $\rightarrow$ Product Type $\rightarrow$ Product $\rightarrow$ Product Variant.
- **REQ-MST-002**: Dynamic Department Discovery: custom categories and departments created in Master Data automatically surface in Sidebar navigation.
- **REQ-MST-003**: Strict composite unique constraints on category names and product codes to prevent duplicates.

### Module 6: Enterprise Analytics & Reporting
- **REQ-REP-001**: Real-time dashboard KPI widgets (Total POs, Received, In-Transit, Pending Approvals).
- **REQ-REP-002**: Standard date-range bar presets: `All Time`, `Today`, `Yesterday`, `This Week`, `This Month`, and `Custom Range`.
- **REQ-REP-003**: Brand-wise volume, spend, and fulfillment timeliness reporting with one-click Excel export.

---

## 4. Non-Functional Requirements (NFR)

1. **Performance**: Page initial load under 1.5 seconds; API search endpoints under 150ms.
2. **Availability**: Target 99.95% uptime on Hostinger LiteSpeed Linux cloud; internal keep-alive loop (240s) eliminating idle process shutdowns.
3. **Security**: OWASP Top 10 compliance, bcrypt password hashing, zero credential leaks in version control, defense-in-depth SQL parameter binding.
4. **Compatibility**: Full mobile and desktop responsiveness (down to 320px mobile screens with sliding navigation drawer).
5. **Database Engine**: Optimized for MariaDB 11.8+ with `utf8mb4_unicode_ci` collation and transaction-safe storage engines.

---

## 5. Requirement-to-Code Traceability Matrix

| Requirement ID | Backend Handler | Frontend Component | Database Table |
| :--- | :--- | :--- | :--- |
| **REQ-AUTH-001** | `backend/src/routes/auth.js` | `frontend/src/pages/Login.jsx` | `users`, `user_sessions` |
| **REQ-PO-001** | `backend/src/routes/purchaseOrders.js` | `frontend/src/pages/POCreate.jsx` | `purchase_orders` |
| **REQ-PO-003** | `backend/src/routes/approvals.js` | `frontend/src/pages/Approvals.jsx` | `po_approvals` |
| **REQ-LR-002** | `backend/src/routes/lrTracking.js` | `frontend/src/pages/LRTracking/LRUpload.jsx` | `lr_tracking` |
| **REQ-REC-002** | `backend/src/routes/receipts.js` | `frontend/src/pages/Receipts.jsx` | `goods_receipt_notes` |
| **REQ-REP-002** | `backend/src/routes/reports.js` | `frontend/src/components/DateRangeBar.jsx`| `purchase_orders` |
| **REQ-MST-002** | `backend/src/routes/departments.js` | `frontend/src/components/Sidebar.jsx` | `departments` |

## Import review workflow

- **REQ-IMP-001**: Authorized users can upload supported product files, map columns, review actual parsed rows and validation errors, and explicitly confirm or cancel an import.
- **REQ-IMP-002**: Mapping changes can be previewed before applying product changes. History and per-row outcomes remain available for review.
- **REQ-IMP-003**: Concurrent confirmation must not apply the same staged import twice. Live database transaction verification remains required before production sign-off.
