# MCP connector for NoteFlow — design

Date: 2026-11-15
Status: awaiting approval

## What this is, in plain language

Read this section once; the rest of the document assumes it.

**MCP (Model Context Protocol)** is a standard way for an AI app to use your
server. Instead of the model writing HTTP requests by hand, your server publishes
a list of **tools** — named functions with a typed input description — and the AI
client asks for that list, then calls the tools it needs. Your code runs; the
model just picks arguments. One MCP server therefore works in ChatGPT, claude.ai,
Claude Code, OpenCode and Claude Desktop without a per-client integration.

A **transport** is just how the bytes travel. There are two:

- **stdio** — the client launches your program as a child process and talks over
  stdin/stdout. Only works for apps on the same machine.
- **Streamable HTTP** — a single HTTPS endpoint the client POSTs to. This is the
  only transport claude.ai and ChatGPT can use, because they live in the cloud and
  reach you over the internet.

This design builds only the HTTP one. Every client we care about speaks it
directly today; for any client that only speaks stdio, `npx mcp-remote <url>`
wraps ours (D1).

**A token** is a long random string your server issues that stands in for a
password on every call. Never send the password; send the token. Ours come in two
flavours:

- **Personal access token (PAT)** — you click "create" in NoteFlow settings, copy
  the string once into an OpenCode config file, and it works until you revoke it.
  Best for tools on your own machine.
- **OAuth access token** — short-lived (one hour), issued automatically during the
  login dance below. ChatGPT and claude.ai can only use this kind, because they
  will not accept a pasted static string. A **refresh token** is the companion
  long-lived string that buys a new access token without asking you to log in
  again.

**OAuth 2.1 "authorization code" flow** is that dance:

1. You add the connector in ChatGPT. It calls `/mcp`, gets a 401, and is told
   where the authorization server lives.
2. A browser tab opens on your server's `/oauth/authorize` page. You log in there
   — on *your* domain, so ChatGPT never sees your password.
3. Your server redirects the browser back to ChatGPT with a one-time **code** in
   the URL.
4. ChatGPT's backend swaps that code for tokens at `/oauth/token`, server to
   server.

The code is single-use and short-lived, so a leaked URL is not a leaked account.

**PKCE, S256** (Proof Key for Code Exchange) closes the remaining hole: a desktop
or mobile client cannot keep a client secret, so anyone who intercepts that code
in the redirect could redeem it. With PKCE the client first invents a random
string — the `code_verifier` — and sends only its SHA-256 hash, base64url-encoded,
as the `code_challenge` when the flow starts. When redeeming the code it sends the
original verifier; your server hashes it and compares. An intercepted code is
useless without the verifier the client never transmitted. **S256** is that
SHA-256 variant; `plain` exists and must not be used.

**Dynamic client registration (DCR)** exists because nobody has pre-registered
ChatGPT or Claude as an OAuth client of NoteFlow. The client POSTs its name and
redirect URL to `/oauth/register` and gets a `client_id` on the spot.

**Scopes** are the permissions a token carries: here `notes:read` and
`notes:write`. The consent screen shows them, a read-only token does not see write
tools at all, and a write call with a read-only token is refused.

## The two flows, in order

**Local CLI client (OpenCode, Claude Code).** You create a PAT in settings; the
server stores only its hash and shows the string once. You paste it into the
client's config. Every tool call is one HTTPS request to `/mcp` with
`Authorization: Bearer nf_pat_…`; the gate hashes it, finds the `ApiToken` row,
resolves `userId`, and the tool runs. No browser, no refresh, no session. Revoking
the row makes the next call 401.

**Cloud client (claude.ai, ChatGPT).** The client POSTs to `/mcp` with no
credential and gets a 401 whose `WWW-Authenticate` header names the protected
resource metadata. It reads that document, then the authorization-server
metadata, registers itself through DCR, and opens your browser at
`/oauth/authorize`, where *your* page takes the email and password. Your server
redirects the browser back to the client with a one-time code; the client
exchanges code + `code_verifier` for an access token (1 h) and refresh token
(30 d) server-to-server. From then on every tool call is `Bearer nf_at_…`,
server-to-server; the browser is not involved again. The user's password is only
ever typed on the NoteFlow page, never sent to the chat provider.

## Intent and why

