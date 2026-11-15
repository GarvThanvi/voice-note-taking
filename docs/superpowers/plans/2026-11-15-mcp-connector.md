# MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote MCP endpoint to the NoteFlow backend so ChatGPT, claude.ai, Claude Code and OpenCode can read and edit a user's notes and todos, with PATs for local tools and OAuth 2.1 for cloud clients, plus the settings page that hands out and revokes credentials.

**Architecture:** `backend/src/mcp/` mounts a stateless Streamable HTTP MCP server at `/mcp`. Each tool handler mints a 5-minute internal JWT and calls the existing REST routes through a loopback-only `/internal/*` mount, so note logic stays in one place. Credentials (PAT hashes, OAuth tokens, codes, clients) live in four new Prisma models; `/mcp` resolves either credential to a `userId` and a scope set before any tool runs. The frontend gains one `/settings` page reached from a new header icon.

**Tech Stack:** Express 5, TypeScript via `tsx`, Prisma 7 (`prisma-client` generator → `backend/src/generated/prisma`), zod 4, `@modelcontextprotocol/sdk` 1.32, `node:test` via `tsx --test`, `supertest` for HTTP tests, React 19 + Vitest + Tailwind 4 in the frontend.

**Spec:** `docs/superpowers/specs/2026-11-15-mcp-connector-design.md`

## Global Constraints

- No compile step: the backend runs TypeScript through `tsx`. `npm run build` only runs `prisma generate`.
- Prisma client is generated into `backend/src/generated/prisma` and is gitignored; every schema change needs `npm run build` plus a committed migration.
- Migrations must be applied to the Neon database. If `*.neon.tech` does not resolve on this machine, generate SQL with `prisma migrate diff` and apply it from a network that resolves it; never reset the shared database.
- zod is v4 (`zod` 4.4.x); the MCP SDK accepts `^3.25 || ^4.0`, so no second zod install.
- Every data query is scoped by `userId`. No route, tool or helper accepts a user id from the caller.
- Plaintext tokens are never stored and never logged. Only SHA-256 hashes and a 12-character display prefix are persisted.
- `globalLimiter` stays 100 req/min. `/mcp` gets its own limiter; `/internal/*` sits before `globalLimiter` and is loopback-only.
- Backend tests: `npx tsx --test <file>` for one file, `npm test` for all (`src/**/*.test.ts`). DB-backed test files import `testEnv.ts` first, which requires `TEST_DATABASE_URL` and refuses to run when it equals `DATABASE_URL`. Frontend tests: `npx vitest run <file>`.
- Frontend build gate: `npm run build` and `npm run lint` in `frontend/`.
- No new frontend dependencies; `lucide-react` and `react-router-dom` are already installed.
- Existing response conventions: `{ success, message }` for `/api/*`; `{ error, error_description }` for `/oauth/*`.
- Commit after every task, one commit per task, message prefix `feat(mcp):` or `feat(settings):`.

## Review Focus

The spec's gaps most likely to bite a user, each pinned to the task that must test it:

1. **Partial edits destroying neighbours.** "Remove milk" must delete one todo; "add the work label" must not drop other labels. Pinned in Task 4 (single-todo delete) and Task 7 (label deltas).
2. **Credentials in bad states.** Revoked, expired, read-only, another user's token, and a token for a deleted user must all fail as 401/403 or `isError`, never 500 or a data leak. Pinned in Task 8.
3. **OAuth abuse inputs.** Mismatched `redirect_uri`, a reused code, `plain` PKCE, a wrong verifier, and a foreign `resource` must all be refused with `invalid_grant`/`invalid_request`. Pinned in Task 9.
4. **Notes outside the default view.** A trashed or archived note must still be readable by `get_note` and restorable, while staying out of default search results. Pinned in Task 4.
5. **Two writers at once.** Two `add_todos` calls in flight must both survive; no read-modify-write over the array-replacing `PUT /api/note/:noteId`. Pinned in Task 4.

## File Structure

```
backend/
  prisma/
    schema.prisma                       + four models, User back-relations
    migrations/<ts>_add_mcp_tokens/      new migration
  src/
    app.ts                              app construction only (listen removed)
    server.ts                           listen + graceful shutdown
    testEnv.ts                          test-time env defaults, imported first
    lib/
      mcpTokens.ts                      token generate/hash/parse, scopes, PKCE
      internalJwt.ts                    signInternalToken
      oauth.ts                          OAuth validators + code/token issue/rotate
    middlewares/
      internal.middleware.ts            loopback + shared-secret guard
    mcp/
      client.ts                         loopback API client for one user
      auth.ts                           credential → principal
      tools.ts                          eleven tools, annotations, projections
      http.ts                           /mcp router + per-request server
    routes/
      note.ts                           + four endpoints
      oauth.ts                          metadata, register, authorize, token, revoke
      mcpTokens.ts                      /api/mcp/tokens and /api/mcp/apps
    schemas/
      note.ts                           + appendTodosSchema, singleTodoUpdateSchema
frontend/
  src/
    api/mcpApi.ts                       token + connected-app calls
    lib/tokenDisplay.ts                 prefix/scope formatting (pure)
    pages/Settings.tsx                  /settings page
    routes/AppRoutes.tsx                + protected /settings route
    pages/Note.tsx                      + settings icon in the header row
```

## Task 1: Data model and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_mcp_tokens/migration.sql`

**Interfaces:**
- Produces: Prisma accessors `prisma.apiToken`, `prisma.oauthClient`, `prisma.oauthCode`, `prisma.oauthToken`; `User.apiTokens` and `User.oauthTokens` relations. Later tasks rely on these exact names and on the field lists below.

- [ ] **Step 1: Add the four models to `backend/prisma/schema.prisma`**

```prisma
model ApiToken {
  id         Int       @id @default(autoincrement())
  userId     Int
  name       String
  tokenHash  String    @unique
  prefix     String
  scopes     String[]
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model OauthClient {
  id           String   @id
  name         String
  redirectUris String[]
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime?
}

model OauthCode {
  id                  String   @id
  clientId            String
  userId              Int
  redirectUri         String
  scopes              String[]
  codeChallenge       String
  codeChallengeMethod String   @default("S256")
  resource            String?
  expiresAt           DateTime
  usedAt              DateTime?
  createdAt           DateTime @default(now())

  @@index([expiresAt])
}

model OauthToken {
  id               Int       @id @default(autoincrement())
  userId           Int
  clientId         String
  accessTokenHash  String    @unique
  refreshTokenHash String?   @unique
  scopes           String[]
  resource         String?
  accessExpiresAt  DateTime
  refreshExpiresAt DateTime?
  rotatedFromId    Int?
  revokedAt        DateTime?
  lastUsedAt       DateTime?
  createdAt        DateTime  @default(now())
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Add to `User`: `apiTokens ApiToken[]` and `oauthTokens OauthToken[]`.

**Test:** `npx prisma validate` and `npm run build` both pass.

- [ ] **Step 2: Verify the schema parses**

Run (in `backend/`): `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Create the migration — against the test branch, never production**

Run (in `backend/`), pointing Prisma at the Neon **test branch** (never the
database in `DATABASE_URL`):

```powershell
$env:DATABASE_URL = (Get-Content .env | Select-String '^TEST_DATABASE_URL=').Line.Split('=',2)[1].Trim('"')
npx prisma migrate dev --name add_mcp_tokens
```

Expected: a new `prisma/migrations/<timestamp>_add_mcp_tokens/migration.sql` with
four `CREATE TABLE` statements, and `Applied`. Then open a new shell so the
overridden `DATABASE_URL` does not leak into later commands.

