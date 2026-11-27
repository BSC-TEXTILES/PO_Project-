# AI Agent Operational Playbook & Guidelines (AGENTS) — BSC Exclusive POMS

> **Audience**: AI Coding Agents, Automated CI/CD Bots, and Software Engineers  
> **Mandate**: Strict adherence to safety, stability, test-driven validation, and non-destructive operations.

---

## 1. Golden Rules of Engagement

1. **Verify Before and After**: Always run `npm test --prefix backend` before and after modifying backend code.
2. **Never Break Working Functionality**: Do not rewrite or delete working endpoints, database tables, or React components unless explicitly requested by the user.
3. **Respect Database Conventions**:
   - Engine: `InnoDB`
   - Character Set: `utf8mb4`
   - Collation: `utf8mb4_unicode_ci` (DO NOT use `utf8mb4_0900_ai_ci`)
   - Avoid `IFNULL()` or function calls inside `GENERATED ALWAYS AS (...) VIRTUAL`.
4. **Build Distribution Parity**: When modifying frontend components, compile via `npm run build --prefix frontend` and sync `frontend/dist/*` to `backend/dist/`, `public/`, and `dist/`.
5. **No Credential Leaks**: Never print or commit `.env` variables or real passwords.

---

## 2. Standard Command Palette

```bash
# Run unit & integration test suites
npm test --prefix backend

# Compile frontend production bundle
npm run build --prefix frontend

# Check git status for unstaged files or secret leaks
git status

# Inspect MariaDB connection & health
curl http://localhost:4040/api/health
```

---

## 3. Documentation Synchronization Rule

Whenever a new endpoint, database table, or major architectural feature is introduced, the authoring agent MUST simultaneously update:
- `API.md` (for new routes, parameters, or responses)
- `DATABASE.md` (for schema changes, new tables, or index additions)
- `PRD.md` (for new functional requirements or user stories)
- `MEMORY.md` (for resolved bugs, breaking changes, or invariants)
