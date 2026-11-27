# BSC Exclusive — Purchase Order Management System (POMS v2.0)

[![Tests](https://img.shields.io/badge/Tests-15%2F15%20Passing-brightgreen)](TESTING.md)
[![Database](https://img.shields.io/badge/MariaDB-11.8.9--log-blue)](DATABASE.md)
[![Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20React%2018%20%7C%20Vite-61dafb)](Complete%20Project%20Workflow%20and%20System%20Design%20README.md)
[![Status](https://img.shields.io/badge/Production-po.bsctextiles.in-success)](https://po.bsctextiles.in)

Enterprise-grade Purchase Order Management, Master Data Catalog, and Multi-Carrier Lorry Receipt (LR) Logistics Tracking Platform designed for **BSC Textiles** retail outlets across Karnataka (**Belagavi [BEL]**, **Davanagere [DVG]**, **Shivamogga [SHI]**).

---

## 📚 Complete Architectural & Technical Documentation Suite

| Document | Purpose & Key Contents |
| :--- | :--- |
| **[Complete Project Workflow and System Design README.md](Complete%20Project%20Workflow%20and%20System%20Design%20README.md)** | **Master Architectural Guide**: Full system HLD/LLD, 34 Mermaid diagrams, module breakdown, scalability strategy, and SRE health matrix. |
| **[PRD.md](PRD.md)** | **Product Requirements Document**: Business goals, personas, requirement IDs (`REQ-*`), approval thresholds, and feature matrices. |
| **[DESIGN.md](DESIGN.md)** | **System Design Document**: Architectural patterns, SOLID design principles, component hierarchy, and error resilience. |
| **[DATABASE.md](DATABASE.md)** | **Database Architecture**: 60 MariaDB tables, ER diagrams, MariaDB 11.8 collation compatibility, and indexing matrix. |
| **[SECURITY.md](SECURITY.md)** | **Security & Threat Model**: STRIDE analysis, OWASP Top 10 mitigations, ASVS compliance, and anti-bot defense. |
| **[API.md](API.md)** | **REST API Reference**: Full endpoint schemas, request/response payloads, authentication, and error envelopes. |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | **Production Deployment Guide**: LiteSpeed `lsnode` setup, 240s keep-alive loop, environment variables, and disaster recovery. |
| **[TESTING.md](TESTING.md)** | **Quality Assurance Report**: 15/15 unit and integration tests passing, OCR test suites, and regression checklists. |
| **[MEMORY.md](MEMORY.md)** | **Persistent Knowledge Base**: History of resolved issues, MariaDB 11.8 limitations, and invariant architectural rules. |
| **[AGENTS.md](AGENTS.md)** | **AI Agent Playbook**: Operational rules of engagement, verification workflows, and documentation synchronization policies. |

---

## ⚡ Quickstart Guide

### Prerequisites
- Node.js 20+ LTS
- MariaDB 11.8+ or MySQL 8.0+

### Local Development Setup
```bash
# 1. Clone the repository
git clone https://github.com/BSC-TEXTILES/PO_Project.git
cd -BSC-ExclusivePOMS

# 2. Install dependencies
npm install --prefix backend
npm install --prefix frontend

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your local MariaDB credentials

# 4. Run test suite
npm test --prefix backend

# 5. Start development servers
# Terminal 1: Backend API
npm run dev --prefix backend

# Terminal 2: Frontend Vite
npm run dev --prefix frontend
```

### Production Access
- **Production URL**: `https://po.bsctextiles.in`
- **Default Super Admin**: `admin@bsctextiles.in` / `Admin@123` (guaranteed by auto-migrator)

---

## 🛡️ Key Architectural Highlights
- **Continuous Keep-Alive**: Internal 240s HTTP loop preventing LiteSpeed `lsnode` 300s idle shutdown.
- **MariaDB 11.8 Engine Compatibility**: All 60 database tables standardized on `utf8mb4_unicode_ci` with standard composite unique constraints.
- **Logistics OCR Pipeline**: Native regex-based Lorry Receipt extraction for VRL Logistics, TCI Express, and Rivigo with zero external API costs.
- **High-Contrast Design System**: Clean enterprise styling with WCAG AAA contrast compliance across desktop and mobile screens.

---
*Maintained by BSC Textiles Engineering & DevOps Teams.*