Production stays untouched: `prisma migrate deploy` against the real
`DATABASE_URL` is a deploy-time step the owner runs deliberately.

If the database host does not resolve, generate the SQL offline instead and apply it later from a working network:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

- [ ] **Step 4: Regenerate the client and confirm the accessors**

Run (in `backend/`): `npm run build`
Expected: exit 0. `src/generated/prisma` now exports `ApiToken`, `OauthClient`, `OauthCode`, `OauthToken`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(mcp): add token, client, code and oauth token models"
```

---

## Task 2: Token, scope and PKCE helpers

**Files:**
- Create: `backend/src/lib/mcpTokens.ts`
- Test: `backend/src/lib/mcpTokens.test.ts`

**Interfaces:**
- Produces:
  - `type Scope = "notes:read" | "notes:write"`, `const READ_SCOPE`, `const WRITE_SCOPE`, `const ALL_SCOPES: readonly Scope[]`
  - `hashToken(token: string): string`
  - `generateToken(kind: "pat" | "access" | "refresh" | "code"): { token: string; hash: string; prefix: string }`
  - `readCredential(header: string | undefined): { type: "pat" | "oauth"; token: string } | null`
  - `hasScope(scopes: readonly string[], required: Scope): boolean`
  - `parseScopes(input: string | null | undefined): Scope[] | null`
  - `toBase64Url(input: Buffer): string`
  - `verifyPkce(verifier: string, challenge: string, method: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateToken, hashToken, readCredential, hasScope, parseScopes,
  toBase64Url, verifyPkce, READ_SCOPE, WRITE_SCOPE,
} from "./mcpTokens.js";

test("generateToken prefixes each kind and returns a sha256 hash", () => {
  const pat = generateToken("pat");
  assert.match(pat.token, /^nf_pat_[A-Za-z0-9_-]{43}$/);
  assert.equal(pat.hash, hashToken(pat.token));
  assert.match(pat.hash, /^[0-9a-f]{64}$/);
  assert.equal(pat.prefix, pat.token.slice(0, 12));
  assert.match(generateToken("access").token, /^nf_at_/);
  assert.match(generateToken("refresh").token, /^nf_rt_/);
  assert.match(generateToken("code").token, /^nf_code_/);
});

test("generateToken never repeats", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) seen.add(generateToken("pat").token);
  assert.equal(seen.size, 100);
});

test("readCredential reads Bearer tokens and identifies the kind", () => {
  assert.equal(readCredential(undefined), null);
  assert.equal(readCredential("Bearer "), null);
  assert.equal(readCredential("Bearer whatever"), null);
  assert.deepEqual(readCredential("Bearer nf_pat_abc"), { type: "pat", token: "nf_pat_abc" });
  assert.deepEqual(readCredential("bearer nf_at_abc"), { type: "oauth", token: "nf_at_abc" });
});

test("hasScope answers for both scopes and rejects unknown requests", () => {
  assert.equal(hasScope([READ_SCOPE], READ_SCOPE), true);
  assert.equal(hasScope([READ_SCOPE], WRITE_SCOPE), false);
  assert.equal(hasScope([READ_SCOPE, WRITE_SCOPE], WRITE_SCOPE), true);
  assert.equal(hasScope([], READ_SCOPE), false);
});

test("parseScopes accepts space- or comma-separated scopes and defaults to read", () => {
  assert.deepEqual(parseScopes(undefined), [READ_SCOPE]);
  assert.deepEqual(parseScopes(""), [READ_SCOPE]);
  assert.deepEqual(parseScopes("notes:read notes:write"), [READ_SCOPE, WRITE_SCOPE]);
  assert.deepEqual(parseScopes("notes:write,notes:read"), [READ_SCOPE, WRITE_SCOPE]);
  assert.deepEqual(parseScopes("notes:read notes:read"), [READ_SCOPE]);
  assert.equal(parseScopes("notes:read admin:everything"), null);
});

