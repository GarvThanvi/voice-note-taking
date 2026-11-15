import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import {
  generateToken,
  hashToken,
  READ_SCOPE,
  WRITE_SCOPE,
} from "../lib/mcpTokens.js";

const skip = !process.env.TEST_DATABASE_URL;
let userId: number;
let token: string;
let otherUserId: number;
let otherToken: string;

const auth = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

const postMcp = (bearer: string) =>
  request(app)
    .post("/mcp")
    .set("authorization", `Bearer ${bearer}`)
    .set("content-type", "application/json")
    .set("accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

const createOauthGrant = async (
  ownerId: number,
  clientId: string,
  overrides: Partial<{ revokedAt: Date; accessExpiresAt: Date; refreshExpiresAt: Date }> = {},
) => {
  const access = generateToken("access");
  const refresh = generateToken("refresh");
  await prisma.oauthToken.create({
    data: {
      userId: ownerId,
      clientId,
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      scopes: [READ_SCOPE, WRITE_SCOPE],
      accessExpiresAt: overrides.accessExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      refreshExpiresAt: overrides.refreshExpiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: overrides.revokedAt ?? null,
    },
  });
  return access.token;
};

const createClient = async (name: string) => {
  const id = `test_${randomUUID()}`;
  await prisma.oauthClient.create({ data: { id, name, redirectUris: ["http://localhost:9999/cb"] } });
  return id;
};

test("setup", { skip }, async () => {
  const user = await prisma.user.create({ data: { email: `pat${Date.now()}@test.dev`, username: "pat", password: "x" } });
  const other = await prisma.user.create({ data: { email: `patother${Date.now()}@test.dev`, username: "patother", password: "x" } });
  userId = user.id;
  otherUserId = other.id;
  token = signToken(userId);
  otherToken = signToken(otherUserId);
});

test("token routes require a signed-in user", { skip }, async () => {
  const res = await request(app).get("/api/mcp/tokens");
  assert.equal(res.status, 401);
});

test("a PAT is not a credential for the token API itself", { skip }, async () => {
  const created = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "escalate" });
  const res = await request(app).get("/api/mcp/tokens").set(auth(created.body.token));
  assert.equal(res.status, 401);
  await request(app).delete(`/api/mcp/tokens/${created.body.apiToken.id}`).set(auth(token));
});

test("creating a token returns plaintext once and stores only its hash", { skip }, async () => {
  const res = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "opencode", scopes: ["notes:read", "notes:write"] });
  assert.equal(res.status, 201);
  assert.match(res.body.token, /^nf_pat_/);
  assert.deepEqual(res.body.apiToken.scopes, [READ_SCOPE, WRITE_SCOPE]);
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(res.body.token) } });
  assert.equal(row?.prefix, res.body.token.slice(0, 12));
  assert.equal(row?.userId, userId);

  const list = await request(app).get("/api/mcp/tokens").set(auth(token));
  assert.equal(list.status, 200);
  assert.equal(list.body.tokens.length, 1);
  assert.equal(list.body.tokens[0].name, "opencode");
  assert.equal(list.body.tokens[0].token, undefined);
  assert.equal(list.body.tokens[0].tokenHash, undefined);
});

test("omitted scopes default to read-write, an explicit read scope stays read-only", { skip }, async () => {
  const rw = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "default" });
  assert.deepEqual(rw.body.apiToken.scopes, [READ_SCOPE, WRITE_SCOPE]);
  const ro = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "reader", scopes: ["notes:read"] });
  assert.deepEqual(ro.body.apiToken.scopes, [READ_SCOPE]);
  const writeOnly = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "w", scopes: ["notes:write"] });
  assert.deepEqual(writeOnly.body.apiToken.scopes, [READ_SCOPE, WRITE_SCOPE]);
  for (const id of [rw.body.apiToken.id, ro.body.apiToken.id, writeOnly.body.apiToken.id]) {
    await request(app).delete(`/api/mcp/tokens/${id}`).set(auth(token));
  }
});

test("bad names and unknown scopes are 400", { skip }, async () => {
  const cases = [
    {},
    { name: "   " },
    { name: "x".repeat(51) },
    { name: "ok", scopes: ["admin:everything"] },
    { name: "ok", scopes: "notes:read" },
  ];
  for (const body of cases) {
    const res = await request(app).post("/api/mcp/tokens").set(auth(token)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.success, false);
  }
});