NoteFlow is usable from its own web app and by voice. The owner wants to create
and update notes and todos from the chat product already open — ChatGPT, claude.ai,
Claude Code, OpenCode — without switching tabs or teaching each client a bespoke
integration. An MCP server is the only interface all of those clients speak, and
it is a genuine second client of the API, not a one-off script.

Success: "add eggs and milk to my shopping list" said to ChatGPT updates the same
checklist the voice button would have; "what did I note about the dentist" in
Claude Code returns it; a PAT in OpenCode does the same without a browser.

## Goals

- Eleven tools covering the note and todo operations a chat assistant realistically
  performs: find, read, create, append, edit, complete, remove, delete, restore,
  labels.
- Works in ChatGPT (developer mode), claude.ai / Claude Desktop (custom
  connector), Claude Code and OpenCode.
- Per-user accounts: any NoteFlow user can connect their own account; a token sees
  only that user's notes.
- Two credential types: PATs for local tools, OAuth for cloud clients.
- Revocable from NoteFlow settings, effective immediately.
- Tool results small enough that a chat model can read several without drowning.

## Non-goals

- Voice or audio through MCP. Transcription stays a browser feature.
- A second stdio implementation of the tools (see D1).
- Note reordering, newsletter, password reset, or the onboarding guide as tools.
- MCP *resources*, *prompts*, or sampling. Tools only.
- A marketplace/directory listing of the connector.
- Shared or team workspaces; every token is one user.
- Google sign-in on the OAuth consent page (email + password first).
- Offline or batch sync; every tool call is one live API call.

## Anti-goals

What would make this a failure even if it technically works:

- **A leaked link that reads your notes.** A secret URL with no auth is not an
  acceptable trade for saving a day.
- **Wrong-note edits.** A model that guesses a note id and silently edits the
  wrong note destroys trust in every note. Search must be the documented first
  step, ids must always be returned, and edits must name what they touched.
- **Silent data loss on a plausible sentence.** "Add the work label" or "remove
  milk from my list" must not rewrite parts of the note nobody asked about.
- **A tool list the model cannot use.** Fifteen near-duplicate tools make the
  model pick the wrong one. Few, distinct, described in the model's vocabulary.
- **Tokens that outlive their revocation.** "Revoked" must mean the next call
  fails, not the next restart.
- **A second, divergent copy of note logic.** The chat path must not be able to
  create a note the web app cannot read.
- **Deleting silently.** Hard delete must be an explicit second step.

## Constraints

- Express 5, TypeScript run directly by `tsx`, no compile step. Prisma 7 with the
  `prisma-client` generator into `backend/src/generated/prisma` (gitignored);
  schema changes need `npm run build` plus a migration applied to Neon.
- One Postgres database shared with the deployed app.
- Existing auth is a 7-day JWT (`signToken` → `authMiddleware`) carrying only
  `userId`. There is no session, cookie, or role.
- `globalLimiter` is 100 requests/minute per IP across the whole app.
- `express.json()` is the only body parser in `app.ts`. It is enough for `/mcp`,
  which takes the parsed JSON body, and **not** enough for OAuth (D6).
- `PUT /api/note/:noteId` deletes every todo missing from an incoming `todos`
  array, so it cannot be used to change or remove one todo in isolation.
- `PUT /api/note/:noteId` accepts `deletedAt: null`, which is the restore path; no
  separate restore route is needed.
- `GET /api/note` returns full `content`/`todos` for every note, wrapped as
  `{ success, message: { notes, total, page, hasMore } }`. There is no single-note
  read: no `GET /api/note/:noteId` exists (D4).
- `app.ts` calls `app.listen` at import time, so nothing can import the app in a
  test without binding a port (V5).
- Backend tests are `tsx --test "src/**/*.test.ts"`; the only two today are pure
  zod assertions, with no HTTP layer and no test database.
- `User.password` is nullable: Google-only accounts cannot sign in with a password.
- The frontend has no settings page or settings route; the only navigation is
  `NotePage/Sidebar.tsx` (D9).
- `@modelcontextprotocol/sdk` 1.32 accepts zod v3 or v4, so the repo's zod 4 is
  fine.

## Approaches considered

**A. Connector shape: stdio-only.** Half a day, no hosting, no auth — and useless
for ChatGPT and claude.ai, which are half the request. Rejected.

