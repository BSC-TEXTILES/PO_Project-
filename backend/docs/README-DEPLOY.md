# Deploying POMS — Vercel (frontend) + Render (backend) + MySQL (database) + Supabase Storage (files, optional)

The project is a three-part system:

| Part | Location | Deploy to | Env file |
|------|----------|-----------|----------|
| Frontend (React/Vite) | `frontend/` | **Vercel** | `frontend/.env.example` |
| Backend API (Node/Express) | `backend/` | **Render** | `backend/.env.example` |
| Database | `database/mysql/` (migrations) | any **MySQL 8.0.19+** server | `DB_*` in the backend env |
| File storage (optional) | — | **Supabase Storage** | `STORAGE_DRIVER=supabase` in the backend env |

---

## 1. MySQL database and file storage

### 1.1 Create the database
1. Provision a MySQL 8.0.19+ server (self-hosted or managed) reachable from Render.
2. Create the database and the `poms_migrator` / `poms_app` accounts as shown in
   [docs/DATABASE.md](docs/DATABASE.md) section 3.
3. Apply the schema: `cd backend && DB_USER=poms_migrator DB_PASSWORD=<…> npm run db:migrate`
   (`render.yaml` also runs it before each deploy).
4. The default Administrator is `admin@bsc.local` / `Admin@123` — **change this password immediately after first login** (Users & Roles → Edit).

### 1.2 Connection settings
- Note the host, port, database name and the `poms_app` password. Set `DB_SSL=true`
  for a remote or managed server.

### 1.3 Create the file-storage bucket (optional)
1. Create a project at [supabase.com](https://supabase.com), then → **Storage** → New bucket → name it `poms-uploads`.
2. Make the bucket **public** (files such as product images and attachment previews are served by URL).
3. Project Settings → API → copy the **Project URL** and the **service_role** key.

---

## 2. Render — backend API

1. Push this repository to GitHub/GitLab.
2. Render → **New → Blueprint** and select the repo (it reads `render.yaml`), or create a Web Service manually with root directory `backend`, build `npm install`, start `npm start`.
3. Set the environment variables (see `backend/.env.example`):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | MySQL server from step 1.2 |
| `DB_USER` / `DB_PASSWORD` | the `poms_app` account |
| `DB_SSL` | `true` for a remote/managed server |
| `CLERK_SECRET_KEY` | Clerk secret key from Dashboard → API Keys |
| `CORS_ORIGIN` | your Vercel URL(s), comma separated — e.g. `https://poms.vercel.app` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1.3 |
| `SUPABASE_BUCKET` | `poms-uploads` |

4. Health check path is `/api/health` (already configured). After deploy, open `https://<your-api>.onrender.com/api/health` — it must answer `{"status":"ok",...}`.

> **Single-origin alternative:** you don't *need* Vercel. Because the backend serves `frontend/dist`, you can build the frontend, deploy only the backend, and open the site directly at the Render URL. In that mode leave `CORS_ORIGIN` and `VITE_API_BASE` empty.

---

## 3. Vercel — frontend

1. Vercel → **Add New Project** → import the repo.
2. Set **Root Directory** to `frontend` (Vercel detects Vite; `vercel.json` already handles SPA rewrites).
3. Set the environment variable:

| Key | Value |
|-----|-------|
| `VITE_API_BASE` | `https://<your-api>.onrender.com/api` |

4. Deploy. Open the site — the landing page loads from Vercel and every API call goes to Render.

---

## 4. Post-deploy checklist (no errors)

- [ ] `https://<api>/api/health` → `{"status":"ok"}`
- [ ] Landing page loads from Vercel; hero text visible over the background image.
- [ ] Login shows the Clerk sign-in form and rejects wrong credentials.
- [ ] Sign in as `admin@bsc.local` — **change the default password now**.
- [ ] Upload an attachment (Attachments page) → it opens from Supabase Storage.
- [ ] Replace an attachment (🔄 button) and edit its details (✏️) — the stored file updates.
- [ ] Create a test user with a single collection scope → confirm their dashboard, PO list and PO builder show only that collection.
- [ ] Check the dashboard "Team Activity — Live" panel shows your session with IP/device.
- [ ] Confirm `CORS_ORIGIN` exactly matches your Vercel domain(s) — the browser console must show no CORS errors.

## 5. Security notes

- Clerk handles session management, token storage and refresh automatically.
- Every endpoint re-checks role permissions, division and collection scope server-side.
- The audit trail is append-only (protected by a database trigger).
- Security headers and HTTPS-only assumptions (behind Render/Vercel proxies) are enabled automatically.
- Rotate `CLERK_SECRET_KEY` only deliberately — it invalidates all sessions.
- Legal pages for users: `/privacy`, `/terms`, `/security` (linked in the landing footer).
