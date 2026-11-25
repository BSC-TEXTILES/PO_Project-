# PO_Project-

BSC Exclusive — Purchase Order Management System (POMS)

## Project Architecture
- `backend/` — Express.js API, authentication (RBAC), MySQL database layer, security & audit logs
- `database/` — MySQL schemas, tables, and automated migration scripts
- `frontend/` — React SPA with Vite, catalogue, PO management, and real-time dashboard

## Quick Start
1. Install dependencies:
   - Backend: `cd backend && npm install`
   - Frontend: `cd frontend && npm install`
2. Start development servers:
   - Backend: `npm start --prefix backend`
   - Frontend: `npm run dev --prefix frontend`