**B. Connector shape: two transports, each with its own credential path.** The
obvious "one shared tool module, two entrypoints" design looks tidy, but stdio has
no HTTP gate to resolve a PAT into a `userId`, so it needs a *second* client mode
(mint a JWT locally, or call the public API with something the API does not
accept). Two credential paths, two failure modes, one of them untested by the
other. Rejected.

**C. Connector shape: Streamable HTTP only; `npx mcp-remote` for stdio-only
clients — chosen.** One tool implementation, one credential path, one gate. Every
named client (ChatGPT, claude.ai, Claude Desktop, Claude Code, OpenCode) speaks
remote HTTP today; anything that does not can be wrapped by an existing package
instead of by our code.

**D. Tools talk to Prisma directly.** Fastest to write and immediately a fork of
the logic in `routes/note.ts` (ordering, todo sync, label ownership, archive
rules). A bug there produces notes the web app cannot read — an anti-goal.
Rejected.

**E. Extract a `services/noteService.ts`, call it from both routes and tools.** The
cleanest long-term shape, and a 590-line refactor of working code in the same
change that adds OAuth. Rejected for v1; revisit once the tool surface settles.

**F. Tools call the existing REST routes over the loopback interface — chosen.** One
source of truth, no refactor, validation and ownership checks unchanged. Costs one
in-process hop and the four small endpoints in D4. The REST API is already the
contract the frontend and Postman collection use.

**G. Auth: unguessable URL, no auth.** Zero work, and anyone with the link reads
the account's notes forever. Rejected against the first anti-goal.

**H. Auth: PAT only, plus a static header in the connector.** ChatGPT cannot send
a static `Authorization` header, so it cannot be covered; claude.ai needs OAuth or
a manually entered client credential. PAT-only would still leave half the clients
out. Rejected as the whole answer.

**I. Auth: PATs for local tools + OAuth 2.1 for cloud clients — chosen.** Each
credential is the cheapest one that works for that client, both resolve to a
`userId` at the same `/mcp` gate, and both are revoked from one place.

**J. Undo via the existing `undoToken`.** `undoStore` is an in-memory five-minute
`Map` used only by the voice path; tools do not produce tokens and a restart loses
them. Rejected for v1 in favour of soft delete plus `restore_note`, which is
durable and needs no new state.

## Decisions

### D1 — The MCP server is a module of the backend, not a second service

`backend/src/mcp/` is mounted into the existing Express app and deployed with it.
Same process, same database, same env. No separate Railway service, no second
build, no cross-service auth. No stdio entrypoint of our own; the README documents
`npx mcp-remote https://<host>/mcp --header "Authorization: Bearer nf_pat_…"` for
clients without remote support.

### D2 — Tools are HTTP clients of the existing API

Tool handlers mint a short-lived internal JWT (`signInternalToken`, 5 minutes,
same secret and payload shape as `signToken`) and call the API over
`127.0.0.1:$PORT`.

To keep a chat session's own calls out of the global limiter, the note and label
routers are **mounted a second time** at `/internal/note` and `/internal/label`,
before `globalLimiter`. That mount is guarded by two checks: the request's TCP
socket address must be loopback (`req.socket.remoteAddress`, not `req.ip`, which
`trust proxy` lets a caller spoof), and it must carry
`X-NoteFlow-Internal: <MCP_INTERNAL_SECRET>`. A request failing either gets 404.
The routers themselves are unchanged; their own `authMiddleware` still runs, so
the minted JWT identifies the user.

`/internal/*` sits before `globalLimiter` on purpose and has no limiter of its
own: it is unreachable from outside the process's own loopback interface.

Consequence: `/mcp` is mounted before `globalLimiter` and carries its own limiter
(D7). Everything else about the public API is as it is today.

### D3 — Two credential types, one gate at `/mcp`

`Authorization: Bearer <credential>`; the prefix decides the type
(`nf_pat_` / `nf_at_`), and both resolve to `{ userId, scopes }`. Every token is
stored only as a SHA-256 hash, never in plaintext. A missing or unknown credential
gets:

```
401
WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"
```

That header is the whole discovery mechanism: it is how ChatGPT and claude.ai go
from "this URL needs auth" to "open a browser at this authorize page".

### D4 — Four new REST endpoints

All `authMiddleware`-protected, user-scoped, returning the note with `todos` and
`labels` included. `GET` answers 404 for a note the caller does not own.

