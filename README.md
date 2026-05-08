# Backend (Vercel)

This folder contains the API-only backend for the Narayana Exam System.

## Deploy target
- Platform: Vercel
- Entrypoint: `api/index.js`

## Local run
```bash
cd backend
npm install
npm run -s dev:both
```

## One-command run (backend + frontend)
From project root:

```bash
cd backend && npm run -s dev:both
```

Alternative:

```bash
cd backend && npm run -s dev:both
```

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5500`

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_REST_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_DOMAIN`
- `ALLOWED_ORIGINS` (comma-separated frontend origins)

Example:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_REST_URL=https://your-project.supabase.co/rest/v1
ALLOWED_ORIGINS=https://your-site.netlify.app,http://localhost:5500
```

## Notes
- Frontend must call this backend URL (set in `frontend/js/config.js`).
- Admin API supports bearer token authentication (for cross-domain frontend deployments).
- Run `backend/supabase/schema.sql` in Supabase SQL Editor before using exam/admin data features.