test("verifyPkce accepts the matching S256 verifier and nothing else", () => {
  const verifier = "a".repeat(43);
  const challenge = toBase64Url(
    createHash("sha256").update(verifier).digest(),
  );
  assert.equal(verifyPkce(verifier, challenge, "S256"), true);
  assert.equal(verifyPkce("b".repeat(43), challenge, "S256"), false);
  assert.equal(verifyPkce(verifier, challenge, "plain"), false);
  assert.equal(verifyPkce(verifier, challenge, ""), false);
  assert.equal(verifyPkce("", challenge, "S256"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (in `backend/`): `npx tsx --test src/lib/mcpTokens.test.ts`
Expected: FAIL — `Cannot find module './mcpTokens.js'`.

- [ ] **Step 3: Implement `backend/src/lib/mcpTokens.ts`**

Use `node:crypto` `randomBytes(32).toString("base64url")` for token bodies and `createHash("sha256").digest("hex")` for hashes. Prefixes: `nf_pat_`, `nf_at_`, `nf_rt_`, `nf_code_`. `readCredential` splits on one space, compares the scheme case-insensitively, and returns `null` for any token without a known prefix. `parseScopes` splits on `/[\s,]+/`, drops empties, dedupes, always adds `notes:read`, and returns `null` if any scope is outside `ALL_SCOPES`. `verifyPkce` returns `false` unless `method === "S256"`, both strings are non-empty, and the base64url SHA-256 of the verifier equals the challenge (use `timingSafeEqual` on equal-length buffers).

- [ ] **Step 4: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/lib/mcpTokens.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/mcpTokens.ts backend/src/lib/mcpTokens.test.ts
git commit -m "feat(mcp): add token, scope and pkce helpers"
```

---

## Task 3: App/server split and HTTP test harness

**Files:**
- Modify: `backend/src/app.ts` (remove `app.listen`, keep exporting `app`)
- Create: `backend/src/server.ts`
- Create: `backend/src/testEnv.ts`
- Create: `backend/src/app.test.ts`
- Modify: `backend/package.json` (`dev`, `start`)

**Interfaces:**
- Consumes: `app` default export from `app.ts`.
- Produces: importable `app` for supertest; `testEnv.ts` that sets `DATABASE_URL`/`JWT_SECRET` defaults when unset. Every HTTP test file imports `./testEnv.js` before importing `./app.js`.

- [ ] **Step 1: Write the failing test**

```ts
import "./testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "./app.js";

test("GET /health responds without listening on a port", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("unknown route returns the error envelope", async () => {
  const res = await request(app).get("/nope");
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `npx tsx --test src/app.test.ts`
Expected: FAIL — `supertest` is not installed.

- [ ] **Step 3: Install supertest and add `testEnv.ts`**

Run (in `backend/`): `npm i -D supertest @types/supertest`

```ts
// backend/src/testEnv.ts
import dotenv from "dotenv";

const parsed = dotenv.config().parsed ?? {};
const testUrl = process.env.TEST_DATABASE_URL ?? parsed.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Point it at a Neon test branch before running DB-backed tests.",
  );
}

if (testUrl === (process.env.DATABASE_URL ?? parsed.DATABASE_URL)) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
}

// The app reads DATABASE_URL at import time; force it onto the test branch so a
// stray shell variable or .env value can never send tests to production.
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET ??= "test-secret-not-for-production";
```

Import this first in every test file that touches the app or the database. It
deliberately throws rather than defaulting: a silent fallback to production is
the one failure this file exists to prevent.

- [ ] **Step 4: Split `app.ts` and create `server.ts`**

`app.ts` keeps everything it has today and ends with `export default app;`; delete the `const PORT` block and the `app.listen` call. `server.ts`:

```ts
import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
```

`package.json`: `"dev": "tsx watch src/server.ts"`, `"start": "tsx src/server.ts"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/app.test.ts`
Expected: PASS — 2 tests, and no "Server started at port" line.

- [ ] **Step 6: Confirm the dev server still boots and the suite still passes**

Run (in `backend/`): `npm test`
Expected: existing schema tests plus the two new ones pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/app.ts backend/src/server.ts backend/src/testEnv.ts backend/src/app.test.ts backend/package.json backend/package-lock.json
git commit -m "refactor: export app for tests and move listen into server.ts"
```

---

## Task 4: Note read, append and per-todo endpoints

**Files:**
- Modify: `backend/src/schemas/note.ts`
- Modify: `backend/src/routes/note.ts`
- Test: `backend/src/schemas/note.test.ts` (append offline cases)
- Create: `backend/src/routes/note.endpoints.test.ts`

**Interfaces:**
- Produces:
  - `appendTodosSchema` — `{ items: string[] }`, each trimmed 1–500 chars, 1–50 items.
  - `singleTodoUpdateSchema` — `{ text?: string, done?: boolean }`, at least one present.
  - `GET /api/note/:noteId` → `{ success: true, note }` including `todos` and `labels`, for a note in any state; 404 otherwise.
  - `POST /api/note/:noteId/todos` → `{ success: true, note }`; 400 `{ success: false, message: "Note is not a checklist" }` on a `PARAGRAPH` note; 404 when not owned.
  - `PUT /api/note/:noteId/todo/:todoId` → `{ success: true, note }`; 404 when the todo does not belong to that note.
  - `DELETE /api/note/:noteId/todo/:todoId` → `{ success: true, note }`; same 404 rule.

- [ ] **Step 1: Write the failing schema tests**

Append to `backend/src/schemas/note.test.ts`:

```ts
test("appendTodosSchema trims, bounds and rejects empty lists", () => {
  assert.deepEqual(appendTodosSchema.parse({ items: ["  milk  "] }), { items: ["milk"] });
  assert.equal(appendTodosSchema.safeParse({ items: [] }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: Array(51).fill("x") }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: ["x".repeat(501)] }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: ["   "] }).success, false);
});

test("singleTodoUpdateSchema requires text or done", () => {
  assert.equal(singleTodoUpdateSchema.safeParse({ done: true }).success, true);
  assert.equal(singleTodoUpdateSchema.safeParse({ text: "milk" }).success, true);
  assert.equal(singleTodoUpdateSchema.safeParse({}).success, false);
  assert.equal(singleTodoUpdateSchema.safeParse({ text: "" }).success, false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/schemas/note.test.ts`
Expected: FAIL — `appendTodosSchema is not defined`.

- [ ] **Step 3: Add the two schemas and export them**

Implement both exactly as described in Interfaces, above the existing exports.

- [ ] **Step 4: Run the schema tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/schemas/note.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing endpoint tests**

`backend/src/routes/note.endpoints.test.ts` — skipped unless `TEST_DATABASE_URL` is set:

```ts
import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";

const skip = !process.env.TEST_DATABASE_URL;
let userId: number;
let token: string;

test("setup", { skip }, async () => {
  const user = await prisma.user.create({ data: { email: `mcp${Date.now()}@test.dev`, username: "mcp", password: "x" } });
  userId = user.id;
  token = signToken(userId);
});

test("GET /api/note/:id returns a trashed note so it can be restored", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "PARAGRAPH", title: "Dentist", content: "Tuesday", deletedAt: new Date() } });
  const res = await request(app).get(`/api/note/${note.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.note.deletedAt !== null, true);
});

test("DELETE /api/note/:noteId/todo/:todoId removes exactly one todo", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "List" } });
  const [a, b] = await Promise.all([
    prisma.todo.create({ data: { noteId: note.id, text: "milk", order: 0 } }),
    prisma.todo.create({ data: { noteId: note.id, text: "eggs", order: 1 } }),
  ]);
  const res = await request(app).delete(`/api/note/${note.id}/todo/${a.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.note.todos.map((t: { id: number }) => t.id), [b.id]);
});

test("two concurrent appends both survive", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Concurrent" } });
  await Promise.all([
    request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["one"] }),
    request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["two"] }),
  ]);
  const todos = await prisma.todo.findMany({ where: { noteId: note.id } });
  assert.deepEqual(todos.map((t) => t.text).sort(), ["one", "two"]);
});

test("append on a paragraph note is refused", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "PARAGRAPH", title: "P", content: "x" } });
  const res = await request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["milk"] });
  assert.equal(res.status, 400);
});

