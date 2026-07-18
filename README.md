# HeerMe

Personal dashboard for reminders, college attendance, academic lectures, and session-plan DOCX export.

**Stack:** React 18 (Vite) + Express + MongoDB · **Auth:** 6-digit PIN → JWT (7 days)  
**Production:** Frontend on [Vercel](https://heer-me.vercel.app/) · API on [Render](https://heerme.onrender.com)

## Features

- Calendar (month / week / day) with reminders, lectures, and college in/out markers
- Recurring reminders, search, browser notifications
- Attendance logging + analytics charts
- Academic lectures and bi-monthly session plan generation / DOCX download
- Authenticated JSON database export

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

## Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit secrets
npm run dev
```

API: **http://localhost:5000** · Health: `GET /api/health`

Required env (see [`backend/.env.example`](backend/.env.example)):

| Variable | Notes |
|----------|--------|
| `HEERME_PIN` | Exactly 6 digits |
| `JWT_SECRET` | ≥ 16 characters |
| `MONGODB_URI` | Defaults to `mongodb://localhost:27017/heerme` |
| `CORS_ORIGIN` | Production: `https://heer-me.vercel.app` (comma-separated allowlist). Empty = allow any origin (dev only) |
| `PORT` | Default `5000` |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: **http://localhost:3000** (Vite proxies `/api` → `localhost:5000`).

For production builds, set build-time:

```env
VITE_API_URL=https://heerme.onrender.com/api
```

## Scripts

| App | Command | Purpose |
|-----|---------|---------|
| backend | `npm run dev` / `npm start` | Dev watch / production |
| backend | `npm test` | Node test runner |
| frontend | `npm run dev` / `npm run build` | Dev / production bundle |
| frontend | `npm test` | Node test runner |

## Deploy notes

1. **Render (API):** Root `backend`, start `npm start`, set env vars including `CORS_ORIGIN=https://heer-me.vercel.app`.
2. **Vercel (SPA):** Root `frontend`, build `npm run build`, output `dist`, set `VITE_API_URL` to the Render API `/api` base.
3. After API deploys, confirm `Content-Disposition` is exposed (CORS `exposedHeaders`) so session-plan download filenames work cross-origin.

## API (authenticated unless noted)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/login` | PIN; rate-limited |
| GET | `/api/auth/session` | JWT check |
| GET | `/api/health` | Public; `503` if Mongo disconnected |
| * | `/api/reminders`, `/attendance`, `/academic-lectures`, `/session-plans`, `/export` | Bearer JWT |

## Project structure

```
heerme/
├── backend/          # Express API
├── frontend/         # Vite React SPA
├── .github/workflows/ci.yml
└── README.md
```