| Route | Body | Behaviour |
| --- | --- | --- |
| `GET /api/note/:noteId` | — | One note in any state (active, archived, trashed). The read behind `get_note`, and the precondition for every edit the model makes |
| `POST /api/note/:noteId/todos` | `{ items: string[] }` (1–50, each 1–500 chars) | Appends todos after the current max `order`. 400 on a `PARAGRAPH` note |
| `PUT /api/note/:noteId/todo/:todoId` | `{ text?: string, done?: boolean }` (at least one) | Updates one todo belonging to that note; 404 otherwise |
| `DELETE /api/note/:noteId/todo/:todoId` | — | Removes one todo belonging to that note; 404 otherwise |

Reasons: there is no single-note read at all today, so `get_note` has nothing to
call; `PUT /api/note/:noteId` deletes any todo absent from the array it is sent,
so read-modify-write against it would drop an item a second client added between
the read and the write; and without a per-todo delete, "remove milk from my list"
has no correct tool and the model will reach for a destructive one.

### D5 — Tool list

Eleven tools. Input schemas are zod, described in the model's language, and every
result names ids explicitly.

| Tool | Input | Behaviour / returns |
| --- | --- | --- |
| `search_notes` | `query?`, `scope?` (`active` default, `archived`, `trashed`), `labelId?`, `page?`, `limit?` (≤50) | `GET /api/note`; projects to `{ id, title, type, snippet, labels, updatedAt }`, where `snippet` is the first 200 characters of `content` or the todo texts, plus `truncated: true` when cut. Returns `total`, `page`, `hasMore` from the route. Read-only |
| `get_note` | `noteId` | `GET /api/note/:noteId`: `content` for paragraphs, `todos[{id,text,done}]` for checklists, plus labels, flags, dates. Read-only |
| `create_note` | `title`, `content`, `labelIds?` | `POST /api/note` type `PARAGRAPH`; returns the new note with its id |
| `create_checklist` | `title`, `items: string[]`, `labelIds?` | `POST /api/note` type `CHECKBOX` |
| `add_todos` | `noteId`, `items: string[]` | D4 append; 400 with "this is a paragraph note, use update_note" when misused |
| `update_todo` | `noteId`, `todoId`, `text?`, `done?` | D4 update |
| `remove_todo` | `noteId`, `todoId` | D4 delete. One at a time; annotation destructive |
| `update_note` | `noteId`, `title?`, `content?`, `bookmarked?`, `archived?`, `setLabelIds?`, `addLabelIds?`, `removeLabelIds?` | `PUT /api/note/:noteId`. The three label fields are mutually exclusive: `set…` replaces the whole set, `add…`/`remove…` read the current labels and send the resulting full set, so "add the work label" cannot drop the others |
| `delete_note` | `noteId`, `permanent?` (default false) | Trash by default; `permanent: true` is the only path to the permanent route. Annotated destructive |
| `restore_note` | `noteId` | `PUT` with `{ deletedAt: null }` |
| `list_labels` | — | `GET /api/label`; id, name, color |

Annotations: `readOnlyHint` on `search_notes`, `get_note`, `list_labels`;
`destructiveHint` on `delete_note` and `remove_todo`; `idempotentHint` on reads and
on `update_note`/`update_todo`. Clients render their own confirmations from these.

Appending to a paragraph note is deliberately *not* a tool: `add_todos` on a
paragraph is an error telling the model to use `update_note`, so the model never
muddles two content models.

### D6 — Transport, body parsing and lifecycle

- `POST /mcp`, `GET /mcp`, `DELETE /mcp` are handled by
  `StreamableHTTPServerTransport` in **stateless** mode: a fresh transport and
  server per request, no session id, `enableJsonResponse: true`. Railway runs one
  instance; stateless means a restart cannot lose a session.
- `/mcp` keeps using the globally parsed JSON body from `express.json()`.
- OAuth needs `application/x-www-form-urlencoded` bodies, which the app does not
  parse today. Mount `express.urlencoded({ extended: false, limit: "10kb" })`
  globally next to `express.json()`; it is inert for every existing route, which
  all send JSON. `/oauth/token` and `/oauth/revoke` also accept JSON, because
  hand-testing with curl is easier that way.