test("another user's note is 404, not 403", { skip }, async () => {
  const other = await prisma.user.create({ data: { email: `other${Date.now()}@test.dev`, username: "other", password: "x" } });
  const note = await prisma.note.create({ data: { userId: other.id, type: "PARAGRAPH", title: "Secret", content: "x" } });
  const res = await request(app).get(`/api/note/${note.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 6: Run them to verify they fail**

Set `TEST_DATABASE_URL` to a Neon branch URL, then run (in `backend/`): `npx tsx --test src/routes/note.endpoints.test.ts`
Expected: FAIL — 404 on the new routes.

- [ ] **Step 7: Implement the four routes in `backend/src/routes/note.ts`**

- `GET /:noteId` — `prisma.note.findFirst({ where: { id, userId }, include: noteInclude })`, 404 when null. Must not filter on `archived` or `deletedAt`.
- `POST /:noteId/todos` — validate with `appendTodosSchema`; load the note by `{ id, userId }` with `_max` of todo order; 404 if missing; 400 unless `type === "CHECKBOX"`; `createMany` at `max + 1 …`; return the note with `noteInclude`.
- `PUT /:noteId/todo/:todoId` — validate with `singleTodoUpdateSchema`; `updateMany({ where: { id: todoId, noteId }, data })`; when `count === 0`, confirm the note exists to choose 404 vs 404; return the note with `noteInclude`.
- `DELETE /:noteId/todo/:todoId` — `deleteMany` with the same scoping; 404 when `count === 0`; return the note with `noteInclude`.

Place them beside the existing `PUT /:noteId` so the file stays in its current order: reads, create, delete, update, order, complete, permanent, empty trash, then the two new todo routes.

- [ ] **Step 8: Run the endpoint tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/routes/note.endpoints.test.ts`
Expected: PASS — 6 tests (all skipped when `TEST_DATABASE_URL` is unset).

- [ ] **Step 9: Commit**

```bash
git add backend/src/schemas/note.ts backend/src/schemas/note.test.ts backend/src/routes/note.ts backend/src/routes/note.endpoints.test.ts
git commit -m "feat(note): add single-note read and per-todo append, update and delete"
```

---

## Task 5: Internal JWT, loopback guard and `/internal` mount

**Files:**
- Create: `backend/src/lib/internalJwt.ts`
- Create: `backend/src/middlewares/internal.middleware.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/middlewares/internal.test.ts`

**Interfaces:**
- Produces:
  - `signInternalToken(userId: number): string` — `jwt.sign({ userId, internal: true }, JWT_SECRET, { expiresIn: "5m" })`.
  - `isLoopback(address: string | undefined): boolean` — true for `127.0.0.1`, `::1`, `::ffff:127.0.0.1`.
  - `internalOnly: RequestHandler` — 404 unless the socket is loopback **and** `X-NoteFlow-Internal` equals `MCP_INTERNAL_SECRET`; 404 when the env var is unset.
- Consumes: `noteRoutes`, `labelRoutes` (existing routers).

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isLoopback, internalOnly } from "./internal.middleware.js";

const fake = (socketAddress: string | undefined, header?: string) => {
  let nextCalled = false;
  let status = 0;
  const req = { socket: { remoteAddress: socketAddress }, get: (n: string) => (n === "x-noteflow-internal" ? header : undefined) } as any;
  const res = { status: (n: number) => { status = n; return res; }, end: () => res } as any;
  internalOnly(req, res, () => { nextCalled = true; });
  return { nextCalled, status };
};

test("isLoopback accepts only loopback forms", () => {
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("::1"), true);
  assert.equal(isLoopback("::ffff:127.0.0.1"), true);
  assert.equal(isLoopback("10.0.0.5"), false);
  assert.equal(isLoopback(undefined), false);
});

test("internalOnly fails closed without a secret", () => {
  delete process.env.MCP_INTERNAL_SECRET;
  assert.deepEqual(fake("127.0.0.1", "anything"), { nextCalled: false, status: 404 });
});

test("internalOnly requires loopback and the secret", () => {
  process.env.MCP_INTERNAL_SECRET = "s3cret";
  assert.equal(fake("127.0.0.1", "s3cret").nextCalled, true);
  assert.equal(fake("127.0.0.1", "wrong").status, 404);
  assert.equal(fake("10.0.0.5", "s3cret").status, 404);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `npx tsx --test src/middlewares/internal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the JWT helper and the middleware**

`signInternalToken` mirrors `lib/jwt.ts` exactly, adding `internal: true` and the short expiry. The middleware reads the header with `req.get("x-noteflow-internal")`, compares with a length-safe compare, and on any failure answers `res.status(404).end()` — 404 rather than 401 so the mount is invisible.

- [ ] **Step 4: Run the test to verify it passes**

Run (in `backend/`): `npx tsx --test src/middlewares/internal.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Mount the routers in `app.ts`**

Above `app.use(globalLimiter)`:

```ts
app.use("/internal/note", internalOnly, noteRoutes);
app.use("/internal/label", internalOnly, labelRoutes);
```

- [ ] **Step 6: Verify the mount is unreachable from outside**

Add `MCP_INTERNAL_SECRET="dev-secret"` to `backend/.env` first; without it the mount answers 404 to everything and every tool call would fail.

Run (in `backend/`): `npm run dev`, then in another shell:
`curl -i http://localhost:8080/internal/note`
Expected: `404` with no body (the socket is loopback but the header is missing).

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/internalJwt.ts backend/src/middlewares/internal.middleware.ts backend/src/middlewares/internal.test.ts backend/src/app.ts
git commit -m "feat(mcp): add loopback-only internal mount for tool calls"
```

---

## Task 6: MCP client and read tools

**Files:**
- Create: `backend/src/mcp/client.ts`
- Create: `backend/src/mcp/tools.ts`
- Test: `backend/src/mcp/tools.test.ts`
- Modify: `backend/package.json` (dependency)

**Interfaces:**
- Produces:
  - `interface ApiResponse { ok: boolean; status: number; data: any }`
  - `interface NoteFlowApi { get(path: string): Promise<ApiResponse>; post(path: string, body: unknown): Promise<ApiResponse>; put(path: string, body: unknown): Promise<ApiResponse>; del(path: string): Promise<ApiResponse> }`
  - `createApi(userId: number): NoteFlowApi` — base `http://127.0.0.1:${PORT}/internal`, `Authorization: Bearer ${signInternalToken(userId)}`, `X-NoteFlow-Internal: ${MCP_INTERNAL_SECRET}`.
  - `interface ToolContext { userId: number; scopes: readonly string[]; api: NoteFlowApi }`
  - `createServer(ctx: ToolContext): McpServer` — builds the server with the `instructions` string and registers the tools `toolNames` reports.
  - `toSearchResult(note: NoteRow): SearchResult` — the projection used by `search_notes`.
  - `registerReadTools(server: McpServer, ctx: ToolContext): void`
  - `toolNames(ctx: ToolContext): string[]` — read tools plus write tools when `notes:write` is present.

- [ ] **Step 1: Install the SDK**

Run (in `backend/`): `npm i @modelcontextprotocol/sdk`
Expected: `1.32.x` in `dependencies`.

- [ ] **Step 2: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { toSearchResult, toolNames } from "./tools.js";
import { READ_SCOPE, WRITE_SCOPE } from "../lib/mcpTokens.js";

const paragraph = {
  id: 12, title: "Dentist", type: "PARAGRAPH" as const,
  content: "x".repeat(400), labels: [{ id: 1, name: "Health", color: "#00FF00" }],
  archived: false, updatedAt: new Date("2026-11-01T10:00:00Z"),
};
const checklist = {
  id: 13, title: "Shopping", type: "CHECKBOX" as const,
  todos: [{ id: 1, text: "milk", done: false }, { id: 2, text: "eggs", done: true }],
  labels: [], archived: false, updatedAt: new Date("2026-11-01T10:00:00Z"),
};

test("toSearchResult truncates paragraph content at 200 chars", () => {
  const result = toSearchResult(paragraph as any);
  assert.equal(result.id, 12);
  assert.equal(result.snippet.length, 200);
  assert.equal(result.truncated, true);
});

test("toSearchResult summarises a checklist from its todo texts", () => {
  const result = toSearchResult(checklist as any);
  assert.equal(result.snippet, "milk · eggs");
  assert.equal(result.truncated, false);
});

test("toSearchResult leaves short content untruncated", () => {
  const result = toSearchResult({ ...paragraph, content: "short" } as any);
  assert.equal(result.snippet, "short");
  assert.equal(result.truncated, false);
});

test("toolNames reports only read tools for a read-only token", () => {
  const ctx = { userId: 1, scopes: [READ_SCOPE], api: {} as any };
  assert.deepEqual(toolNames(ctx), ["search_notes", "get_note", "list_labels"]);
});

test("toolNames still reports only read tools before the write tools exist", () => {
  // Task 7 registers the eight write tools and raises this to eleven.
  const ctx = { userId: 1, scopes: [READ_SCOPE, WRITE_SCOPE], api: {} as any };
  assert.deepEqual(toolNames(ctx), ["search_notes", "get_note", "list_labels"]);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/mcp/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `client.ts`**

Fetch-based, no axios: read `process.env.PORT ?? 8080`, POST/PUT bodies as JSON, parse JSON defensively (`.catch(() => null)`), return `{ ok, status, data }`, and never throw on non-2xx.

- [ ] **Step 5: Implement `tools.ts` with the three read tools**

`createServer` lives here too: `new McpServer({ name: "noteflow", version: "1.0.0" }, { instructions: "NoteFlow stores notes. Call search_notes before editing; note and todo ids are integers; never guess an id." })`.

Tool registrations use the SDK's `registerTool(name, { description, inputSchema, annotations }, handler)`, where `inputSchema` is a plain object of zod fields. Handlers return `{ content: [{ type: "text", text }], isError }` and stringify the wrapped payload.

- `search_notes`: `GET /note` with `search`, `page`, `limit`, `labelId`, and `archived`/`trashed` derived from `scope`; read `data.message` (`{ notes, total, page, hasMore }`); map with `toSearchResult`; `annotations: { readOnlyHint: true }`.
- `get_note`: `GET /note/:noteId`; `readOnlyHint: true`.
- `list_labels`: `GET /label`; `readOnlyHint: true`.

`toSearchResult` produces `{ id, title, type, snippet, truncated, labels, updatedAt }`; snippet is `content.slice(0, 200)` with `truncated = content.length > 200` for paragraphs, and `todos.map(t => t.text).join(" · ")` (truncated at 200 the same way) for checklists.

- [ ] **Step 6: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/mcp/tools.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/mcp/client.ts backend/src/mcp/tools.ts backend/src/mcp/tools.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(mcp): add loopback api client and read tools"
```

---

## Task 7: Write tools and label deltas

**Files:**
- Modify: `backend/src/mcp/tools.ts`
- Create: `backend/src/mcp/tools.write.test.ts`

**Interfaces:**
- Produces:
  - `resolveLabelIds(current: number[], args: { setLabelIds?: number[]; addLabelIds?: number[]; removeLabelIds?: number[] }): number[]`
  - `registerWriteTools(server: McpServer, ctx: ToolContext): void` — the eight write tools.
  - Tools: `create_note`, `create_checklist`, `add_todos`, `update_todo`, `remove_todo`, `update_note`, `delete_note`, `restore_note`.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveLabelIds } from "./tools.js";

test("addLabelIds keeps existing labels", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { addLabelIds: [3] }), [1, 2, 3]);
});

test("addLabelIds does not duplicate", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { addLabelIds: [2, 3] }), [1, 2, 3]);
});

test("removeLabelIds removes only what it names", () => {
  assert.deepEqual(resolveLabelIds([1, 2, 3], { removeLabelIds: [2] }), [1, 3]);
});

test("setLabelIds replaces the whole set", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { setLabelIds: [9] }), [9]);
  assert.deepEqual(resolveLabelIds([1, 2], { setLabelIds: [] }), []);
});

test("label modes are mutually exclusive", () => {
  assert.throws(() => resolveLabelIds([1], { setLabelIds: [2], addLabelIds: [3] }), /one label mode/);
  assert.throws(() => resolveLabelIds([1], { addLabelIds: [3], removeLabelIds: [1] }), /one label mode/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/mcp/tools.write.test.ts`
Expected: FAIL — `resolveLabelIds` is not exported.

- [ ] **Step 3: Implement `resolveLabelIds` and the eight write tools**

`resolveLabelIds` returns `current` unchanged when no mode is given, and throws `Error("Use exactly one label mode")` when more than one is supplied.

Each write handler starts with `if (!ctx.scopes.includes(WRITE_SCOPE)) return readOnlyError();` where `readOnlyError()` returns `{ content: [{ type: "text", text: "This token is read-only. Create a read-write token in NoteFlow settings." }], isError: true }`.

Behaviour per tool:
- `create_note` → `POST /note` `{ type: "PARAGRAPH", title, content, labelIds }`.
- `create_checklist` → `POST /note` `{ type: "CHECKBOX", title, todos: items, labelIds }`.
- `add_todos` → `POST /note/:noteId/todos` `{ items }`; on 400 surface the API message verbatim.
- `update_todo` → `PUT /note/:noteId/todo/:todoId`.
- `remove_todo` → `DELETE /note/:noteId/todo/:todoId`; `annotations: { destructiveHint: true }`.
- `update_note` → when a label mode is present, `GET /note/:noteId` first, compute `resolveLabelIds(currentLabelIds, args)`, then `PUT /note/:noteId` with `labelIds` plus the supplied scalar fields only.
- `delete_note` → `permanent === true` calls `DELETE /note/:noteId/permanent`, otherwise `DELETE /note/:noteId`; `annotations: { destructiveHint: true }`.
- `restore_note` → `PUT /note/:noteId` `{ deletedAt: null }`.

Every handler returns the note the API returned, plus one line naming what changed (e.g. `Removed "milk" from "Shopping".`).

- [ ] **Step 4: Wire `registerWriteTools` into `toolNames` and the server factory**

`toolNames` returns the three read names plus the eight write names when `notes:write` is in scope; the server factory registers only the tools `toolNames` reports. In `tools.test.ts`, replace the Task 6 assertion "toolNames still reports only read tools before the write tools exist" with the full eleven-name assertion below — the earlier test existed only because the write tools did not exist yet:

```ts
test("toolNames reports all eleven tools for a read-write token", () => {
  const ctx = { userId: 1, scopes: [READ_SCOPE, WRITE_SCOPE], api: {} as any };
  const names = toolNames(ctx);
  assert.equal(names.length, 11);
  assert.ok(names.includes("delete_note") && names.includes("restore_note"));
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/mcp/tools.write.test.ts src/mcp/tools.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/tools.ts backend/src/mcp/tools.write.test.ts
git commit -m "feat(mcp): add write tools with safe label deltas"
```

---

## Task 8: `/mcp` endpoint, credential resolution and limiter

**Files:**
- Create: `backend/src/mcp/auth.ts`
- Create: `backend/src/mcp/http.ts`
- Create: `backend/src/lib/publicUrl.ts`
- Modify: `backend/src/types/express.d.ts`
- Modify: `backend/src/middlewares/rateLimit.middleware.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/mcp/http.test.ts`

**Interfaces:**
- Produces:
  - `interface Principal { userId: number; scopes: string[]; via: "pat" | "oauth" }`
  - `resolvePrincipal(token: string): Promise<Principal | null>` — hashes the token, looks in `apiToken` then `oauthToken`, rejects revoked/expired, and updates `lastUsedAt`.
  - `mcpRouter: Router` — POST only; GET/DELETE answer `405` with `Allow: POST`.
  - `req.mcpPrincipal?: Principal` on the Express request type.
  - `mcpLimiter` in `rateLimit.middleware.ts`.
  - `mcpPublicUrl(): string` in `lib/publicUrl.ts` — `MCP_PUBLIC_URL` with trailing slash trimmed, falling back to `http://localhost:${PORT ?? 8080}`.
- Consumes: `createApi`, `createServer`, `toolNames`, `hasScope`.

- [ ] **Step 1: Write the failing tests**

DB-gated file:

```ts
import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { generateToken, READ_SCOPE, WRITE_SCOPE } from "../lib/mcpTokens.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const skip = !process.env.TEST_DATABASE_URL;
let baseUrl: string;
let server: import("node:http").Server;
let userId: number;
let pat: string;
let readOnlyPat: string;

test("start server", { skip }, async () => {
  const user = await prisma.user.create({ data: { email: `mcp${Date.now()}@test.dev`, username: "mcp", password: "x" } });
  userId = user.id;
  const full = generateToken("pat");
  const ro = generateToken("pat");
  await prisma.apiToken.create({ data: { userId, name: "full", tokenHash: full.hash, prefix: full.prefix, scopes: [READ_SCOPE, WRITE_SCOPE] } });
  await prisma.apiToken.create({ data: { userId, name: "ro", tokenHash: ro.hash, prefix: ro.prefix, scopes: [READ_SCOPE] } });
  pat = full.token;
  readOnlyPat = ro.token;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test("/mcp without a credential is 401 with resource metadata", { skip }, async () => {
  const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate") ?? "", /resource_metadata="https?:\/\/.+\/\.well-known\/oauth-protected-resource"/);
});

test("a revoked token is 401", { skip }, async () => {
  const revoked = generateToken("pat");
  await prisma.apiToken.create({ data: { userId, name: "gone", tokenHash: revoked.hash, prefix: revoked.prefix, scopes: [READ_SCOPE, WRITE_SCOPE], revokedAt: new Date() } });
  const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${revoked.token}` }, body: "{}" });
  assert.equal(res.status, 401);
});

