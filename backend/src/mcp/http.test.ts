import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { generateToken, READ_SCOPE, WRITE_SCOPE } from "../lib/mcpTokens.js";
import type { Options } from "express-rate-limit";
import {
  mcpPreAuthOptions,
  mcpTokenOptions,
  mcpUnauthOptions,
} from "../middlewares/rateLimit.middleware.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const skip = !process.env.TEST_DATABASE_URL;
const originalPort = process.env.PORT;
let baseUrl: string;
let port: number;
let server: import("node:http").Server;
let userId: number;
let pat: string;
let readOnlyPat: string;

const connect = async (token: string): Promise<Client> => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
};

type TextPart = { type?: unknown; text?: unknown };

// Tool payloads travel as one JSON string inside a text content block. The SDK
// result type is a union (a task-shaped result has no content), so narrow it.
const payloadOf = (result: unknown): any => {
  const content = (result as { content?: unknown }).content;
  const parts = Array.isArray(content) ? (content as TextPart[]) : [];
  const text = parts
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("");
  return JSON.parse(text);
};

const postMcp = (authorization?: string): Promise<Response> =>
  fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: "{}",
  });

// The limit options hold a lazy function so the env is read per request; call
// it the same way express-rate-limit would.
const configuredLimit = (options: Partial<Options>): number =>
  typeof options.limit === "function"
    ? Number((options.limit as () => number)())
    : options.limit ?? 0;

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

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
  port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  // createApi reads PORT lazily on every call; point it at this ephemeral
  // server so a tool call reaches /internal on the app under test (the .env
  // PORT would send it to whatever else is listening there).
  process.env.PORT = String(port);
  // internalOnly fails closed on an empty secret, so pin one for the e2e tool
  // calls instead of depending on .env.
  process.env.MCP_INTERNAL_SECRET ??= "dev-secret";
});

// Must run before any other /mcp POST: it asserts on a clean unauth bucket.
test("unauthenticated requests are capped at MCP_UNAUTH_LIMIT per IP", { skip }, async () => {
  const previous = process.env.MCP_UNAUTH_LIMIT;
  process.env.MCP_UNAUTH_LIMIT = "2";

  try {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // A different well-formed-but-unknown PAT each time: rotating the bearer
      // must not buy a fresh token bucket, or /mcp would be unbounded.
      statuses.push((await postMcp(`Bearer ${generateToken("pat").token}`)).status);
    }
    assert.deepEqual(statuses, [401, 401, 429]);
  } finally {
    if (previous === undefined) delete process.env.MCP_UNAUTH_LIMIT;
    else process.env.MCP_UNAUTH_LIMIT = previous;
  }
});

test("/mcp without a credential is 401 with resource metadata", { skip }, async () => {
  // The challenge is built from MCP_PUBLIC_URL when a developer has set it;
  // delete it so the literal assertion below does not depend on their config.
  const publicUrl = process.env.MCP_PUBLIC_URL;
  delete process.env.MCP_PUBLIC_URL;

  try {
    const res = await postMcp();
    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get("www-authenticate"),
      `Bearer resource_metadata="http://localhost:${port}/.well-known/oauth-protected-resource"`,
    );
  } finally {
    restoreEnv("MCP_PUBLIC_URL", publicUrl);
  }
});

test("a revoked token is 401", { skip }, async () => {
  const revoked = generateToken("pat");
  await prisma.apiToken.create({ data: { userId, name: "gone", tokenHash: revoked.hash, prefix: revoked.prefix, scopes: [READ_SCOPE, WRITE_SCOPE], revokedAt: new Date() } });
  const res = await postMcp(`Bearer ${revoked.token}`);
  assert.equal(res.status, 401);
});

test("an unknown but well-formed PAT is 401", { skip }, async () => {
  const unknown = generateToken("pat");
  assert.equal((await postMcp(`Bearer ${unknown.token}`)).status, 401);
});

test("a refresh token presented as a bearer is 401", { skip }, async () => {
  const access = generateToken("access");
  const refresh = generateToken("refresh");
  await prisma.oauthToken.create({ data: { userId, clientId: "test-client", accessTokenHash: access.hash, refreshTokenHash: refresh.hash, scopes: [READ_SCOPE, WRITE_SCOPE], accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  // A stored refresh hash must never authenticate: only accessTokenHash is read.
  assert.equal((await postMcp(`Bearer ${refresh.token}`)).status, 401);
});

test("a token whose user was deleted is 401", { skip }, async () => {
  const doomed = await prisma.user.create({ data: { email: `gone${Date.now()}@test.dev`, username: "gone", password: "x" } });
  const orphan = generateToken("pat");
  await prisma.apiToken.create({ data: { userId: doomed.id, name: "orphan", tokenHash: orphan.hash, prefix: orphan.prefix, scopes: [READ_SCOPE, WRITE_SCOPE] } });
  await prisma.user.delete({ where: { id: doomed.id } });
  // The FK cascade takes the token with the user; the credential must die too.
  assert.equal(await prisma.apiToken.count({ where: { tokenHash: orphan.hash } }), 0);
  assert.equal((await postMcp(`Bearer ${orphan.token}`)).status, 401);
});

test("GET and DELETE on /mcp are 405 with Allow: POST and no body", { skip }, async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(`${baseUrl}/mcp`, { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
    assert.equal(await res.text(), "");
  }
});

test("a malformed JSON body is a JSON-RPC parse error, not a 500", { skip }, async () => {
  const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
});

test("an oversized body is 413 with a JSON-RPC error", { skip }, async () => {
  const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pad: "x".repeat(120_000) }) });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { jsonrpc: "2.0", error: { code: -32600, message: "Request body too large" }, id: null });
});

