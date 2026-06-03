# IELTS / Learnix — Backend API

Express + MongoDB (Mongoose) REST API that replaces the frontend's
`localStorage` mock stores. Handles auth, groups, students, homework,
submissions, entry tests, payments, analytics and test results.

## Stack & security

- **Express 4**, **Mongoose 8**, **MongoDB**
- **Argon2id** password hashing (`utils/password.js`)
- **JWT** access + refresh tokens with minimal claims (`sub`, `role` only — no PII)
- **express-rate-limit** on every auth endpoint (and a global API limiter)
- **Zod** validation + sanitisation on every request (`middleware/validate.js`)
- **Helmet** secure headers, strict **CORS** allow-list
- **Role-based access control** + per-record ownership checks (students can only
  read/modify their own data — the MongoDB equivalent of Supabase RLS)
- Secrets only via environment variables; no sensitive data is ever logged

## Setup

```bash
cd backend
cp .env.example .env        # then edit values
npm install
npm run seed                # create demo accounts + mock data
npm run dev                 # start on http://localhost:4000
```

You need a running MongoDB. Either install it locally or use Docker:

```bash
docker run -d --name ielts-mongo -p 27017:27017 mongo:7
```

Then point `MONGODB_URI` at it (default `mongodb://127.0.0.1:27017/ielts`).

### Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `4000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | long random strings |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | token lifetimes (`15m`, `30d`) |
| `CORS_ORIGINS` | comma-separated allowed frontend origins |
| `SEED_*_PASSWORD` | passwords for the seeded demo accounts |

### Demo accounts (after `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@ielts.com` | `SEED_ADMIN_PASSWORD` (default `admin123`) |
| Teacher | `teacher@ielts.com` | `SEED_TEACHER_PASSWORD` (default `teacher123`) |
| Student | `student@ielts.com` | `SEED_STUDENT_PASSWORD` (default `student123`) |

## API overview

All routes are prefixed with `/api`. Authenticated routes need
`Authorization: Bearer <accessToken>`.

### Auth (`/api/auth`) — rate limited
- `POST /register` `{ email, password, name }`
- `POST /login` `{ email, password }`
- `POST /refresh` `{ refreshToken }`
- `GET  /me`

### Groups (`/api/groups`) — staff only
- `GET /` · `POST /` · `GET /:id` · `PATCH /:id` · `DELETE /:id` (admin)
- `POST /:id/members` · `DELETE /:id/members` `{ studentId }`

### Students (`/api/students`)
- `GET /` `POST /` (staff)
- `GET /:id` · `GET /:id/progress` (owner or staff)
- `PATCH /:id` · `DELETE /:id` (staff)

### Homework (`/api/homework`)
- `GET /mine` · `POST /start` · `POST /attempt` (student)
- `GET /` `POST /` · `GET /submissions` · `PATCH /submissions/:id` (staff)
- `GET /:id` · `DELETE /:id`

### Entry tests (`/api/entry-tests`)
- `GET /mine` · `PATCH /:id/mc` · `PATCH /:id/reading` ·
  `PATCH /:id/writing/draft` · `PATCH /:id/writing/submit` (owner)
- `GET /` · `POST /` · `PATCH /:id/grade` · `DELETE /:id` (staff)
- `GET /:id` (owner or staff)

MC and reading sections are auto-scored server-side (`content/entry-test.js`);
writing + overall level are graded by a teacher.

### Payments (`/api/payments`) — staff only
- `GET /` `POST /` · `PATCH /:id` · `DELETE /:id`
- `POST /:id/paid` · `POST /:id/unpaid` · `GET /group/:id/summary`

### Analytics (`/api/analytics`)
- `POST /events` (record an exercise attempt) · `GET /topics` (aggregated stats)

### Test results (`/api/test-results`)
- `GET /` · `POST /` · `GET /:id`

## Project structure

```
backend/src
├── config/        env + mongoose connection
├── content/       entry-test answer keys + CEFR scoring
├── controllers/   request handlers per domain
├── middleware/    auth, authorize (RBAC), validate (Zod), rateLimit, error
├── models/        Mongoose schemas
├── routes/        Express routers
├── services/      shared logic (student/group, entry-test status)
├── utils/         ids, password (argon2id), jwt, ApiError, asyncHandler
├── validators/    Zod schemas
├── seed/          seed.js — demo accounts + mock data
├── app.js         Express app factory
└── server.js      bootstrap (connect DB + listen)
```

## Frontend wiring

The Next.js app (`../front`) talks to this API via `front/lib/api-client.ts`
(token storage + transparent refresh) and the typed `front/lib/api.ts` layer.
Set `NEXT_PUBLIC_API_URL=http://localhost:4000/api` in `front/.env.local`.
Authentication (`front/lib/auth-context.tsx`) already runs entirely through the
backend.