test("a read-write PAT lists eleven tools", { skip }, async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: { authorization: `Bearer ${pat}` } } }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 11);
  const remove = tools.find((t) => t.name === "remove_todo");
  assert.equal(remove?.annotations?.destructiveHint, true);
  await client.close();
});

test("a read-only PAT lists only read tools", { skip }, async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: { authorization: `Bearer ${readOnlyPat}` } } }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_note", "list_labels", "search_notes"]);
  await client.close();
});

test("stop server", { skip }, async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
```

Declare `let server: import("node:http").Server;` beside `baseUrl` so the last test can close it.
```

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/mcp/http.test.ts`
Expected: FAIL — `/mcp` returns 404.

- [ ] **Step 3: Implement `auth.ts`**

`resolvePrincipal` hashes the presented string with `hashToken`, queries `prisma.apiToken.findUnique({ where: { tokenHash } })`, and on miss `prisma.oauthToken.findUnique({ where: { accessTokenHash } })`. Reject when `revokedAt` is set, when `oauthToken.accessExpiresAt` is past, or when the user no longer exists. Fire-and-forget `lastUsedAt` updates so a slow write cannot delay a tool call.

- [ ] **Step 4: Implement `http.ts`**

```ts
// shape, not a transcript
mcpRouter.post("/", async (req, res) => {
  const credential = readCredential(req.headers.authorization);
  const principal = credential ? await resolvePrincipal(credential.token) : null;
  if (!principal) return unauthorized(res);
  const server = createServer({ userId: principal.userId, scopes: principal.scopes, api: createApi(principal.userId) });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

`unauthorized` sends 401 with `WWW-Authenticate: Bearer resource_metadata="${mcpPublicUrl()}/.well-known/oauth-protected-resource"`. Create `lib/publicUrl.ts` first (env value trimmed of trailing slashes, localhost fallback), since the OAuth metadata documents in Task 9 reuse it. GET and DELETE answer `405` with `Allow: POST`. Wrap the handler in try/catch that answers JSON-RPC `-32603` instead of crashing the process.

- [ ] **Step 5: Add `mcpLimiter` and mount the router**

```ts
export const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  keyGenerator: (req) =>
    req.headers.authorization ? hashToken(req.headers.authorization.split(" ")[1] ?? "") : ipKeyGenerator(req.ip ?? ""),
});
```

In `app.ts`, above `globalLimiter`: `app.use("/mcp", mcpLimiter, mcpRouter);` and add `mcpPrincipal?: Principal` to `types/express.d.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/mcp/http.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/mcp/auth.ts backend/src/mcp/http.ts backend/src/mcp/http.test.ts backend/src/middlewares/rateLimit.middleware.ts backend/src/types/express.d.ts backend/src/app.ts
git commit -m "feat(mcp): serve stateless MCP over http with pat auth"
```

---

## Task 9: OAuth server

**Files:**
- Create: `backend/src/lib/oauth.ts`
- Create: `backend/src/routes/oauth.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/lib/oauth.test.ts`
- Test: `backend/src/routes/oauth.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedRedirectUri(uri: string): boolean` — `https://` anywhere, or `http://` only for `localhost`/`127.0.0.1`.
  - `parseAuthorizeRequest(query: Record<string, unknown>): { ok: true; value: AuthorizeRequest } | { ok: false; error: string; error_description: string }`
  - `checkResource(resource: string | undefined, expected: string): boolean` — true when omitted, true when equal after trailing-slash trim.
  - `oauthError(code: string, description: string)` — `{ error, error_description }`.
  - `issueTokens(userId, clientId, scopes, resource): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>`
  - `rotateRefresh(refreshToken: string): Promise<...>` — revokes the family on reuse.
- Consumes: `mcpPublicUrl()` (Task 8), `generateToken`, `hashToken`, `verifyPkce`, `parseScopes`.
- Routes: `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-authorization-server`, `POST /oauth/register`, `GET|POST /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`.

- [ ] **Step 1: Write the failing pure tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedRedirectUri, checkResource, parseAuthorizeRequest } from "./oauth.js";

test("redirect uris allow https and localhost http only", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:33418/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8080/cb"), true);
  assert.equal(isAllowedRedirectUri("http://evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("notaurl"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
});

test("resource binding accepts omission and exact matches only", () => {
  assert.equal(checkResource(undefined, "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://nf.dev/mcp", "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://nf.dev/mcp/", "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://other.dev/mcp", "https://nf.dev/mcp"), false);
});

test("authorize params require code flow and S256", () => {
  const base = { client_id: "c1", redirect_uri: "https://claude.ai/cb", response_type: "code", code_challenge: "abc", code_challenge_method: "S256" };
  assert.equal(parseAuthorizeRequest(base).ok, true);
  assert.deepEqual(parseAuthorizeRequest({ ...base, response_type: "token" }), { ok: false, error: "unsupported_response_type", error_description: "Only response_type=code is supported" });
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge_method: "plain" }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge: "" }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, client_id: "" }).ok, false);
  assert.deepEqual(parseAuthorizeRequest({ ...base, scope: "notes:read admin" }), { ok: false, error: "invalid_scope", error_description: "Unknown scope" });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/lib/oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers in `lib/oauth.ts`**