- The MCP server sends short `instructions` ("NoteFlow stores notes. Call
  search_notes before editing; ids are integers; never guess a note id.").
- Errors come back as `isError: true` with the API's plain message, so the model
  can correct itself rather than crash.
- **Scopes:** `tools/list` omits write tools for a `notes:read` token, and every
  write tool re-checks its scope before calling the API. Hiding and enforcing are
  both cheap here because the server is built per request.

### D7 — Rate limiting

`/mcp` gets `mcpLimiter`: 120 requests/minute keyed by token hash, 20/minute for
unauthenticated requests keyed by IP. `/internal/*` is loopback-only and unlimited.
`globalLimiter` itself is unchanged.

### D8 — Token lifetimes and revocation

| Credential | Lifetime | Storage |
| --- | --- | --- |
| PAT | until revoked | `ApiToken`, sha256 hash + 12-char prefix for the UI |
| Access token | 1 hour | `OauthToken.accessTokenHash` |
| Refresh token | 30 days, rotated on every use | `OauthToken.refreshTokenHash` |
| Authorization code | 60 seconds, single use | `OauthCode`, consumed by `usedAt` |

Revocation sets `revokedAt`; the `/mcp` gate rejects revoked, expired, or
wrong-scope tokens on every request. A refresh token presented twice is treated as
theft: that token family is revoked and the client must re-authorize.

`OauthToken` carries the `resource` it was minted for (RFC 8707) and `/mcp` checks
it against `MCP_PUBLIC_URL` when present. A client that omits `resource` is
accepted — many do — but a token minted for a different resource is refused.

### D9 — A real settings page ships with it

`frontend` gets a `/settings` route. Its entry point is a third icon in the notes
header's existing row — `Note.tsx`, the `ml-auto flex items-center gap-5` block
that already holds the info (guide) button and the theme toggle — placed after the
theme toggle, `Settings` from `lucide-react`, `aria-label="Settings"`, routing to
`/settings`. The sidebar and user block are untouched.

That header exists only on the notes page, so `/settings` renders its own slim
header: a back link to `/note`, the title, and the same theme toggle. The page
follows the existing page shell and holds one section today: **AI access**.

First section: **AI access**. Create a PAT (name it, choose read-only or
read-write, the string is shown once), list PATs with prefix and last used,
revoke. Then **Connected apps**: client name, scopes, last used, revoke. Without
the PAT half, a user has no way to get a token except curl.

This is a new page, not a modal inside the notes screen — the token list and the
connected-apps list both grow, and later settings (password, guide) belong there
too. The notes UI change is exactly one icon button; nothing else on that screen
moves.

*D9 and D10 are my calls, not yours — say so if you'd rather defer either.*

### D10 — Connector URL is the Railway domain for now

`MCP_PUBLIC_URL` (defaulting to the Railway public URL) feeds every URL in the
discovery documents, so the host is configuration, not code. Moving to a custom
domain later is an env change plus re-adding the connector in each chat product —
OAuth registrations are per-URL, so clients cannot silently follow.

### D11 — Not exposed in v1

Reordering, voice, newsletter, password reset, guide state, account deletion, and
bulk todo edits. Each is either meaningless in chat or a security surface with no
payoff.

### D12 — Google-only accounts use a PAT

`/oauth/authorize` verifies email + password against the existing sign-in rules.
A Google-only account (`password === null`) is refused with the same generic
"Invalid email or password" as a wrong password, so the page never confirms
whether an account exists. Settings copy says Google sign-in users should create a
personal access token instead, and that's true today. Adding Google to the consent
page is a later change, not a v1 gap.

## Data model

Additive migration `add_mcp_tokens`. Four models; no existing model changes except
`User` gaining the two back-relations.

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
  id           String   @id            // client_id, uuid v4
  name         String
  redirectUris String[]
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime?
}

