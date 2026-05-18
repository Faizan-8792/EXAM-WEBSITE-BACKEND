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

## Exam Link API

### Create an exam link
`POST /api/admin/exam-links` *(requires admin auth)*

**Body:**
```json
{
  "startTime": "2025-06-01T09:00:00.000Z",
  "endTime":   "2025-06-01T11:30:00.000Z"
}
```

- `endTime` — **required**. Must be a future ISO timestamp. This becomes the link's expiry.
- `startTime` — optional. When provided, the exam is "scheduled" and participants cannot start before this time. Must be before `endTime`.

**Response:**
```json
{
  "message": "Exam URL generated successfully",
  "code": "EXAM-XXXX-XXXX-XXXX",
  "url": "https://your-frontend/exam-link/EXAM-XXXX-XXXX-XXXX",
  "startTime": "2025-06-01T09:00:00.000Z",
  "expiresAt": "2025-06-01T11:30:00.000Z",
  "neverExpires": false
}
```

### List exam links
`GET /api/admin/exam-links` *(requires admin auth)*

Each link includes a `status` field:
- `"Active"` — within the start/end window
- `"Scheduled"` — start time is in the future
- `"Expired"` — end time has passed

### Check link validity (public)
`GET /api/exam/link/:code`

```json
{
  "valid": true,
  "expired": false,
  "notStartedYet": false,
  "secondsUntilStart": 0,
  "startTime": "2025-06-01T09:00:00.000Z",
  "expiresAt": "2025-06-01T11:30:00.000Z"
}
```

## Database migration

If upgrading from a version that did not have scheduled exams, run the migration script in Supabase SQL Editor:

```
backend/supabase/migration_add_start_time.sql
```

## Notes
- Frontend must call this backend URL (set in `frontend/js/config.js`).
- Admin API supports bearer token authentication (for cross-domain frontend deployments).
- Run `backend/supabase/schema.sql` in Supabase SQL Editor before using exam/admin data features.