`parseAuthorizeRequest` returns `scope` defaults via `parseScopes` and echoes `state` untouched. Rejections use the exact `error` strings in the tests.

- [ ] **Step 4: Run the pure tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/lib/oauth.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the failing route tests**

DB-gated, importing `./../testEnv.js` and starting `app.listen(0)` as in Task 8. The core of the file:

```ts
test("register → authorize → token yields a working access token", { skip }, async () => {
  const verifier = "v".repeat(43);
  const challenge = toBase64Url(createHash("sha256").update(verifier).digest());
  const reg = await request(baseUrl).post("/oauth/register").send({ client_name: "test", redirect_uris: ["http://localhost:9999/cb"] });
  const clientId = reg.body.client_id;

  const approve = await request(baseUrl).post("/oauth/authorize").type("form").send({
    client_id: clientId, redirect_uri: "http://localhost:9999/cb", response_type: "code",
    code_challenge: challenge, code_challenge_method: "S256", scope: "notes:read notes:write",
    state: "xyz", email, password: "Password1!", decision: "allow",
  });
  assert.equal(approve.status, 302);
  const code = new URL(approve.headers.location!).searchParams.get("code")!;
  assert.equal(new URL(approve.headers.location!).searchParams.get("state"), "xyz");

  const tok = await request(baseUrl).post("/oauth/token").type("form").send({
    grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: "http://localhost:9999/cb",
  });
  assert.equal(tok.status, 200);
  assert.match(tok.body.access_token, /^nf_at_/);

  // replaying the same code is refused
  const again = await request(baseUrl).post("/oauth/token").type("form").send({
    grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: "http://localhost:9999/cb",
  });
  assert.equal(again.body.error, "invalid_grant");
});

test("a wrong verifier is invalid_grant", { skip }, async () => { /* same flow, exchange with "w".repeat(43) */ });
test("refresh rotation kills the old refresh token", { skip }, async () => { /* exchange, then rotate twice with the first refresh token */ });
test("a mismatched redirect_uri is invalid_request", { skip }, async () => { /* approve with a uri the client never registered */ });
test("a google-only account is invalid_grant with no hint", { skip }, async () => { /* user with password: null */ });
```