test("an expired OAuth access token is 401", { skip }, async () => {
  const access = generateToken("access");
  await prisma.oauthToken.create({ data: { userId, clientId: "test-client", accessTokenHash: access.hash, scopes: [READ_SCOPE], accessExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await postMcp(`Bearer ${access.token}`)).status, 401);
});

test("a live OAuth access token lists only read tools", { skip }, async () => {
  const access = generateToken("access");
  await prisma.oauthToken.create({ data: { userId, clientId: "test-client", accessTokenHash: access.hash, scopes: [READ_SCOPE], accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  const client = await connect(access.token);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_note", "list_labels", "search_notes"]);
  await client.close();
});

test("a read-write PAT lists eleven tools", { skip }, async () => {
  const client = await connect(pat);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 11);
  const remove = tools.find((t) => t.name === "remove_todo");
  assert.equal(remove?.annotations?.destructiveHint, true);
  await client.close();
});

test("a read-only PAT lists only read tools", { skip }, async () => {
  const client = await connect(readOnlyPat);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_note", "list_labels", "search_notes"]);
  await client.close();
});

// The tests below drive the whole loop: MCP client -> /mcp -> minted internal
// JWT -> /internal -> note route -> Prisma, so the seam between the connector
// and the API is exercised, not just stubbed.

test("search_notes reads a note through the internal API", { skip }, async () => {
  const title = `Read path ${Date.now()}`;
  const note = await prisma.note.create({ data: { userId, type: "PARAGRAPH", title, content: "Visible through a real tool call." } });
  const client = await connect(pat);

  try {
    const result = await client.callTool({ name: "search_notes", arguments: { query: title } });
    assert.notEqual(result.isError, true, "search_notes must not fail");
    const payload = payloadOf(result);
    const found = payload.notes.find((candidate: { id: number }) => candidate.id === note.id);
    assert.ok(found, `expected note ${note.id} in ${JSON.stringify(payload.notes)}`);
    assert.equal(found.title, title);
  } finally {
    await client.close();
  }
});

test("create_checklist writes a checklist through the internal API", { skip }, async () => {
  const client = await connect(pat);

  try {
    const result = await client.callTool({ name: "create_checklist", arguments: { title: "Groceries", items: ["milk", "eggs"] } });
    assert.notEqual(result.isError, true, "create_checklist must not fail");
    assert.equal(payloadOf(result).note.title, "Groceries");
  } finally {
    await client.close();
  }

  const row = await prisma.note.findFirst({ where: { userId, title: "Groceries" }, include: { todos: true } });
  assert.ok(row, "the checklist row must exist after the tool call");
  assert.deepEqual(row.todos.map((todo) => todo.text).sort(), ["eggs", "milk"]);
});

test("a read-only PAT cannot create a note through a tool call", { skip }, async () => {
  const title = `Blocked ${Date.now()}`;
  const client = await connect(readOnlyPat);
  let refused = false;

  try {
    const result = await client.callTool({ name: "create_note", arguments: { title, content: "must not land" } });
    refused = result.isError === true;
  } catch (error) {
    // Write tools are not registered for a read-only token, so the SDK answers
    // with a JSON-RPC error instead of a tool result. Either shape is a refusal.
    refused = /not found/i.test((error as Error).message);
  } finally {
    await client.close();
  }

  assert.equal(refused, true, "a read-only token must not reach create_note");
  const row = await prisma.note.findFirst({ where: { userId, title } });
  assert.equal(row, null, "a refused write must leave no row behind");
});

test("authenticated requests are capped at MCP_TOKEN_LIMIT per token", { skip }, async () => {
  // A brand-new token, so this bucket starts empty no matter what ran before.
  const limited = generateToken("pat");
  await prisma.apiToken.create({ data: { userId, name: "limited", tokenHash: limited.hash, prefix: limited.prefix, scopes: [READ_SCOPE] } });
  const previous = process.env.MCP_TOKEN_LIMIT;
  process.env.MCP_TOKEN_LIMIT = "2";

  try {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await postMcp(`Bearer ${limited.token}`)).status);
    }

    assert.notEqual(statuses[0], 429);
    assert.notEqual(statuses[1], 429);
    assert.equal(statuses[2], 429);
  } finally {
    if (previous === undefined) delete process.env.MCP_TOKEN_LIMIT;
    else process.env.MCP_TOKEN_LIMIT = previous;
  }
});

test("limiter defaults match the D7 numbers when no overrides are set", () => {
  const savedUnauth = process.env.MCP_UNAUTH_LIMIT;
  const savedToken = process.env.MCP_TOKEN_LIMIT;
  const savedPreAuth = process.env.MCP_PREAUTH_LIMIT;
  delete process.env.MCP_UNAUTH_LIMIT;
  delete process.env.MCP_TOKEN_LIMIT;
  delete process.env.MCP_PREAUTH_LIMIT;

  try {
    assert.equal(configuredLimit(mcpUnauthOptions), 20);
    assert.equal(configuredLimit(mcpTokenOptions), 120);
    // The IP backstop is failure-only and far above the per-token budget.
    assert.equal(configuredLimit(mcpPreAuthOptions), 600);
    assert.equal(mcpPreAuthOptions.skipSuccessfulRequests, true);
  } finally {
    restoreEnv("MCP_UNAUTH_LIMIT", savedUnauth);
    restoreEnv("MCP_TOKEN_LIMIT", savedToken);
    restoreEnv("MCP_PREAUTH_LIMIT", savedPreAuth);
  }
});

test("stop server", { skip }, async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
});
