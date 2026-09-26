# NoteFlow

A voice-driven note-taking app. You record a spoken command, and the backend transcribes it, extracts the intent with an LLM, resolves which note/todo you meant via fuzzy matching, and executes the action (with undo support).

## Structure

Two independent apps with no root package manager. Install and run each separately.

| App | Stack |
| --- | --- |
| `backend/` | Express 5, TypeScript, Prisma 7 (Neon serverless adapter) on PostgreSQL, OpenAI (Whisper + GPT-4o-mini), Google OAuth, Nodemailer |
| `frontend/` | React 19, Vite 8, TypeScript, Tailwind CSS 4 |

```
voice-note-taking/
├── backend/
│   ├── prisma/            # schema + migrations
│   └── src/
│       ├── routes/        # auth, note, voice, voiceUndo, passwordReset, guide, newsletter
│       ├── lib/           # transcribe, extractIntent, resolveTarget, executeAction, ...
│       ├── middlewares/   # auth, rate limiting, error handling
│       └── schemas/       # zod validation
└── frontend/
    └── src/
```

## Prerequisites

- **Node.js 20.19+ (or 22.12+)** — required by Vite 8.
- **PostgreSQL database.** Neon is recommended because `src/lib/prisma.ts` uses `@prisma/adapter-neon`. Any Postgres works if you swap the adapter.
- **OpenAI API key** — powers transcription and intent extraction.
- **Google OAuth credentials** — for Google sign-in (optional locally, required for that flow).
- **SMTP credentials** — for password-reset emails (optional, but the reset flow will not send mail without them).

## Backend setup

```bash
cd backend
npm install
```

Create `backend/.env` by copying the example and filling in real values:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Neon URLs include `?sslmode=require`. |
| `PORT` | no | Defaults to `8080`. |
| `NODE_ENV` | no | `development` locally; `production` enables `trust proxy`. |
| `JWT_SECRET` | yes | Long random string used to sign 7-day auth tokens. |
| `FRONTEND_URL` | yes | CORS allowlist. Comma-separated for multiple origins. Must match the frontend origin exactly. |
| `OPENAI_API_KEY` | yes | Voice transcription + intent extraction. |
| `GOOGLE_CLIENT_ID` | yes* | *Required for Google sign-in. |
| `GOOGLE_CLIENT_SECRET` | yes* | *Required for Google sign-in. |
| `GOOGLE_CALLBACK_URL` | yes* | Must be `http://localhost:8080/api/auth/google/callback` locally. |
| `SMTP_HOST` | yes** | **Required for password-reset emails. |
| `SMTP_PORT` | yes** | Usually `587`. |
| `SMTP_USER` | yes** | |
| `SMTP_PASS` | yes** | |
| `EMAIL_FROM` | yes** | From address shown on reset emails. |

Generate the Prisma client and apply migrations:

```bash
npm run build          # runs `prisma generate` -> src/generated/prisma (gitignored)
npx prisma migrate deploy
```

> `npm run build` only generates the Prisma client — there is no compile-to-JS step. The server runs TypeScript directly via `tsx`.
>
> The migration `20260908000000_enable_pg_trgm` runs `CREATE EXTENSION pg_trgm` for fuzzy search. On self-hosted Postgres this may require elevated privileges; on Neon it runs automatically.

Start the dev server:

```bash
npm run dev            # tsx watch src/app.ts -> http://localhost:8080
```

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

`frontend/.env`:

| Variable | Notes |
| --- | --- |
| `VITE_APP_BASE_URL` | Backend API base, e.g. `http://localhost:8080/api`. |

```bash
npm run dev            # Vite -> http://localhost:5173
```

## Service credentials

### Google OAuth

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console.
2. Add an **authorized redirect URI**: `http://localhost:8080/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in `backend/.env`.
4. `FRONTEND_URL` must equal the frontend origin (`http://localhost:5173`) so the callback redirect is allowed by CORS.

### OpenAI

Create an API key and set `OPENAI_API_KEY`. It is used by `lib/transcribe.ts` (Whisper) and `lib/extractIntent.ts` (GPT-4o-mini).

## Run and verify

1. Start PostgreSQL (or ensure your Neon database is reachable).
2. Start the backend: `cd backend && npm run dev`.
3. Start the frontend: `cd frontend && npm run dev`.
4. Check the API is up:

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

## API reference

Base URL is `http://localhost:8080`. All app endpoints live under `/api`. Protected routes require an `Authorization: Bearer <token>` header. Errors use `{ "success": false, "message": "..." }`.