model OauthCode {
  id                  String   @id   // the code itself, high-entropy random
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
  id                Int       @id @default(autoincrement())
  userId            Int
  clientId          String
  accessTokenHash   String    @unique
  refreshTokenHash  String?   @unique
  scopes            String[]
  resource          String?
  accessExpiresAt   DateTime
  refreshExpiresAt  DateTime?
  rotatedFromId     Int?
  revokedAt         DateTime?
  lastUsedAt        DateTime?
  createdAt         DateTime  @default(now())
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- `OauthClient` is not user-owned: registration happens before anyone logs in.
  A client id alone grants nothing; the code and token rows are user-scoped.
- Models are named `Oauth*`, not `OAuth*`, so Prisma's generated accessors read
  `prisma.oauthToken` rather than `prisma.oAuthToken`.
- `redirectUris` must be `https://` or `http://localhost` / `127.0.0.1`; anything
  else is rejected at registration and re-checked when the code is redeemed.
- Hashes are lowercase hex sha256. `prefix` is the first 12 characters of the
  plaintext, for display only.
- Expired codes and tokens are deleted on the next `/oauth/token` call, not by a
  cron job.

## Endpoints

All new, under the existing Express app. Well-known documents and OAuth routes sit
before `globalLimiter`; `/oauth/authorize` shares the sign-in limiter.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/.well-known/oauth-protected-resource` | none | `{ resource, authorization_servers, scopes_supported }` |
| `GET` | `/.well-known/oauth-authorization-server` | none | issuer, authorize/token/register/revoke URLs, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]` |
| `POST` | `/oauth/register` | none | DCR: `{ client_name, redirect_uris }` → `{ client_id }`. Public client, no secret |
| `GET` | `/oauth/authorize` | none | Minimal HTML login form; validates `client_id`, `redirect_uri`, `response_type=code`, S256 challenge, `scope`, optional `state` |
| `POST` | `/oauth/authorize` | none | Verifies email + password, issues `OauthCode`, 302 to `redirect_uri?code=…&state=…`; `error=access_denied` on Deny |
| `POST` | `/oauth/token` | none | `authorization_code` (verify PKCE: sha256(verifier) base64url == challenge) or `refresh_token` (rotate) |
| `POST` | `/oauth/revoke` | none | Revokes the presented access or refresh token |
| `POST`·`GET`·`DELETE` | `/mcp` | Bearer | MCP Streamable HTTP |
| `GET` | `/api/mcp/tokens` | JWT | List the user's PATs (prefix, scopes, last used) |
| `POST` | `/api/mcp/tokens` | JWT | Create a PAT; returns the plaintext **once** |
| `DELETE` | `/api/mcp/tokens/:id` | JWT | Revoke |
| `GET` | `/api/mcp/apps` | JWT | Connected OAuth clients for this user |
| `DELETE` | `/api/mcp/apps/:clientId` | JWT | Revoke that client's tokens for this user |

Validation and error shapes follow the existing convention:
`{ success: false, message }` for `/api/*`; RFC 6749 `{ error, error_description }`
for the OAuth endpoints, because clients parse those codes.

PKCE failures, reused codes, unknown clients, mismatched redirect URIs and expired
codes all answer `invalid_grant` — never a hint about which check failed.

## Client wiring

| Client | Setup |
| --- | --- |
| OpenCode | `opencode.json` → `mcp.noteflow = { type: "remote", url: "https://<host>/mcp", headers: { Authorization: "Bearer nf_pat_…" }, enabled: true }` |
| Claude Code | `claude mcp add --transport http noteflow https://<host>/mcp --header "Authorization: Bearer nf_pat_…"` |
| claude.ai / Desktop | Settings → Connectors → Add custom connector → URL only; the OAuth flow is discovered from the 401 |
| ChatGPT | Settings → Connectors → developer mode → Add → URL + OAuth; requires a paid plan |
| Anything stdio-only | `npx mcp-remote https://<host>/mcp --header "Authorization: Bearer nf_pat_…"` |

## Frontend

One new page, one API module, no changes to the notes screens other than the
sidebar entry:

- `frontend/src/api/mcpApi.ts`: `ApiToken { id, name, prefix, scopes, lastUsedAt,
  createdAt }`, `ConnectedApp { clientId, name, scopes, lastUsedAt }`, and
  `getTokens`, `createToken`, `revokeToken`, `getApps`, `revokeApp`.
- `/settings` page following the existing page shell; "AI access" section with a
  short explanation, the token table, a create modal (name, read-only vs
  read-write), a one-time reveal panel with copy and "you won't see this again",
  then "Connected apps" with its revoke buttons. Slim header: back to `/note`,
  title, theme toggle.
- `Note.tsx`: one new icon button after the theme toggle (`Settings` from
  `lucide-react`, `aria-label="Settings"`, `navigate("/settings")`). No other
  change to the notes screen.
- Empty states explain the two ways to connect (token for local tools, connector
  for ChatGPT/Claude) in two sentences.

## Security

- Plaintext tokens exist only in the creation response and in the client. The
  database stores hashes; logs never contain an `Authorization` header.
- Every query is scoped by the resolved `userId`; no tool accepts a user id.
- `delete_note` is soft by default and annotated destructive; hard delete requires
  `permanent: true`.
- OAuth: exact `redirect_uri` match, PKCE S256 only, 60-second single-use codes,
  rotating refresh tokens with reuse detection, and a `resource` binding checked
  at `/mcp`.
- The authorize page is server-rendered HTML with a strict CSP via helmet, no
  third-party scripts, `state` passed through untouched, and the sign-in limiter
  applies to its POST.
- `/internal/*` requires a loopback socket **and** the shared secret; both checks
  fail closed.
- CORS stays as it is. MCP clients are server-to-server and send no `Origin`.

## Build order

1. Schema, `add_mcp_tokens` migration, `npm run build`, regenerate the client.
2. Split `app.ts` into `app.ts` (build and export the app) and `server.ts` (listen),
   update `npm run dev`/`start`, add `express.urlencoded`.
3. `lib/mcpTokens.ts` (generate/hash/verify/prefix, scope checks) with unit tests.
4. D4 endpoints, `schemas/note.ts` additions, unit tests for their validation.
5. `mcp/client.ts` (internal JWT + loopback calls) and `mcp/tools.ts` (eleven
   tools); `/internal/*` mounts and the loopback guard.
6. `mcp/http.ts`, `/mcp` mount, `mcpLimiter`; verify with MCP Inspector against
   the local backend using a PAT.
7. `/api/mcp/tokens` routes, then the `/settings` page; deploy; verify OpenCode and
   Claude Code over HTTPS.
8. OAuth: metadata documents, `/oauth/register`, `/oauth/authorize`, `/oauth/token`,
   `/oauth/revoke`; curl-level tests for PKCE failure, code reuse, redirect
   mismatch, refresh rotation, `resource` mismatch.
9. `/api/mcp/apps` plus the connected-apps list; revoke path verified.
10. Connect claude.ai, then ChatGPT; tune tool descriptions against real
    transcripts.
11. README section: what the connector is, how to connect each client, how to
    revoke.

## Verification

**Automated, offline (`npm test` in `backend/`):** token generate/hash/prefix;
scope checks; PKCE verifier mismatch → `invalid_grant`; code reuse →
`invalid_grant`; expired code → `invalid_grant`; refresh rotation invalidates the
old refresh token; new zod schemas accept and reject the right bodies. These are
pure functions plus zod — no database.

**Automated, opt-in:** a small `supertest` suite over the exported app, enabled by
`TEST_DATABASE_URL` and skipped when it is unset, covering the four D4 endpoints,
`/mcp` 401 without a credential, read-only token refused at a write tool, and
cross-user 404. `supertest` becomes a devDependency; the Neon database used is a
branch, never the shared one. CI (none today) is out of scope.

**Manual:**

- `npx @modelcontextprotocol/inspector` against `/mcp` with a PAT lists eleven
  tools and no more; with a read-only PAT, eight.
- OpenCode: "add milk to my shopping list" appends to the right checklist; "what's
  on my shopping list" reads it back with ids; "remove milk" removes only that one.
- Claude Code: "delete the dentist note" trashes rather than destroys, and
  `restore_note` brings it back.
- claude.ai custom connector: OAuth completes; a second connection reuses the
  grant; revoking in NoteFlow fails the next call with 401.
- ChatGPT developer mode: tools appear; destructive confirmation shown for
  `delete_note`; OAuth completes.
- Two accounts: user A's PAT cannot read user B's note id (404, not 403).
- Restart the backend: no client has to reconnect (stateless).
- Logs and the settings page never show a full token after creation.

## Left to the builder

- Exact tool descriptions and `instructions` wording; expect two or three passes.
- Whether `search_notes` returns 200-character snippets or shorter.
- The visual design of the settings page, within existing tokens.
- Whether `restore_note` should also un-archive, or stay strictly about trash.
- The shape of a "connected app" row when the client registered without a name.
- Whether `OauthClient` rows are garbage-collected when unused for 90 days.
- Whether the settings page shows `lastUsedAt` as relative time.