Set up a shared user in a `start server` test with `password: await bcrypt.hash("Password1!", 10)`, and close the server in a final test (same pattern as Task 8).

- [ ] **Step 6: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/routes/oauth.test.ts`
Expected: FAIL — 404 on `/oauth/token`.

- [ ] **Step 7: Implement `routes/oauth.ts` and mount it**

- Metadata documents are literal JSON built from `mcpPublicUrl()`; include `code_challenge_methods_supported: ["S256"]` and `token_endpoint_auth_methods_supported: ["none"]`.
- `/oauth/register` accepts `{ client_name, redirect_uris }`, rejects any URI failing `isAllowedRedirectUri`, stores an `OauthClient` with a crypto-random id, returns `{ client_id, redirect_uris, token_endpoint_auth_method: "none" }`.
- `GET /oauth/authorize` validates params, then renders a single self-contained HTML form (inline `<style>`, no scripts) posting back to the same URL with hidden fields for every validated parameter plus `email`, `password` and `decision`. Unknown `client_id` or unregistered `redirect_uri` renders an error page instead of redirecting.
- `POST /oauth/authorize` re-validates, checks the client's `redirectUris` contains the exact `redirect_uri`, looks up the user with `bcrypt.compare`, and on success stores an `OauthCode` (60 s, `id = generateToken("code").token`) then `302`s to `redirect_uri?code=…&state=…`. On failure it re-renders the form with `Invalid email or password.` and does not reveal account state. `decision=deny` redirects with `error=access_denied`.
- `POST /oauth/token` handles `authorization_code` (single-use code, exact `redirect_uri`, `verifyPkce`, expiry) and `refresh_token` (rotate, reuse detection revokes the family). Errors are RFC 6749 bodies.
- `POST /oauth/revoke` sets `revokedAt` for the token matching the presented hash, and always answers 200.
- Mount in `app.ts`, before `globalLimiter`: the two `.well-known` GETs, then `app.use("/oauth", oauthRoutes)`. Add `app.use(express.urlencoded({ extended: false, limit: "10kb" }))` next to `express.json()`.

- [ ] **Step 8: Run the route tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/routes/oauth.test.ts`
Expected: PASS.

- [ ] **Step 9: Probe the endpoints by hand**

Run (in `backend/`): `npm run dev`, then:

```bash
curl -s http://localhost:8080/.well-known/oauth-protected-resource
curl -s -X POST http://localhost:8080/oauth/register -H "content-type: application/json" -d "{\"client_name\":\"curl\",\"redirect_uris\":[\"http://localhost:9999/cb\"]}"
```

Expected: JSON documents with `authorization_servers`/`code_challenge_methods_supported`, and a `client_id` in the second.

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib/oauth.ts backend/src/routes/oauth.ts backend/src/lib/oauth.test.ts backend/src/routes/oauth.test.ts backend/src/app.ts
git commit -m "feat(mcp): add oauth server with dcr, pkce and refresh rotation"
```

---

## Task 10: Personal access token API

**Files:**
- Create: `backend/src/routes/mcpTokens.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/mcpTokens.test.ts`

**Interfaces:**
- Produces (all `authMiddleware`, mounted at `/api/mcp`):
  - `GET /tokens` → `{ success: true, tokens: [{ id, name, prefix, scopes, lastUsedAt, createdAt }] }`, revoked rows excluded.
  - `POST /tokens` body `{ name: string, scopes?: ("notes:read"|"notes:write")[] }` → `{ success: true, token: "nf_pat_…", apiToken: { id, name, prefix, scopes, createdAt } }`, plaintext returned once.
  - `DELETE /tokens/:id` → `{ success: true }`; 404 when not owned.

- [ ] **Step 1: Write the failing tests**

DB-gated, with the user and JWT created as in Task 4:

```ts
test("creating a token returns plaintext once and stores only its hash", { skip }, async () => {
  const res = await request(app).post("/api/mcp/tokens").set("Authorization", `Bearer ${token}`).send({ name: "opencode", scopes: ["notes:read", "notes:write"] });
  assert.equal(res.status, 200);
  assert.match(res.body.token, /^nf_pat_/);
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(res.body.token) } });
  assert.equal(row?.prefix, res.body.token.slice(0, 12));

  const list = await request(app).get("/api/mcp/tokens").set("Authorization", `Bearer ${token}`);
  assert.equal(list.body.tokens.length, 1);
  assert.equal(list.body.tokens[0].token, undefined);
});