test("revoking another user's token is 404 and leaves it working", { skip }, async () => {
  const theirs = await request(app).post("/api/mcp/tokens").set(auth(otherToken)).send({ name: "theirs" });
  const res = await request(app).delete(`/api/mcp/tokens/${theirs.body.apiToken.id}`).set(auth(token));
  assert.equal(res.status, 404);
  const row = await prisma.apiToken.findUnique({ where: { id: theirs.body.apiToken.id } });
  assert.equal(row?.revokedAt, null);
  const list = await request(app).get("/api/mcp/tokens").set(auth(token));
  assert.ok(list.body.tokens.every((t: { name: string }) => t.name !== "theirs"));
});

test("a non-numeric token id is 400", { skip }, async () => {
  const res = await request(app).delete("/api/mcp/tokens/abc").set(auth(token));
  assert.equal(res.status, 400);
});

test("a revoked token stops working at /mcp and disappears from the list", { skip }, async () => {
  const created = await request(app).post("/api/mcp/tokens").set(auth(token)).send({ name: "short-lived" });
  const before = await postMcp(created.body.token);
  assert.notEqual(before.status, 401);

  const revoke = await request(app).delete(`/api/mcp/tokens/${created.body.apiToken.id}`).set(auth(token));
  assert.equal(revoke.status, 200);
  const again = await request(app).delete(`/api/mcp/tokens/${created.body.apiToken.id}`).set(auth(token));
  assert.equal(again.status, 404);

  const after = await postMcp(created.body.token);
  assert.equal(after.status, 401);
  const list = await request(app).get("/api/mcp/tokens").set(auth(token));
  assert.ok(list.body.tokens.every((t: { id: number }) => t.id !== created.body.apiToken.id));
});

test("GET /api/mcp/apps lists one row per live client with its name", { skip }, async () => {
  const clientId = await createClient("Claude");
  await createOauthGrant(userId, clientId);
  await createOauthGrant(userId, clientId);
  const revokedClient = await createClient("Old app");
  await createOauthGrant(userId, revokedClient, { revokedAt: new Date() });
  const expiredClient = await createClient("Expired app");
  await createOauthGrant(userId, expiredClient, { accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() - 1000) });
  const foreignClient = await createClient("Their app");
  await createOauthGrant(otherUserId, foreignClient);

  const res = await request(app).get("/api/mcp/apps").set(auth(token));
  assert.equal(res.status, 200);
  const ids = res.body.apps.map((a: { clientId: string }) => a.clientId);
  assert.deepEqual(ids, [clientId]);
  assert.equal(res.body.apps[0].name, "Claude");
  assert.deepEqual(res.body.apps[0].scopes, [READ_SCOPE, WRITE_SCOPE]);
});

test("a client registered without a name is still listed", { skip }, async () => {
  const clientId = await createClient("");
  await createOauthGrant(userId, clientId);
  const res = await request(app).get("/api/mcp/apps").set(auth(token));
  const row = res.body.apps.find((a: { clientId: string }) => a.clientId === clientId);
  assert.equal(row?.name, "Unnamed app");
  await request(app).delete(`/api/mcp/apps/${clientId}`).set(auth(token));
});

test("revoking an app makes its access token 401 at /mcp", { skip }, async () => {
  const clientId = await createClient("ChatGPT");
  const access = await createOauthGrant(userId, clientId);
  const before = await postMcp(access);
  assert.notEqual(before.status, 401);

  const res = await request(app).delete(`/api/mcp/apps/${clientId}`).set(auth(token));
  assert.equal(res.status, 200);
  assert.equal(res.body.revoked, 1);

  const after = await postMcp(access);
  assert.equal(after.status, 401);
  const list = await request(app).get("/api/mcp/apps").set(auth(token));
  assert.ok(list.body.apps.every((a: { clientId: string }) => a.clientId !== clientId));
});

test("revoking an app burns its pending authorization codes", { skip }, async () => {
  const clientId = await createClient("Pending");
  await createOauthGrant(userId, clientId);
  const code = generateToken("code");
  await prisma.oauthCode.create({
    data: { id: code.hash, clientId, userId, redirectUri: "http://localhost:9999/cb", scopes: [READ_SCOPE], codeChallenge: "x", expiresAt: new Date(Date.now() + 60_000) },
  });
  await request(app).delete(`/api/mcp/apps/${clientId}`).set(auth(token));
  const row = await prisma.oauthCode.findUnique({ where: { id: code.hash } });
  assert.notEqual(row?.usedAt, null);
});

test("another user's app is not revocable and keeps working", { skip }, async () => {
  const clientId = await createClient("Theirs");
  const access = await createOauthGrant(otherUserId, clientId);
  const res = await request(app).delete(`/api/mcp/apps/${clientId}`).set(auth(token));
  assert.equal(res.status, 404);
  const still = await postMcp(access);
  assert.notEqual(still.status, 401);
});