### System

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | no | Liveness check. |

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | no | Register. Returns a JWT. |
| `POST` | `/api/auth/signin` | no | Log in. Returns a JWT. |
| `GET` | `/api/auth/me` | yes | Current user profile. |
| `PUT` | `/api/auth/guide` | yes | Update onboarding guide preferences. |
| `GET` | `/api/auth/google` | no | Redirect to Google OAuth consent. |
| `GET` | `/api/auth/google/callback` | no | Google OAuth callback; redirects to frontend with token. |

### Password reset

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/forgot-password` | no | Email a 6-digit reset code. |
| `POST` | `/api/auth/verify-reset-otp` | no | Verify the reset code. |
| `POST` | `/api/auth/reset-password` | no | Set a new password with a valid code. |

### Notes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/note` | yes | List notes (`page`, `limit`, `search`, `bookmarked`, `archived`, `trashed`). |
| `POST` | `/api/note` | yes | Create a PARAGRAPH or CHECKBOX note. |
| `PUT` | `/api/note/:noteId` | yes | Partially update a note (and sync todos). |
| `DELETE` | `/api/note/:noteId` | yes | Move note to trash (soft delete). |
| `PUT` | `/api/note/:noteId/order` | yes | Reorder between `prevId` and `nextId`. |
| `PUT` | `/api/note/todo/complete/:noteId` | yes | Batch mark todos `done`/undone. |
| `DELETE` | `/api/note/:noteId/permanent` | yes | Permanently delete a note. |
| `DELETE` | `/api/note/trash/empty` | yes | Permanently delete all trashed notes. |

### Voice

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/voice/command` | yes | Upload audio (`multipart/form-data`, field `audio`) -> transcribe -> extract intent -> resolve -> execute. |
| `POST` | `/api/voice/undo` | yes | Undo the last voice action via its `undoToken`. |

### Newsletter

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/newsletter/subscribe` | no | Subscribe an email address. |

## Postman collection

A ready-to-use collection and environment live in [`postman/`](postman/):

- `postman/NoteFlow.postman_collection.json`
- `postman/NoteFlow.postman_environment.json`

**Import**

1. In Postman: **Import** -> select both JSON files.
2. Choose the **NoteFlow Local** environment in the top-right selector.
3. Run the backend (`cd backend && npm run dev`) and hit **Health Check** to confirm it is reachable.

**Variables** (edit in the collection/environment):

| Variable | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | `http://localhost:8080` | Root URL (health). |
| `apiUrl` | `http://localhost:8080/api` | API base for all other requests. |
| `token` | — | Bearer JWT. Auto-filled by **Sign Up** / **Sign In**. |
| `email` / `password` / `username` | `user@example.com` / `Password1!` / `testuser` | Auth requests. |
| `noteId` / `todoId` | `1` | Path params. Auto-filled when you create a note. |
| `undoToken` | — | Auto-filled by **Voice Command**. |
| `otp` | `000000` | Reset code received by email. |

The collection sets the bearer token automatically for protected requests, and post-response scripts capture the JWT on sign in, the note/todo ids on note creation, and the undo token from a voice command — so a typical flow (Sign In -> Create Note -> Voice Command -> Undo) works without manual copy-paste.

## Scripts

### backend

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `tsx watch src/app.ts` | Dev server with reload. |
| `npm run build` | `prisma generate` | Generate the Prisma client. |
| `npm start` | `tsx src/app.ts` | Run the server. |
| `npm test` | — | Not configured. |

### frontend

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `vite` | Dev server with HMR. |
| `npm run build` | `tsc -b && vite build` | Type-check + production build. |
| `npm run lint` | `eslint .` | Lint. |
| `npm run preview` | `vite preview` | Preview the production build. |

## Troubleshooting

- **`Cannot find module '.../generated/prisma'` or type errors about Prisma** — the generated client is gitignored. Run `cd backend && npm run build`.
- **CORS error in the browser** — `FRONTEND_URL` in `backend/.env` must exactly match the frontend origin (scheme + host + port). Multiple origins are comma-separated.
- **Password-reset emails never arrive** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` must all be set; the backend only logs email failures.
- **Migration fails on `CREATE EXTENSION pg_trgm`** — your Postgres user lacks privileges. Create the extension as a superuser first, or use a database provider (e.g. Neon) that allows it.
- **Voice commands fail** — confirm `OPENAI_API_KEY` is valid and the uploaded audio is under 25MB.
- **Google sign-in redirects with an error** — the redirect URI registered in Google Cloud must match `GOOGLE_CALLBACK_URL` exactly.