test("revoking another user's token is 404", { skip }, async () => { /* create a row for a second user, DELETE it, expect 404 */ });
test("a revoked token stops working at /mcp", { skip }, async () => { /* create, revoke, then POST /mcp → 401 */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/routes/mcpTokens.test.ts`
Expected: FAIL — 404 on `/api/mcp/tokens`.

- [ ] **Step 3: Implement the routes**

Validate `name` as trimmed 1–50 chars and `scopes` through `parseScopes` with a minimum of `["notes:read"]`; default to read-write when omitted. Reuse `generateToken("pat")`. Mount `app.use("/api/mcp", mcpTokenRoutes)` beside the other `/api` mounts.

- [ ] **Step 4: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/routes/mcpTokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/mcpTokens.ts backend/src/routes/mcpTokens.test.ts backend/src/app.ts
git commit -m "feat(mcp): add personal access token endpoints"
```

---

## Task 11: Frontend settings page and header icon

**Files:**
- Create: `frontend/src/api/mcpApi.ts`
- Create: `frontend/src/lib/tokenDisplay.ts`
- Test: `frontend/src/lib/tokenDisplay.test.ts`
- Create: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/routes/AppRoutes.tsx`
- Modify: `frontend/src/pages/Note.tsx:1,432-448`

**Interfaces:**
- Produces:
  - `interface ApiToken { id: number; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string }`
  - `getTokens(): Promise<ApiToken[]>`, `createToken(input: { name: string; scopes: string[] }): Promise<{ token: string; apiToken: ApiToken }>`, `revokeToken(id: number): Promise<void>`
  - `formatLastUsed(iso: string | null): string` — `"Never used"`, `"Used 5 minutes ago"`, `"Used 3 days ago"`.
  - `scopeSummary(scopes: string[]): string` — `"Read only"` or `"Read and write"`.
  - `/settings` route inside `<Route element={<ProtectedRoutes />}>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { formatLastUsed, scopeSummary } from "./tokenDisplay";

describe("formatLastUsed", () => {
  it("handles a never-used token and human ranges", () => {
    expect(formatLastUsed(null)).toBe("Never used");
    const now = new Date("2026-11-15T12:00:00Z");
    expect(formatLastUsed("2026-11-15T11:55:00Z", now)).toBe("Used 5 minutes ago");
    expect(formatLastUsed("2026-11-12T12:00:00Z", now)).toBe("Used 3 days ago");
  });
});

describe("scopeSummary", () => {
  it("explains write access", () => {
    expect(scopeSummary(["notes:read"])).toBe("Read only");
    expect(scopeSummary(["notes:read", "notes:write"])).toBe("Read and write");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `frontend/`): `npx vitest run src/lib/tokenDisplay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tokenDisplay.ts` and `mcpApi.ts`**

`formatLastUsed(iso, now = new Date())` buckets by minutes/hours/days. `mcpApi` follows `labelApi.ts` exactly: `api.get("/mcp/tokens")`, throw `new Error(data.message)` when `!data.success`.

- [ ] **Step 4: Run the test to verify it passes**

Run (in `frontend/`): `npx vitest run src/lib/tokenDisplay.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Build the settings page**

`Settings.tsx` renders its own slim header (back link to `/note`, `Settings` title, theme toggle using `useTheme`), then the AI access section: an explanatory paragraph, a "Create token" button opening a small modal (name input, read-only/read-write radio), a one-time reveal panel with the token in a `<code>` block plus a Copy button and the line "You won't see this token again.", and a table of tokens (name, prefix, scopes via `scopeSummary`, `formatLastUsed`, Revoke with the repo's `ConfirmModal`). Empty state explains tokens versus connectors in two sentences. Style with the existing tokens (`bg-surface`, `border-border`, `text-muted-foreground`) as `PrivacyPolicy.tsx` and `Sidebar.tsx` do.

- [ ] **Step 6: Wire the route and the icon**

`AppRoutes.tsx`: add `<Route path="/settings" element={<Settings />} />` inside the existing `ProtectedRoutes` block.
`Note.tsx`: import `Settings` from `lucide-react` and `useNavigate` from `react-router-dom`, add `const navigate = useNavigate();`, and add the button after the theme toggle in the `ml-auto` row:

```tsx
<button
  onClick={() => navigate("/settings")}
  className="text-muted hover:text-foreground transition-colors"
  aria-label="Settings"
  title="Settings"
>
  <Settings size={19} />
</button>
```

- [ ] **Step 7: Verify the frontend builds and lints**

Run (in `frontend/`): `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Verify by hand**

With both dev servers running: sign in, click the new gear, create a read-write token, copy it, reload the page, confirm the token is gone from the UI but listed with its prefix, revoke it, and confirm the row disappears.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/mcpApi.ts frontend/src/lib/tokenDisplay.ts frontend/src/lib/tokenDisplay.test.ts frontend/src/pages/Settings.tsx frontend/src/routes/AppRoutes.tsx frontend/src/pages/Note.tsx
git commit -m "feat(settings): add ai access page with personal access tokens"
```

---

## Task 12: Connected apps API and UI

**Files:**
- Modify: `backend/src/routes/mcpTokens.ts`
- Test: `backend/src/routes/mcpTokens.test.ts`
- Modify: `frontend/src/api/mcpApi.ts`
- Modify: `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Produces:
  - `GET /api/mcp/apps` → `{ success: true, apps: [{ clientId, name, scopes, lastUsedAt }] }` — one row per client with a live token for this user.
  - `DELETE /api/mcp/apps/:clientId` → `{ success: true, revoked: number }` — sets `revokedAt` on every token for that user and client.
  - `interface ConnectedApp { clientId: string; name: string; scopes: string[]; lastUsedAt: string | null }`, `getApps()`, `revokeApp(clientId)`.

- [ ] **Step 1: Write the failing tests**

DB-gated: insert an `OauthToken` for a client and assert `GET /api/mcp/apps` lists it with the client's name; `DELETE` then makes that access token 401 at `/mcp`; a client of another user is not listed and cannot be revoked (404).

- [ ] **Step 2: Run them to verify they fail**

Run (in `backend/`): `npx tsx --test src/routes/mcpTokens.test.ts`
Expected: FAIL — 404 on `/api/mcp/apps`.

- [ ] **Step 3: Implement the two routes**

Group tokens by `clientId` with `prisma.oauthToken.findMany({ where: { userId, revokedAt: null } })`, join names from `prisma.oauthClient.findMany({ where: { id: { in: ids } } })`, and take the latest `lastUsedAt` per client.

- [ ] **Step 4: Run the tests to verify they pass**

Run (in `backend/`): `npx tsx --test src/routes/mcpTokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the connected-apps list to `Settings.tsx`**

Below the token table: heading "Connected apps", one row per app (name, `scopeSummary`, `formatLastUsed`, Revoke), and an empty state ("No apps connected yet. Add the NoteFlow connector in ChatGPT or Claude.").

- [ ] **Step 6: Verify the frontend builds and lints**

Run (in `frontend/`): `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/mcpTokens.ts backend/src/routes/mcpTokens.test.ts frontend/src/api/mcpApi.ts frontend/src/pages/Settings.tsx
git commit -m "feat(settings): list and revoke connected apps"
```

---

## Task 13: Documentation, env example and end-to-end verification

**Files:**
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-11-15-mcp-connector-design.md` (status line only)

**Interfaces:** none.

- [ ] **Step 1: Add the two env vars**

Append to `backend/.env.example`:

```bash
# MCP connector
# Public origin of this backend, used in OAuth discovery documents.
MCP_PUBLIC_URL="http://localhost:8080"
# Shared secret between the API and its loopback-only /internal mount.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MCP_INTERNAL_SECRET=""
# Neon test branch used by DB-backed tests. Must differ from DATABASE_URL.
TEST_DATABASE_URL=""
```

- [ ] **Step 2: Write the README section**

Add an "AI connectors (MCP)" section after "API reference": what the connector is in two sentences; the endpoint `/mcp`; a table of the eleven tools; the two connection paths with copy-pasteable config:

```json
{ "mcp": { "noteflow": { "type": "remote", "url": "https://<host>/mcp", "headers": { "Authorization": "Bearer nf_pat_..." }, "enabled": true } } }
```

```bash
claude mcp add --transport http noteflow https://<host>/mcp --header "Authorization: Bearer nf_pat_..."
npx mcp-remote https://<host>/mcp --header "Authorization: Bearer nf_pat_..."   # stdio-only clients
```

plus claude.ai/ChatGPT connector instructions (URL only, OAuth prompts on first use) and how to revoke in Settings → AI access.

- [ ] **Step 3: Verify the full suite and both builds**

Run (in `backend/`): `npm test` → all pass.
Run (in `frontend/`): `npm run build` and `npm run lint` → exit 0.

- [ ] **Step 4: Run the end-to-end checklist**

From the spec's Verification section, on the deployed Railway backend:

- MCP Inspector lists 11 tools with a read-write PAT and 3 with a read-only one.
- OpenCode: "add milk to my shopping list" appends; "remove milk" removes only that item.
- Claude Code: "delete the dentist note" trashes it; `restore_note` restores it.
- claude.ai custom connector completes OAuth; a second connection reuses the grant; revoking fails the next call with 401.
- ChatGPT developer mode shows destructive confirmation for `delete_note` and completes OAuth.
- Restarting the backend requires no client reconnect.

- [ ] **Step 5: Mark the spec implemented and commit**

Change the spec's `Status:` line to `implemented`, then:

```bash
git add backend/.env.example README.md docs/superpowers/specs/2026-11-15-mcp-connector-design.md
git commit -m "docs: document the mcp connector and how to connect clients"
```

---

## Self-Review

- **Spec coverage:** every D-decision maps to a task — D1/D6 → Tasks 3, 8; D2 → 5; D3 → 2, 8; D4 → 4; D5 → 6, 7; D7 → 8; D8/D12 → 9; D9 → 11; D10 → 9, 13; D11 → enforced by the tool list in Task 7. Data model → 1. Endpoints table → 4, 8, 9, 10, 12. Frontend → 11, 12. Security → 2, 5, 8, 9, 10. Client wiring → 13.
- **Review Focus:** all five have tests — Task 4 (two tests), Task 7 (five), Task 8 (five), Task 9 (route suite), Task 10/12 (cross-user).
- **Type consistency:** `ToolContext`, `Principal`, `ApiResponse`, `NoteFlowApi`, `resolveLabelIds`, `hashToken`, `parseScopes` and `mcpPublicUrl` are used with the same names in every task that touches them.
