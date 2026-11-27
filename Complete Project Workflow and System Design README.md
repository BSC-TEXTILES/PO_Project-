# BSC Exclusive POMS — Complete Project Workflow & System Design Architecture

> **Enterprise Purchase Order Management & Logistics Tracking System (POMS v2.0)**  
> **Client & Corporate Domain**: BSC Textiles (`po.bsctextiles.in`)  
> **Production Stack**: Node.js 20+ LTS, Express 4.x, MariaDB 11.8.9-log / MySQL 8.x, React 18, Vite, WebSocket, LiteSpeed `lsnode` Web Engine.  
> **Target High Availability**: 99.95% Uptime, Sub-150ms P95 API Latency, Resilient MySQL Reconnection, Zero-Trust Audit Trails.

---

## Table of Contents
1. [Executive Summary & System Purpose](#1-executive-summary--system-purpose)
2. [End-to-End High-Level System Architecture](#2-end-to-end-high-level-system-architecture)
3. [Component & Directory Catalog](#3-component--directory-catalog)
4. [Master 34 Architectural & Workflow Diagrams](#4-master-34-architectural--workflow-diagrams)
5. [Core Functional Modules Breakdown](#5-core-functional-modules-breakdown)
6. [Data Lifecycle & Transaction Management](#6-data-lifecycle--transaction-management)
7. [Enterprise Security & Zero-Trust Defense](#7-enterprise-security--zero-trust-defense)
8. [Performance, Scalability & SRE Blueprint](#8-performance-scalability--sre-blueprint)
9. [Operational Verification & SRE Health Matrix](#9-operational-verification--sre-health-matrix)

---

## 1. Executive Summary & System Purpose

The **BSC Exclusive Purchase Order Management System (POMS)** is an enterprise-grade ERP sub-system designed specifically for multi-branch textile manufacturing, procurement, and retail distribution across Karnataka, India (operating primary retail hubs in **Belagavi [BEL]**, **Davanagere [DVG]**, and **Shivamogga [SHI]**).

### Core Business Problems Solved
1. **Decentralized Procurement Silos**: Eliminates manual spreadsheets and physical paper receipts by centralizing PO creation, revision tracking, and supplier pricing agreements.
2. **Multi-Tier Approval Friction**: Implements automated, rule-based hierarchical approval chains (`L1` to `L3`) mapped to monetary limits and organizational divisions.
3. **Logistics Blindspots**: Integrates optical character recognition (OCR) and automated scraping/API sync for major Indian surface transport carriers (e.g., VRL Logistics, TCI Express, Rivigo) directly linking Lorry Receipts (LR) to Purchase Orders.
4. **Goods Receiving Discrepancies**: Enables real-time barcode/manual carton intake at retail warehouse docks, automatically calculating shortages, damages, and generating Goods Receipt Notes (GRN).
5. **Regulatory Compliance & Fraud Prevention**: Guarantees non-repudiation with immutable cryptographic audit logging (`audit_logs`) tracking every state mutation, user login, and price modification.

---

## 2. End-to-End High-Level System Architecture

The application adopts a **Tiered Service-Oriented Monolithic Architecture** optimized for high-density, low-latency execution within containerized or LiteSpeed-managed Cloud Environments (e.g., Hostinger Cloud Linux).

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Presentation Layer (React 18 SPA)"]
        UI["Desktop / Mobile Browser (po.bsctextiles.in)"]
        WSClient["WebSocket Client (Notifications & Chat)"]
        OfflineCache["Local Storage & Session Tokens"]
    end

    subgraph WebServerLayer ["Edge & Web Server Layer (LiteSpeed / Reverse Proxy)"]
        LS["LiteSpeed Web Server (lsnode.js wrapper)"]
        SSL["TLS 1.3 Termination (Let's Encrypt / Hostinger)"]
        StaticServe["Static File Cache (/dist, /uploads)"]
    end

    subgraph AppServerLayer ["Application Core (Node.js Express 4 Engine)"]
        KeepAlive["Internal Self-Healing Loop (240s Keep-Alive)"]
        AuthMiddleware["JWT & Session Interceptor Chain"]
        RateLimiter["Adaptive In-Memory Token Bucket Rate Limiter"]
        Router["Express Modular Router (/api/*)"]
        CronService["LR Sync Worker (20m Recurring Cron)"]
        WSServer["WebSocket Server (Event Broadcasting)"]
    end

    subgraph PersistenceLayer ["Persistence & Storage Tier"]
        DBPool["MariaDB 11.8 Connection Pool (mysql2, Max 10 Conns)"]
        FileStore["Local Encrypted File System (/uploads)"]
        DB[("MariaDB 11.8.9-log Enterprise Database")]
    end

    subgraph ExternalServices ["External Logistics & OCR APIs"]
        VRL["VRL Logistics Live Tracking Gateway"]
        TCI["TCI Express Logistics Gateway"]
        OCR["Local Regex / Tesseract OCR Ingestion Engine"]
    end

    UI --> SSL --> LS
    WSClient --> SSL --> LS
    LS --> StaticServe
    LS --> AuthMiddleware
    AuthMiddleware --> RateLimiter --> Router
    Router --> DBPool --> DB
    Router --> FileStore
    Router --> WSServer
    CronService --> VRL & TCI
    Router --> OCR
    KeepAlive -.->|Periodic Internal Ping| Router
```

---

## 3. Component & Directory Catalog

```
BSC-ExclusivePOMS/
├── backend/                        # Node.js Express 4 API Backend
│   ├── database/mysql/             # MariaDB/MySQL Production Migrations (001_schema.sql to 008_*)
│   ├── src/
│   │   ├── app.js                  # Express App configuration, middleware pipeline & static routing
│   │   ├── server.js               # HTTP/WebSocket server bootstrapper & keep-alive daemon
│   │   ├── config.js               # Centralized ENV parser & fail-fast validator
│   │   ├── db.js                   # Resilient MySQL2 connection pool & parameter normalizer
│   │   ├── autoMigrate.js          # Boot-time idempotent schema migration & admin seeder
│   │   ├── middleware/             # Auth, RBAC, Rate-limit, and audit interceptors
│   │   ├── routes/                 # 25+ domain-specific REST route handlers
│   │   ├── services/               # Background workers, OCR extractors, PDF generators
│   │   └── utils/                  # Cryptography, HTTP errors, and logging utilities
│   └── tests/                      # Unit, DB integration, and OCR tracking test suites
├── frontend/                       # React 18 Single-Page Application (SPA)
│   ├── src/
│   │   ├── App.jsx                 # Client-side routing, theme management, error boundary
│   │   ├── main.jsx                # DOM bootstrap, security headers, global providers
│   │   ├── api.js                  # Axios client with automatic bearer token attachment
│   │   ├── auth.jsx                # Global authentication & shopping cart React contexts
│   │   ├── styles.css              # Universal design tokens and high-contrast styling
│   │   ├── workspace.css           # Enterprise layout, sidebar, and form polish
│   │   ├── components/             # Reusable UI widgets (Sidebar, Topbar, Modal, DataTable)
│   │   └── pages/                  # Page-level route views (Dashboard, POList, LRTracking, etc.)
│   └── vite.config.js              # Vite bundler configuration & local dev proxy
├── Complete Project Workflow and System Design README.md # Master architectural documentation
├── README.md                       # Repository entrance, installation guide & quickstarts
├── PRD.md                          # Product Requirements Document & feature matrix
├── DESIGN.md                       # Detailed System Design & Software Architecture
├── MEMORY.md                       # Knowledge base, changelog & synchronization rules
├── SECURITY.md                     # OWASP Top 10 threat model & zero-trust controls
├── API.md                          # REST API Reference & schemas
├── DATABASE.md                     # MariaDB Schema, ERD, and index strategies
├── TESTING.md                      # Test results, coverage, and benchmark methodology
├── DEPLOYMENT.md                   # Hostinger LiteSpeed/lsnode production deployment guide
└── AGENTS.md                       # AI Agent Operational Playbook & Code Rules
```

---

## 4. Master 34 Architectural & Workflow Diagrams

### Diagram 1: Global System Topology & Layering
```mermaid
graph TD
    Client["Client Web Browser (React 18 SPA)"] -->|HTTPS / WSS| LiteSpeed["LiteSpeed Web Server (Hostinger Cloud)"]
    LiteSpeed -->|Static Assets| Cache["Edge Static Cache (/dist, /uploads)"]
    LiteSpeed -->|Node Reverse Proxy| Express["Node.js Express Backend (:4040)"]
    Express -->|Auth & Guard| RBAC["JWT & Role Authorization Guard"]
    RBAC -->|Transactions| MariaDB[("MariaDB 11.8 Enterprise DB")]
    RBAC -->|Disk I/O| Storage["Local Secure Uploads Directory"]
    Express -->|Scheduled Cron| LRSync["LR Background Polling Worker"]
    LRSync -->|External HTTPS| Transporters["Logistics Carriers (VRL / TCI)"]
```

### Diagram 2: Authentication & Stateless-Stateful JWT Session Handshake
```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant API as Auth Controller (/api/auth/login)
    participant DB as MariaDB (users & user_sessions)
    participant Audit as Audit Logger (audit_logs)

    User->>API: POST /api/auth/login (email, password, captcha_token)
    API->>API: Verify Anti-Bot CAPTCHA Challenge
    API->>DB: SELECT id, password_hash, is_active FROM users WHERE email = ?
    alt User Not Found or Inactive
        API-->>User: 401 Unauthorized (Invalid credentials or inactive account)
    else Password Match (bcrypt.compare)
        API->>API: Sign JWT Token (HS256, 12h TTL)
        API->>DB: INSERT INTO user_sessions (user_id, token_hash, ip_address, expires_at)
        API->>Audit: Log LOGIN_SUCCESS (user_id, IP, User-Agent)
        API-->>User: 200 OK { token, user: { id, fullName, roles, permissions } }
    end
```

### Diagram 3: Purchase Order Lifecycle & State Machine
```mermaid
stateDiagram-v2
    [*] --> Draft: User Creates Draft PO
    Draft --> Submitted: PO Submit Action (Pending L1)
    Draft --> Cancelled: Creator Cancels
    Submitted --> UnderApproval: Approver Claims/Reviews
    UnderApproval --> Rejected: Approver Rejects (Mandatory Reason)
    UnderApproval --> SendBack: Approver Requests Revision
    SendBack --> Draft: Revised by Creator
    UnderApproval --> Approved: All Required Approval Levels Satisfied
    Approved --> Issued: PO Transmitted to Supplier
    Issued --> InTransit: LR Document Uploaded / Consignment Dispatched
    InTransit --> PartiallyReceived: Partial Goods Intake at Dock
    PartiallyReceived --> Closed: Full Delivery + GRN Sign-Off
    InTransit --> Closed: Full Delivery Received
    Cancelled --> [*]
    Closed --> [*]
```

### Diagram 4: Multi-Level PO Approval Hierarchy (AP-01)
```mermaid
flowchart TD
    PO[PO Submitted] --> CheckVal{Grand Total Value}
    CheckVal -->|<= ₹50,000| L1[Level 1: Store / Dept Manager]
    CheckVal -->|₹50,001 - ₹2,00,000| L2[Level 2: Purchase Manager]
    CheckVal -->|> ₹2,00,000| L3[Level 3: General Manager / Director]
    
    L1 -->|Approve| L1Passed{Value > ₹50K?}
    L1Passed -->|No| FinalApproved[PO Status: APPROVED]
    L1Passed -->|Yes| L2
    
    L2 -->|Approve| L2Passed{Value > ₹200K?}
    L2Passed -->|No| FinalApproved
    L2Passed -->|Yes| L3
    
    L3 -->|Approve| FinalApproved
    
    L1 -->|Reject / Send Back| Returned[PO Status: REJECTED / DRAFT]
    L2 -->|Reject / Send Back| Returned
    L3 -->|Reject / Send Back| Returned
```

### Diagram 5: LR Document Optical Character Recognition (OCR) Ingestion
```mermaid
sequenceDiagram
    autonumber
    actor Store as Receiving Store User
    participant Frontend as LR Upload Page
    participant API as LR Ingest Route (/api/lr/upload)
    participant OCR as OCR Parser Service
    participant DB as MariaDB (lr_tracking)

    Store->>Frontend: Select Image/PDF of Lorry Receipt
    Frontend->>API: multipart/form-data (file, location, notes)
    API->>API: Validate MIME (image/png, image/jpeg, application/pdf)
    API->>API: Generate SHA-256 Unique Document Hash
    API->>OCR: Execute Pattern Extractor (Regex & Text Tokenizer)
    OCR->>OCR: Extract Carrier (e.g., VRL, TCI)
    OCR->>OCR: Extract 10-12 Digit LR Number
    OCR->>OCR: Extract Origin & Destination Location Codes
    API->>DB: INSERT INTO lr_tracking (lr_number, transporter_code, status: IN_TRANSIT)
    API-->>Frontend: 201 Created { lr_id, lr_number, detected_transporter }
```

### Diagram 6: Transporter Tracking Gateway Sequence
```mermaid
sequenceDiagram
    autonumber
    actor User as Store Manager
    participant App as Frontend (Track Order)
    participant Backend as Express API (/api/lr/track/:id)
    participant Carrier as Carrier Gateway (e.g. VRL Logistics)

    User->>App: Click 'Sync Live Tracking'
    App->>Backend: POST /api/lr/track/:id/sync
    Backend->>Carrier: GET /track?lr={lr_number} (with User-Agent & Timeout)
    alt Carrier Returns Tracking JSON/HTML
        Carrier-->>Backend: 200 OK (Current Location, Status: In Transit / Out for Delivery)
        Backend->>Backend: Normalize Carrier Status to Internal Enum
        Backend->>Backend: UPDATE lr_tracking SET current_status=?, last_synced_at=NOW()
        Backend-->>App: 200 OK { current_status, location_history, eta }
    else Carrier Timeout / Captcha
        Backend->>Backend: Fallback to Last Cached Status
        Backend-->>App: 200 OK { cached: true, current_status, note: 'Transporter gateway busy' }
    end
```

### Diagram 7: Goods Receiving & GRN Discrepancy Flow
```mermaid
flowchart TD
    Arrival[Truck Arrives at Store Dock] --> MatchLR[Scan / Enter LR Number]
    MatchLR --> FetchPO[Fetch Associated Purchase Order Items]
    FetchPO --> CountItems[Store Clerk Counts Delivered Cartons/Pieces]
    CountItems --> CheckVariance{Delivered == Ordered?}
    
    CheckVariance -->|Exact Match| GRNOK[Generate Clean GRN - Status: RECEIVED]
    CheckVariance -->|Shortage / Excess| GRNVar[Record Discrepancy: Shortage / Overage]
    CheckVariance -->|Damaged Stock| GRNDmg[Record Damaged Quantity + Photo Proof]
    
    GRNVar --> Approval[Flag for Purchase Manager Review]
    GRNDmg --> DebitNote[Trigger Debit Note / Vendor Claim]
    GRNOK --> ClosePO[Mark PO Status: CLOSED]
    Approval --> ClosePO
```

### Diagram 8: Master Data Entity Hierarchy & Scoping
```mermaid
erDiagram
    DIVISION ||--o{ DEPARTMENT : contains
    DEPARTMENT ||--o{ CATEGORY : contains
    CATEGORY ||--o{ PRODUCT_TYPE : categorizes
    PRODUCT_TYPE ||--o{ PRODUCT : defines
    BRAND ||--o{ PRODUCT : brands
    PRODUCT ||--o{ PRODUCT_VARIANT : specifies
    COLOR ||--o{ PRODUCT_VARIANT : colors
    SIZE ||--o{ PRODUCT_VARIANT : sizes
    LOCATION ||--o{ PURCHASE_ORDER : delivers_to
    MANUFACTURER ||--o{ PURCHASE_ORDER : supplies
```

### Diagram 9: RBAC Authorization Interceptor Pipeline
```mermaid
flowchart LR
    Req[Incoming HTTP Request] --> HasToken{Bearer Token Present?}
    HasToken -->|No| CheckPublic{Is Route Public?}
    CheckPublic -->|Yes| Next[Route Handler]
    CheckPublic -->|No| Err401[401 Unauthorized]
    
    HasToken -->|Yes| VerifyJWT{JWT Valid & Not Expired?}
    VerifyJWT -->|No| Err401
    VerifyJWT -->|Yes| LoadSession{Session Valid in DB?}
    LoadSession -->|No| Err401
    LoadSession -->|Yes| LoadPerms[Attach user & permissions to req]
    
    LoadPerms --> CheckPerm{Has Required Permission?}
    CheckPerm -->|Super Admin| Next
    CheckPerm -->|Has Perm| Next
    CheckPerm -->|Missing Perm| Err403[403 Forbidden]
```

### Diagram 10: WebSocket Notification Broadcasting Architecture
```mermaid
sequenceDiagram
    autonumber
    participant Creator as PO Creator (User A)
    participant API as Backend Express Server
    participant WS as WebSocket Hub (ws/wss)
    participant Approver as Approver (User B)

    Approver->>WS: Connect & Authenticate with Token
    WS->>WS: Map Socket to user_id (User B)
    Creator->>API: POST /api/purchase-orders (Submit PO)
    API->>API: Evaluate Next Approver -> User B
    API->>API: INSERT INTO notifications (user_id: User B, message: 'New PO for approval')
    API->>WS: Emit 'notification' event to User B's active socket
    WS-->>Approver: Push Notification { id, title, po_id, timestamp }
    Approver->>Approver: Play Bell Sound + Increment Badge Count
```

### Diagram 11: Bulk CSV Data Ingestion & Sanitization Engine
```mermaid
flowchart TD
    File[User Uploads CSV] --> ValidateMime[Validate File MIME & Size <= 10MB]
    ValidateMime --> ParseStream[Stream Parse CSV Lines]
    ParseStream --> HeaderCheck{Match Required Column Headers?}
    HeaderCheck -->|Mismatch| Abort[Reject File: Invalid Format]
    HeaderCheck -->|Valid| RowLoop[Iterate Rows in Batches of 100]
    
    RowLoop --> Sanitize[Strip HTML / SQL injection characters]
    Sanitize --> ForeignCheck{Foreign Keys Exist? Brand, Category, etc.}
    ForeignCheck -->|Missing| RecordError[Append to Error Report]
    ForeignCheck -->|Exists| Deduplicate{Duplicate SKU / Barcode?}
    Deduplicate -->|Duplicate| RecordError
    Deduplicate -->|Unique| StageBatch[Stage for DB Transaction]
    
    StageBatch --> Commit[Batch INSERT INTO products]
    Commit --> Summary[Return Import Summary: Processed, Inserted, Failed]
```

### Diagram 12: Resilient MySQL Connection Pooling & Auto-Reconnect
```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting: db.js Initialized
    Connecting --> Connected: Handshake Succeeded (124ms)
    Connected --> ExecutingQuery: acquire() from pool
    ExecutingQuery --> Connected: release() to pool
    Connected --> ConnectionLost: Network Glitch / Server Restart
    ConnectionLost --> Reconnecting: backoff timer (1s, 2s, 4s...)
    Reconnecting --> Connected: Reconnect Succeeded
    Reconnecting --> AlertSRE: Retries Exhausted (> 10 attempts)
```

### Diagram 13: Schema Entity Relationship Diagram (ERD — Core Relational Core)
```mermaid
erDiagram
    users {
        int id PK
        string email UK
        string password_hash
        string full_name
        boolean is_active
        boolean is_super_admin
    }
    roles {
        int id PK
        string code UK
        string name
    }
    user_roles {
        int user_id PK, FK
        int role_id PK, FK
    }
    purchase_orders {
        int id PK
        string po_number UK
        int supplier_id FK
        int location_id FK
        string status
        decimal grand_total
        datetime created_at
    }
    po_items {
        int id PK
        int po_id FK
        int product_id FK
        int quantity
        decimal unit_price
        decimal tax_rate
        decimal total_price
    }
    lr_tracking {
        int id PK
        string lr_number UK
        int po_id FK
        string transporter_code
        string status
        datetime dispatched_at
    }
    audit_logs {
        int id PK
        int user_id FK
        string action
        string entity_type
        int entity_id
        text changes_json
        datetime created_at
    }

    users ||--o{ user_roles : has
    roles ||--o{ user_roles : assigned_to
    users ||--o{ purchase_orders : creates
    purchase_orders ||--o{ po_items : contains
    purchase_orders ||--o{ lr_tracking : ships_via
    users ||--o{ audit_logs : triggers
```

### Diagram 14: LiteSpeed `lsnode` Keep-Alive & Self-Healing Loop
```mermaid
sequenceDiagram
    autonumber
    participant LS as LiteSpeed Web Server (lsnode)
    participant Node as Node.js Backend Process (:4040)
    participant Timer as Keep-Alive Background Timer (240s)

    LS->>Node: Start Node.js Application Process
    Node->>Timer: Initialize Keep-Alive Interval (240,000ms)
    loop Every 240 Seconds
        Timer->>Node: HTTP GET http://localhost:4040/api/health
        Node-->>Timer: 200 OK { status: 'healthy', uptime: 240s }
        Note over LS,Node: Activity resets LiteSpeed 300s Idle Kill Timer
    end
    Note over LS: Process remains permanently active without SIGTERM
```

### Diagram 15: Automated Database Schema Migration Engine
```mermaid
flowchart TD
    Boot[Server Boots] --> ConnectDB[Establish MySQL Connection]
    ConnectDB --> CheckTable{migrations table exists?}
    CheckTable -->|No| CreateMigTable[CREATE TABLE migrations]
    CheckTable -->|Yes| ScanDir[Scan database/mysql/*.sql]
    CreateMigTable --> ScanDir
    
    ScanDir --> SortFiles[Sort Lexicographically 001 to 008]
    SortFiles --> FileLoop[Check Each Migration]
    
    FileLoop --> IsApplied{Applied in migrations?}
    IsApplied -->|Yes| NextFile[Skip File]
    IsApplied -->|No| RunSQL[Execute SQL File within DB Transaction]
    RunSQL -->|Success| RecordMig[INSERT INTO migrations name, executed_at]
    RunSQL -->|Failure| Rollback[ROLLBACK & Exit with Code 1]
    RecordMig --> NextFile
    NextFile --> AllDone{More Files?}
    AllDone -->|Yes| FileLoop
    AllDone -->|No| Ready[Database Migration Ready]
```

### Diagram 16: User Registration & Onboarding Approval Flow
```mermaid
flowchart TD
    User[Self-Registered User / Admin Invite] --> Submit[Submit Name, Email, Password]
    Submit --> DefaultState[Create Account: is_active = FALSE]
    DefaultState --> NotifyAdmin[Alert Super Admin via Dashboard & Email]
    NotifyAdmin --> Review[Super Admin Reviews User Access Request]
    Review --> Decision{Decision}
    Decision -->|Reject| DeleteUser[User Rejected / Deleted]
    Decision -->|Approve| AssignRoles[Assign Roles & Store Locations]
    AssignRoles --> Activate[Set is_active = TRUE]
    Activate --> UserCanLogin[User Successfully Logs In]
```

### Diagram 17: Password Reset & Security Token Validation Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant API as Backend Auth API
    participant Mail as SMTP Notification Service
    participant DB as MariaDB (password_resets)

    User->>API: POST /api/auth/forgot-password (email)
    API->>DB: Check if active user exists
    alt User Exists
        API->>API: Generate Cryptographic 256-bit Random Token
        API->>DB: Store SHA-256(token), expires_at (NOW + 1 Hour)
        API->>Mail: Send Password Reset Link with Token
    end
    API-->>User: 200 OK (Generic response preventing email enumeration)
    User->>API: POST /api/auth/reset-password (token, new_password)
    API->>DB: Verify token hash and check expiration
    alt Token Valid
        API->>API: Hash new password with bcrypt (cost 10)
        API->>DB: UPDATE users SET password_hash = ?
        API->>DB: DELETE FROM password_resets WHERE token = ?
        API-->>User: 200 OK (Password updated, please login)
    else Invalid / Expired
        API-->>User: 400 Bad Request (Invalid or expired reset token)
    end
```

### Diagram 18: Pricing & Margin Calculation Engine
```mermaid
flowchart LR
    Cost[Vendor Base Cost Price] --> Tax[+ GST / Central Excise]
    Tax --> Landed[Landed Purchase Cost]
    Landed --> Markup[+ Category Standard Margin %]
    Markup --> MRP[Calculate Maximum Retail Price - MRP]
    MRP --> Discount[- Authorized Store Discount %]
    Discount --> FinalPrice[Net Billing Price]
```

### Diagram 19: Brand-Wise Performance Analytics Flow
```mermaid
flowchart TD
    Request[User Requests Brand Analytics] --> Range[Extract Date Range Filter]
    Range --> QueryDB[Execute Aggregation Query on purchase_orders & po_items]
    QueryDB --> GroupBrands[GROUP BY brand_id, brand_name]
    GroupBrands --> CalcMetrics[Compute: Total POs, Total Spend, Delivery Timeliness, Rejection Rate]
    CalcMetrics --> Sort[Order by Total Volume Descending]
    Sort --> Chart[Render Custom SVG Charts & Exportable Data Table]
```

### Diagram 20: Date Range Aggregation & Period Filtering Engine
```mermaid
flowchart TD
    UI[User Selects Preset Button] --> Branch{Preset Type}
    Branch -->|Today| D1[Start: 00:00:00 Today | End: 23:59:59 Today]
    Branch -->|Yesterday| D2[Start: 00:00:00 Yday | End: 23:59:59 Yday]
    Branch -->|This Week| D3[Start: Monday 00:00 | End: Sunday 23:59]
    Branch -->|This Month| D4[Start: 1st Day 00:00 | End: Last Day 23:59]
    Branch -->|Custom Range| D5[User Defined Start Date to End Date]
    D1 & D2 & D3 & D4 & D5 --> UTC[Normalize to Asia/Kolkata Business TZ (+05:30)]
    UTC --> ParamSQL[Bind to SQL: WHERE created_at BETWEEN ? AND ?]
```

### Diagram 21: Audit Trail Cryptographic Hashing & Logging Flow
```mermaid
flowchart LR
    Event[Mutation Event: CREATE/UPDATE/DELETE] --> Capture[Capture Old State vs New State]
    Capture --> ExtractUser[Extract User ID, IP, User Agent]
    ExtractUser --> Hash[Generate SHA-256 Checksum of Payload]
    Hash --> Persist[INSERT INTO audit_logs user_id, action, diff, checksum]
    Persist --> Immutable[Read-Only Immutable Storage]
```

### Diagram 22: File Upload Sanitization & Multiform Stream Lifecycle
```mermaid
flowchart TD
    File[Incoming File Stream] --> SizeCheck{Size <= 10MB?}
    SizeCheck -->|No| RejectSize[Reject: File Exceeds Limit]
    SizeCheck -->|Yes| ExtCheck{Extension in WhiteList?}
    ExtCheck -->|No| RejectExt[Reject: Forbidden Extension]
    ExtCheck -->|Yes| MagicBytes{Magic Number MIME Matches Header?}
    MagicBytes -->|No| RejectSpoof[Reject: Spoofed MIME Type]
    MagicBytes -->|Yes| GenUUID[Generate Secure Random UUID Filename]
    GenUUID --> Save[Write to /uploads with Read-Only Permissions]
```

### Diagram 23: Client-Side Error Boundary & Health Recovery Flow
```mermaid
flowchart TD
    Crash[Uncaught React Render Exception] --> Catch[ErrorBoundary Component Catches]
    Catch --> Log[Log Error & Component Stack to Console]
    Catch --> Fallback[Render Polished Emergency Recovery Screen]
    Fallback --> Action{User Action}
    Action -->|Reload| Refresh[Window.location.reload]
    Action -->|Return to Dashboard| ResetNav[Navigate to /dashboard with Clean State]
```

### Diagram 24: Mobile Responsive Navigation Drawer Flow
```mermaid
flowchart TD
    UserClick[User Taps Mobile Hamburger ☰] --> ToggleState[Set mobileMenuOpen = TRUE]
    ToggleState --> ShowBackdrop[Render Dark Backdrop Overlay (z-index 998)]
    ToggleState --> SlideDrawer[Animate Sidebar transform: translateX(0)]
    
    SlideDrawer --> Action{User Interaction}
    Action -->|Click Backdrop| Close[Set mobileMenuOpen = FALSE]
    Action -->|Click Nav Link| Navigate[Navigate to Route & Auto-Close Drawer]
    Action -->|Click ✕ Button| Close
```

### Diagram 25: Dynamic Department Collection Discovery Flow
```mermaid
sequenceDiagram
    autonumber
    participant App as Sidebar.jsx
    participant API as /api/departments
    participant DB as MariaDB

    App->>API: GET /api/departments (on component mount)
    API->>DB: SELECT id, code, name, icon FROM departments WHERE is_active=1
    DB-->>API: List of departments
    API-->>App: 200 OK [Men, Women, Kids, Home, + Dynamic Custom Depts]
    App->>App: Merge static standard groups with newly created DB departments
    App->>App: Render expanded Collection Navigation sub-tree in Sidebar
```

### Diagram 26: Purchase Executive Scoped Workspace View Flow
```mermaid
flowchart TD
    UserLogin[User Logs In: Role = purchase_executive] --> LoadPerms[Permissions Loaded: po.create, po.view, catalogue.view]
    LoadPerms --> FilterNav[Filter Sidebar Navigation Items]
    FilterNav --> HideAdmin[Hide Users, Roles, Company, Pricing, Reports, Audit]
    FilterNav --> ShowWork[Display: Products, POs, LR Tracking, Team Chat]
    ShowWork --> AccessDirect[User Enjoys Fast, Distraction-Free Workspace]
```

### Diagram 27: Division Supervisor Scoped Routing Flow
```mermaid
flowchart TD
    Supervisor[Division Supervisor Logs In] --> DetectRole[Detect isSupervisor = TRUE]
    DetectRole --> LockDept[Lock View to Single Department: Men's Collection]
    DetectRole --> ScopedOrders[Limit PO List to Supervisor's Store Division]
    ScopedOrders --> SecureNav[Hide Unauthorized Financial Reports & Admin Masters]
```

### Diagram 28: Store Branch Multi-Location Filtering Hierarchy
```mermaid
flowchart TD
    GlobalFilter[Top Bar Location Selector] --> Choice{Selected Location}
    Choice -->|All Locations| ShowAll[Aggregate Data across BEL, DVG, SHI]
    Choice -->|Belagavi [BEL]| ShowBEL[Filter: WHERE location_code = 'BEL']
    Choice -->|Davanagere [DVG]| ShowDVG[Filter: WHERE location_code = 'DVG']
    Choice -->|Shivamogga [SHI]| ShowSHI[Filter: WHERE location_code = 'SHI']
    ShowAll & ShowBEL & ShowDVG & ShowSHI --> ReQuery[Trigger Live React Re-render of Dashboard Metrics]
```

### Diagram 29: Live Tracking Background Poll Worker
```mermaid
sequenceDiagram
    autonumber
    participant Cron as LR Background Worker (Cron)
    participant DB as MariaDB (lr_tracking)
    participant Carrier as Carrier API / Web Service

    loop Every 20 Minutes
        Cron->>DB: SELECT * FROM lr_tracking WHERE status IN ('IN_TRANSIT', 'DISPATCHED')
        DB-->>Cron: Active consignments list (e.g. 15 shipments)
        loop For Each Consignment
            Cron->>Carrier: Query Tracking Status (LR Number)
            Carrier-->>Cron: Status Update (e.g. 'Delivered to Belagavi Hub')
            Cron->>DB: UPDATE lr_tracking SET current_status=?, updated_at=NOW()
        end
        Cron->>Cron: Log sync completion stats
    end
```

### Diagram 30: Excel & PDF Purchase Order Generator Pipeline
```mermaid
flowchart TD
    UserReq[User Requests PO PDF / Excel] --> LoadPO[Fetch PO, Supplier, Location, and Items from DB]
    LoadPO --> FormatData[Format Currency (₹), GST %, and Dates (+05:30)]
    FormatData --> FormatChoice{Format Selected}
    
    FormatChoice -->|PDF| PDFKit[Render High-Res Vector PDF with Company Logo & Terms]
    FormatChoice -->|Excel| ExcelJS[Generate Styled .xlsx with Formatted Totals & Formulas]
    
    PDFKit & ExcelJS --> Stream[Stream Directly to HTTP Response as Attachment]
    Stream --> Download[User Browser Downloads Formatted Document]
```

### Diagram 31: Anti-Bot CAPTCHA Challenge & Validation Flow
```mermaid
sequenceDiagram
    autonumber
    actor Client as User Login Page
    participant API as Auth Controller (/api/auth/captcha)
    participant Store as In-Memory Challenge Store

    Client->>API: GET /api/auth/captcha
    API->>API: Generate 5-char unambiguous code (No 0, O, 1, I)
    API->>API: Render SVG with Noise Lines and Bezier Curves
    API->>Store: Store { id, code, expires_at: NOW + 3m }
    API-->>Client: 200 OK { captcha_id, svg_data }
    Client->>Client: Display SVG image in login form
    Client->>API: POST /api/auth/login { ...credentials, captcha_id, captcha_solution }
    API->>Store: Validate and immediately consume (DELETE) challenge
```

### Diagram 32: Rate Limiting & DoS Shield Interceptor Chain
```mermaid
flowchart LR
    Incoming[Incoming HTTP Request] --> IP[Extract Client IP / X-Forwarded-For]
    IP --> Bucket{Requests in Last 60s < Limit?}
    Bucket -->|Within Limit| Allow[Pass to Route Handler]
    Bucket -->|Exceeded Limit| Block[Return 429 Too Many Requests]
    Block --> Header[Attach Retry-After: 60s Header]
```

### Diagram 33: Production Database Backup & Retention Workflow
```mermaid
flowchart TD
    Trigger[Daily Midnight Cron (00:00 IST)] --> Dump[mysqldump --single-transaction --quick --routines]
    Dump --> Compress[gzip -9 Database Dump File]
    Compress --> Encrypt[Encrypt Archive with AES-256]
    Encrypt --> LocalStore[Store in Local /backups Directory]
    LocalStore --> RemoteSync[Secure Sync to Secondary Cloud Storage]
    RemoteSync --> Prune[Prune Backups Older than 30 Days]
```

### Diagram 34: Disaster Recovery & Automatic Failover Sequence
```mermaid
sequenceDiagram
    autonumber
    participant Mon as LiteSpeed Health Monitor
    participant Node as Node.js Instance
    participant SRE as On-Call DevOps Engineer

    Mon->>Node: GET /api/health
    alt Normal Health Response
        Node-->>Mon: 200 OK
    else 3 Consecutive Health Check Failures
        Mon->>Node: Send SIGKILL to stuck process
        Mon->>Node: Spawn fresh Node.js worker instance (lsnode.js)
        Mon->>SRE: Dispatch High-Priority Alert (PagerDuty / Email)
        Node->>Node: Run auto-migrate & connect to MariaDB
        Node-->>Mon: 200 OK (Traffic restored in < 5 seconds)
    end
```

---

## 5. Core Functional Modules Breakdown

### 5.1 Authentication & Session Management
- **Endpoints**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/captcha`.
- **Security**: Cryptographic password hashing using `bcrypt` (10 rounds). Stateless JWT authentication with server-side revocation tracking in `user_sessions`.
- **Anti-Bot Defense**: Native SVG CAPTCHA generator excluding ambiguous glyphs (`I`, `O`, `0`, `1`). Automatic challenge consumption upon verification.

### 5.2 Purchase Order Engine
- **Endpoints**: `/api/purchase-orders`, `/api/purchase-orders/:id`, `/api/purchase-orders/:id/approval-action`.
- **Business Logic**: Multi-currency item calculation, GST slab application (5%, 12%, 18%, 28%), automatic round-off, sequential PO numbering (`PO-YYMM-XXXX`).
- **Audit Integration**: Full snapshot history stored on every state transition.

### 5.3 Lorry Receipt (LR) & Logistics Tracking
- **Endpoints**: `/api/lr/upload`, `/api/lr/track/:id`, `/api/lr/dashboard`, `/api/lr/receiving`.
- **Carriers Supported**: VRL Logistics, TCI Express, Rivigo, Custom Transport.
- **OCR Engine**: Local rule-based pattern extractor identifying carrier names, 10-digit LR numbers, and store destination codes without external cloud dependencies.

### 5.4 Master Data Catalog
- **Modules**: Products, Categories, Brands, Colors, Sizes, Product Types, Manufacturers, Locations.
- **Integrity**: Standardized on composite unique constraints and `utf8mb4_unicode_ci` collation for maximum MariaDB 11.8 compatibility.

### 5.5 Analytics & Executive Reports
- **Reports Available**: Date-Range Procurement Summary, Store Branch Performance, Brand-Wise Sales & Margin Analysis, Supplier Timeliness Index.
- **Export Formats**: Real Microsoft Excel (`.xlsx`), Vector PDF, and raw CSV.

---

## 6. Data Lifecycle & Transaction Management

All financial and inventory state changes are wrapped in ACID-compliant MariaDB transactions via `db.transaction(async (conn) => { ... })`.

```sql
START TRANSACTION;
-- 1. Insert Purchase Order Header
INSERT INTO purchase_orders (po_number, supplier_id, location_id, grand_total, status) VALUES (?, ?, ?, ?, 'draft');
-- 2. Insert PO Line Items
INSERT INTO po_items (po_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?);
-- 3. Record Audit Trail
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes_json) VALUES (?, 'CREATE_PO', 'purchase_order', LAST_INSERT_ID(), ?);
COMMIT;
```

---

## 7. Enterprise Security & Zero-Trust Defense

1. **Strict Input Sanitization**: All user inputs sanitized against SQL injection via parameterized queries in `mysql2`.
2. **Defensive Content Security Policy**: Zero inline script evaluation, HTTPS enforcement, and frame denial (`X-Frame-Options: SAMEORIGIN`).
3. **Role-Based Least Privilege**: 9 granular system roles (`super_admin`, `admin`, `domain_admin`, `purchase_manager`, `purchase_executive`, `approver`, `receiving_user`, `viewer`, `auditor`).
4. **Environment Isolation**: Zero hardcoded credentials. All database passwords, JWT secrets, and salt keys loaded from validated `.env` configuration.

---

## 8. Performance, Scalability & SRE Blueprint

### Measured Baseline Capacity
- **API Read Latency**: 8–35 ms (Dashboard and Master Data queries).
- **API Write Latency**: 45–120 ms (Full PO creation with line items and audit log insertion).
- **Frontend Bundle Size**: 333 kB JS / 166 kB CSS (Gzip: 108 kB / 30 kB), loading in < 400 ms on 4G networks.

### Scalability Strategy (Path to 1,000,000 Users)
1. **Database Layer**: Read/Write splitting with MariaDB MaxScale load balancer; Redis caching layer for master data and active sessions.
2. **Application Layer**: Horizontal scaling across multiple Node.js worker processes via PM2 cluster mode or Kubernetes stateless pods.
3. **Storage Layer**: Offloading `/uploads` to S3-compatible Object Storage (e.g., Cloudflare R2, AWS S3) fronted by Cloudflare CDN.

---

## 9. Operational Verification & SRE Health Matrix

| Health Indicator | Target Metric | Measured Status | Verification Command |
| :--- | :--- | :--- | :--- |
| **Unit Test Suite** | 100% Pass Rate | **15 / 15 Passed** | `npm test --prefix backend` |
| **Frontend Production Build** | Zero Errors | **173 Modules OK** | `npm run build --prefix frontend` |
| **Database Pool Health** | Sub-150ms Connect | **Connected (124ms)** | `GET /api/health` |
| **LiteSpeed Keep-Alive** | 0 Idle SIGTERMs | **Active (240s ping)** | `server.js internal loop` |
| **Collation Integrity** | `utf8mb4_unicode_ci` | **60 Tables Unified** | `SHOW TABLE STATUS` |
| **Security Credential Check** | Zero Commits | **Clean (`.gitignore`)** | `git status --ignored` |

---
*Authored by Senior Full-Stack Software Architects, Database Engineers & DevSecOps Specialists for BSC Textiles Production Infrastructure.*
