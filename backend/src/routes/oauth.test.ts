import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import type { Options } from "express-rate-limit";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { generateToken, hashToken, toBase64Url } from "../lib/mcpTokens.js";
import {
  oauthPageOptions,
  oauthRegisterOptions,
  oauthTokenOptions,
} from "../middlewares/rateLimit.middleware.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  cleanupExpired,
  cleanupUnusedClients,
  issueTokens,
} from "../lib/oauth.js";

const skip = !process.env.TEST_DATABASE_URL;
const PASSWORD = "Password1!";
const CALLBACK = "http://localhost:9999/cb";

// POST /oauth/authorize carries the shared sign-in limiter (10 requests per 15
// minutes per IP). This file makes ten authorize POSTs, exactly at that ceiling,
// so a new password-path test needs to share a flow. Registration has its own
// bucket; the setup raises it for this file because every flow registers a fresh
// client, above the production default of 10/min.

let server: import("node:http").Server;
let baseUrl: string;
let userId: number;
let email: string;
let googleEmail: string;
let originalPublicUrl: string | undefined;
let originalRegisterLimit: string | undefined;

const verifier = "v".repeat(43);

const challengeOf = (value: string): string =>
  toBase64Url(createHash("sha256").update(value).digest());

// The limit options hold a lazy function so the env is read per request; call
// it the same way express-rate-limit would.
const configuredLimit = (options: Partial<Options>): number =>
  typeof options.limit === "function"
    ? Number((options.limit as () => number)())
    : options.limit ?? 0;

const registerClient = async (
  redirectUri = CALLBACK,
  clientName = "test client",
): Promise<string> => {
  const res = await request(baseUrl)
    .post("/oauth/register")
    .send({ client_name: clientName, redirect_uris: [redirectUri] });

  assert.equal(res.status, 201);
  assert.equal(res.body.token_endpoint_auth_method, "none");
  return res.body.client_id as string;
};

const authorizeBody = (
  clientId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  client_id: clientId,
  redirect_uri: CALLBACK,
  response_type: "code",
  code_challenge: challengeOf(verifier),
  code_challenge_method: "S256",
  scope: "notes:read notes:write",
  state: "xyz",
  email,
  password: PASSWORD,
  decision: "allow",
  ...overrides,
});

const approve = (body: Record<string, unknown>) =>
  request(baseUrl).post("/oauth/authorize").type("form").send(body);

const exchangeCode = (
  fields: Record<string, string>,
  json = false,
) => {
  const req = request(baseUrl).post("/oauth/token");
  return json ? req.send(fields) : req.type("form").send(fields);
};

interface RedirectLike {
  status: number;
  headers: { location?: string };
}

const codeFrom = (res: RedirectLike): string => {
  assert.equal(res.status, 302);
  assert.ok(res.headers.location, "expected a redirect");

  const code = new URL(res.headers.location).searchParams.get("code");
  assert.ok(code, "expected a code in the redirect");
  return code;
};

test("start server", { skip }, async () => {
  const stamp = Date.now();
  email = `oauth${stamp}@test.dev`;
  googleEmail = `oauth-google${stamp}@test.dev`;

  const user = await prisma.user.create({
    data: {
      email,
      username: "oauth",
      password: await bcrypt.hash(PASSWORD, 10),
    },
  });
  userId = user.id;

  await prisma.user.create({
    data: {
      email: googleEmail,
      username: "oauth-google",
      googleId: `google-${stamp}`,
    },
  });

  originalPublicUrl = process.env.MCP_PUBLIC_URL;
  originalRegisterLimit = process.env.OAUTH_REGISTER_LIMIT;
  process.env.OAUTH_REGISTER_LIMIT = "1000";
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MCP_PUBLIC_URL = baseUrl;
});

// Must run before any other register call: it asserts on a clean per-IP bucket.
test("registrations are capped at OAUTH_REGISTER_LIMIT per IP", { skip }, async () => {
  const previous = process.env.OAUTH_REGISTER_LIMIT;
  process.env.OAUTH_REGISTER_LIMIT = "2";

  try {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push(
        (
          await request(baseUrl)
            .post("/oauth/register")
            .send({ client_name: "limited", redirect_uris: [CALLBACK] })
        ).status,
      );
    }

    assert.deepEqual(statuses, [201, 201, 429]);
  } finally {
    if (previous === undefined) delete process.env.OAUTH_REGISTER_LIMIT;
    else process.env.OAUTH_REGISTER_LIMIT = previous;
  }
});

test("the OAuth limiter defaults are 10/120/60 requests per minute", () => {
  const names = [
    "OAUTH_REGISTER_LIMIT",
    "OAUTH_TOKEN_LIMIT",
    "OAUTH_PAGE_LIMIT",
  ] as const;
  const saved = names.map((name) => process.env[name]);

  for (const name of names) delete process.env[name];

  try {
    assert.equal(configuredLimit(oauthRegisterOptions), 10);
    assert.equal(configuredLimit(oauthTokenOptions), 120);
    assert.equal(configuredLimit(oauthPageOptions), 60);
  } finally {
    names.forEach((name, index) => {
      const value = saved[index];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  }
});

test("metadata documents advertise this server and S256", { skip }, async () => {
  const resource = await request(baseUrl).get(
    "/.well-known/oauth-protected-resource",
  );

  assert.equal(resource.status, 200);
  assert.equal(resource.body.resource, `${baseUrl}/mcp`);
  assert.deepEqual(resource.body.authorization_servers, [baseUrl]);
  assert.deepEqual(resource.body.scopes_supported, ["notes:read", "notes:write"]);

  const server = await request(baseUrl).get(
    "/.well-known/oauth-authorization-server",
  );

  assert.equal(server.status, 200);
  assert.equal(server.body.issuer, baseUrl);
  assert.equal(server.body.authorization_endpoint, `${baseUrl}/oauth/authorize`);
  assert.equal(server.body.token_endpoint, `${baseUrl}/oauth/token`);
  assert.equal(server.body.registration_endpoint, `${baseUrl}/oauth/register`);
  assert.equal(server.body.revocation_endpoint, `${baseUrl}/oauth/revoke`);
  assert.deepEqual(server.body.response_types_supported, ["code"]);
  assert.deepEqual(server.body.grant_types_supported, [
    "authorization_code",
    "refresh_token",
  ]);
  assert.deepEqual(server.body.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(server.body.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(server.body.scopes_supported, ["notes:read", "notes:write"]);
});

test("registration issues a public client and rejects unsafe redirect uris", { skip }, async () => {
  const res = await request(baseUrl)
    .post("/oauth/register")
    .send({ client_name: "test client", redirect_uris: [CALLBACK] });

  assert.equal(res.status, 201);
  assert.match(res.body.client_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(res.body.redirect_uris, [CALLBACK]);
  assert.equal(res.body.token_endpoint_auth_method, "none");

  const stored = await prisma.oauthClient.findUnique({
    where: { id: res.body.client_id },
  });
  assert.deepEqual(stored?.redirectUris, [CALLBACK]);

  for (const redirectUris of [["http://evil.example/cb"], [], ["notaurl"]]) {
    const bad = await request(baseUrl)
      .post("/oauth/register")
      .send({ client_name: "bad", redirect_uris: redirectUris });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "invalid_redirect_uri");
  }
});

test("the authorize page is script-free and shows the redirect host", { skip }, async () => {
  const clientId = await registerClient(
    "https://evil.example/cb",
    "<script>alert(1)</script>",
  );
  const res = await request(baseUrl).get("/oauth/authorize").query({
    client_id: clientId,
    redirect_uri: "https://evil.example/cb",
    response_type: "code",
    code_challenge: challengeOf(verifier),
    code_challenge_method: "S256",
    scope: "notes:read notes:write",
    state: "xyz",
    resource: `${baseUrl}/mcp`,
  });

  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/html/);
  assert.ok(res.text.includes(`name="code_challenge" value="${challengeOf(verifier)}"`));
  assert.ok(res.text.includes(`name="code_challenge_method" value="S256"`));
  assert.ok(res.text.includes(`name="state" value="xyz"`));
  assert.ok(res.text.includes(`name="resource" value="${baseUrl}/mcp"`));
  assert.match(res.text, /name="email"/);
  assert.match(res.text, /name="password"/);
  assert.match(res.text, /value="allow"/);
  assert.match(res.text, /value="deny"/);
  // Browsers apply form-action to the post-submit redirect; the client's
  // origin must be allowed or "Allow" dead-ends in Chrome.
  const csp = String(res.headers["content-security-policy"] ?? "");
  assert.match(csp, /form-action 'self' https:\/\/evil\.example(;|$)/);
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /script-src/);
  // The destination is the host the code will be delivered to, not just the
  // registrant's chosen name.
  assert.ok(res.text.includes("You'll return to"));
  assert.ok(res.text.includes("evil.example"));
  // The client's own name is attacker-controlled: it must not become markup.
  assert.ok(res.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(res.text, /<script/i);
});

test("a malformed PKCE challenge is invalid_request at authorize", { skip }, async () => {
  const clientId = await registerClient();
  const res = await request(baseUrl).get("/oauth/authorize").query({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: "abc",
    code_challenge_method: "S256",
    state: "xyz",
  });

  assert.equal(res.status, 302);
  assert.ok(res.headers.location);
  const location = new URL(res.headers.location);
  assert.equal(location.origin + location.pathname, CALLBACK);
  assert.equal(location.searchParams.get("error"), "invalid_request");
  assert.equal(location.searchParams.get("state"), "xyz");
});

test("an unknown client renders an error page, never a redirect", { skip }, async () => {
  const res = await request(baseUrl).get("/oauth/authorize").query({
    client_id: "not-a-client",
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: challengeOf(verifier),
    code_challenge_method: "S256",
  });

  assert.equal(res.status, 400);
  assert.equal(res.headers.location, undefined);
  assert.match(res.text, /invalid_grant/);
});

test("malformed and oversized OAuth bodies use the OAuth error shape", { skip }, async () => {
  const malformed = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"grant_type":',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "invalid_request",
    error_description: "Malformed request body",
  });

  const oversized = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `pad=${"x".repeat(20_000)}`,
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: "invalid_request",
    error_description: "Request body too large",
  });
});

test("register → authorize → token yields a working access token", { skip }, async () => {
  const clientId = await registerClient();
  const approveRes = await approve(
    authorizeBody(clientId, { resource: `${baseUrl}/mcp` }),
  );
  const code = codeFrom(approveRes);
  const location = new URL(approveRes.headers.location as string);
  assert.equal(location.searchParams.get("state"), "xyz");

  const tok = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
    resource: `${baseUrl}/mcp`,
  });

  assert.equal(tok.status, 200);
  assert.equal(tok.headers["cache-control"], "no-store");
  assert.match(tok.body.access_token, /^nf_at_/);
  assert.match(tok.body.refresh_token, /^nf_rt_/);
  assert.equal(tok.body.token_type, "Bearer");
  assert.equal(tok.body.expires_in, ACCESS_TOKEN_TTL_SECONDS);
  assert.equal(tok.body.scope, "notes:read notes:write");

  const row = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(tok.body.access_token) },
  });
  assert.ok(row);
  assert.equal(row.accessTokenHash, hashToken(tok.body.access_token));
  assert.equal(row.refreshTokenHash, hashToken(tok.body.refresh_token));
  assert.equal(row.resource, `${baseUrl}/mcp`);
  assert.deepEqual(row.scopes, ["notes:read", "notes:write"]);
  // A fresh pair owns its own id as the family id.
  assert.equal(row.familyId, String(row.id));
  // Only hashes are stored: the plaintext token must not appear anywhere.
  assert.equal(JSON.stringify(row).includes(tok.body.access_token), false);
  assert.equal(JSON.stringify(row).includes(tok.body.refresh_token), false);
  assert.equal(row.accessExpiresAt.getTime() - Date.now() > 3_590_000, true);
  assert.equal(row.accessExpiresAt.getTime() - Date.now() <= 3_600_000, true);
  assert.ok(row.refreshExpiresAt);
  const refreshLifetime = row.refreshExpiresAt.getTime() - Date.now();
  assert.ok(
    refreshLifetime > REFRESH_TOKEN_TTL_MS - 10_000 &&
      refreshLifetime <= REFRESH_TOKEN_TTL_MS,
  );

  // The code lived exactly 60 seconds, and only its hash was stored.
  const codeRow = await prisma.oauthCode.findUnique({
    where: { id: hashToken(code) },
  });
  assert.ok(codeRow);
  assert.equal(codeRow.id, hashToken(code));
  assert.notEqual(codeRow.id, code);
  assert.equal(
    await prisma.oauthCode.findUnique({ where: { id: code } }),
    null,
  );
  const codeLifetime = codeRow.expiresAt.getTime() - codeRow.createdAt.getTime();
  assert.ok(
    codeLifetime >= AUTHORIZATION_CODE_TTL_MS - 1_000 &&
      codeLifetime <= AUTHORIZATION_CODE_TTL_MS + 1_000,
  );

  // The token actually works at the MCP gate.
  const mcp = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${tok.body.access_token}`)
    .send({});
  assert.notEqual(mcp.status, 401);

  const again = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
    resource: `${baseUrl}/mcp`,
  });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "invalid_grant");
});

test("a wrong verifier is invalid_grant and the code is spent", { skip }, async () => {
  const clientId = await registerClient();
  const code = codeFrom(await approve(authorizeBody(clientId)));

  const missing = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: CALLBACK,
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "invalid_request");

  const wrong = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: "w".repeat(43),
    redirect_uri: CALLBACK,
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, "invalid_grant");

  // A failed exchange claims the code, so a later correct attempt cannot win.
  const retry = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
  });
  assert.equal(retry.body.error, "invalid_grant");
});

test("refresh rotation replaces the token and replay revokes the family", { skip }, async () => {
  const clientId = await registerClient();
  const code = codeFrom(await approve(authorizeBody(clientId)));
  const first = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
  });
  assert.equal(first.status, 200);

  // A JSON body must work as well as a form body.
  const rotated = await exchangeCode(
    {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: clientId,
    },
    true,
  );
  assert.equal(rotated.status, 200);
  assert.match(rotated.body.access_token, /^nf_at_/);
  assert.notEqual(rotated.body.refresh_token, first.body.refresh_token);

  const oldRow = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(first.body.access_token) },
  });
  assert.ok(oldRow?.revokedAt, "the rotated-from row must be revoked");

  const newRow = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(rotated.body.access_token) },
  });
  assert.equal(newRow?.rotatedFromId, oldRow?.id);
  assert.ok(oldRow?.familyId);
  assert.equal(newRow?.familyId, oldRow?.familyId);

  // Replaying the first refresh token is theft: the whole family dies.
  const replay = await exchangeCode(
    {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: clientId,
    },
    true,
  );
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, "invalid_grant");

  const afterFamily = await exchangeCode(
    {
      grant_type: "refresh_token",
      refresh_token: rotated.body.refresh_token,
      client_id: clientId,
    },
    true,
  );
  assert.equal(afterFamily.body.error, "invalid_grant");

  const killed = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(rotated.body.access_token) },
  });
  assert.ok(killed?.revokedAt, "the successor must be revoked with the family");

  const mcp = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${rotated.body.access_token}`)
    .send({});
  assert.equal(mcp.status, 401);
});

test("concurrent rotations have one winner and leave no live family member", { skip }, async () => {
  const clientId = await registerClient();
  // A direct code row keeps this test off the authorize-page budget.
  const code = generateToken("code").token;
  await prisma.oauthCode.create({
    data: {
      id: hashToken(code),
      clientId,
      userId,
      redirectUri: CALLBACK,
      scopes: ["notes:read"],
      codeChallenge: challengeOf(verifier),
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const first = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
  });
  assert.equal(first.status, 200);

  const refresh = first.body.refresh_token as string;
  const [a, b] = await Promise.all([
    exchangeCode(
      { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId },
      true,
    ),
    exchangeCode(
      { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId },
      true,
    ),
  ]);

  const winners = [a, b].filter((res) => res.status === 200);
  const losers = [a, b].filter(
    (res) => res.status === 400 && res.body.error === "invalid_grant",
  );
  assert.equal(winners.length, 1, "exactly one concurrent rotation wins");
  assert.equal(losers.length, 1, "the other is invalid_grant");

  const winner = winners[0];
  assert.ok(winner);
  const winnerRow = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(winner.body.access_token) },
    select: { familyId: true },
  });
  assert.ok(winnerRow?.familyId);

  // The loser claims nothing and revokes the family, so no live row (and no
  // usable access token) survives the collision.
  assert.equal(
    await prisma.oauthToken.count({
      where: { familyId: winnerRow.familyId, revokedAt: null },
    }),
    0,
  );

  const mcp = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${winner.body.access_token}`)
    .send({});
  assert.equal(mcp.status, 401);
});

test("an unregistered redirect_uri is refused without redirecting", { skip }, async () => {
  const clientId = await registerClient();
  const res = await approve({
    ...authorizeBody(clientId),
    redirect_uri: "http://localhost:9999/other",
  });

  assert.equal(res.status, 400);
  assert.equal(res.headers.location, undefined);
  assert.match(res.text, /invalid_grant/);
});

test("a Google-only account cannot complete the flow and learns nothing", { skip }, async () => {
  const clientId = await registerClient();
  const res = await approve(authorizeBody(clientId, { email: googleEmail }));

  assert.equal(res.status, 200);
  assert.match(res.text, /Invalid email or password\./);
  assert.doesNotMatch(res.text, /signed up with google|google sign-in/i);
  assert.doesNotMatch(res.text, /not found/i);
  assert.equal(await prisma.oauthCode.count({ where: { clientId } }), 0);
});

test("a wrong password and an unknown email get the same generic message", { skip }, async () => {
  const clientId = await registerClient();
  const wrong = await approve(authorizeBody(clientId, { password: "Wrong1!pass" }));
  const unknown = await approve(
    authorizeBody(clientId, { email: `nobody${Date.now()}@test.dev` }),
  );

  for (const res of [wrong, unknown]) {
    assert.equal(res.status, 200);
    assert.match(res.text, /Invalid email or password\./);
    assert.doesNotMatch(res.text, /signed up with google|google sign-in/i);
  }

  assert.equal(await prisma.oauthCode.count({ where: { clientId } }), 0);
});

test("deny redirects with access_denied and issues no code", { skip }, async () => {
  const clientId = await registerClient();
  const res = await approve(authorizeBody(clientId, { decision: "deny" }));

  assert.equal(res.status, 302);
  const location = new URL(res.headers.location as string);
  assert.equal(location.searchParams.get("error"), "access_denied");
  assert.equal(location.searchParams.get("state"), "xyz");
  assert.equal(location.searchParams.get("code"), null);
  assert.equal(await prisma.oauthCode.count({ where: { clientId } }), 0);
});

test("an expired code is invalid_grant", { skip }, async () => {
  const clientId = await registerClient();
  const code = generateToken("code").token;

  await prisma.oauthCode.create({
    data: {
      id: hashToken(code),
      clientId,
      userId,
      redirectUri: CALLBACK,
      scopes: ["notes:read"],
      codeChallenge: challengeOf(verifier),
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const res = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_grant");
});

test("a code whose user was deleted is invalid_grant, not a 500", { skip }, async () => {
  const clientId = await registerClient();
  const doomed = await prisma.user.create({
    data: {
      email: `oauth-doomed${Date.now()}@test.dev`,
      username: "doomed",
      password: await bcrypt.hash(PASSWORD, 10),
    },
  });
  const code = generateToken("code").token;

  await prisma.oauthCode.create({
    data: {
      id: hashToken(code),
      clientId,
      userId: doomed.id,
      redirectUri: CALLBACK,
      scopes: ["notes:read"],
      codeChallenge: challengeOf(verifier),
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.user.delete({ where: { id: doomed.id } });

  const res = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_grant");
});

test("a code redeemed for another resource is invalid_grant", { skip }, async () => {
  const clientId = await registerClient();
  const code = codeFrom(
    await approve(authorizeBody(clientId, { resource: `${baseUrl}/mcp` })),
  );

  const res = await exchangeCode({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK,
    resource: "https://other.example/mcp",
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_grant");
});

test("an access token bound to another resource is refused at /mcp", { skip }, async () => {
  // Defense in depth: the issuer never mints such a token, but the gate itself
  // must not honour a row that names a foreign resource.
  const clientId = await registerClient();
  const tokens = await issueTokens(
    userId,
    clientId,
    ["notes:read"],
    "https://other.example/mcp",
  );

  const res = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${tokens.accessToken}`)
    .send({});
  assert.equal(res.status, 401);
});

test("revoke kills an access token and always answers 200", { skip }, async () => {
  const clientId = await registerClient();
  const tokens = await issueTokens(
    userId,
    clientId,
    ["notes:read"],
    `${baseUrl}/mcp`,
  );

  const live = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${tokens.accessToken}`)
    .send({});
  assert.notEqual(live.status, 401);

  const res = await request(baseUrl)
    .post("/oauth/revoke")
    .send({ token: tokens.accessToken });
  assert.equal(res.status, 200);

  const row = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: hashToken(tokens.accessToken) },
  });
  assert.ok(row?.revokedAt);

  const dead = await request(baseUrl)
    .post("/mcp")
    .set("Authorization", `Bearer ${tokens.accessToken}`)
    .send({});
  assert.equal(dead.status, 401);

  const unknown = await request(baseUrl)
    .post("/oauth/revoke")
    .send({ token: "nf_at_unknown" });
  assert.equal(unknown.status, 200);
});

test("expired rows are deleted while unexpired revoked rows survive", { skip }, async () => {
  const clientId = await registerClient();
  const now = Date.now();

  const liveRevoked = await prisma.oauthToken.create({
    data: {
      userId,
      clientId,
      accessTokenHash: generateToken("access").hash,
      refreshTokenHash: generateToken("refresh").hash,
      scopes: ["notes:read"],
      accessExpiresAt: new Date(now + 3_600_000),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      revokedAt: new Date(now - 1_000),
      familyId: "cleanup-live",
    },
  });

  const expiredRefresh = await prisma.oauthToken.create({
    data: {
      userId,
      clientId,
      accessTokenHash: generateToken("access").hash,
      scopes: ["notes:read"],
      accessExpiresAt: new Date(now + 3_600_000),
      refreshExpiresAt: new Date(now - 1_000),
      familyId: "cleanup-dead-refresh",
    },
  });

  const expiredAccessOnly = await prisma.oauthToken.create({
    data: {
      userId,
      clientId,
      accessTokenHash: generateToken("access").hash,
      scopes: ["notes:read"],
      accessExpiresAt: new Date(now - 1_000),
      refreshExpiresAt: null,
      revokedAt: new Date(now - 2_000),
      familyId: "cleanup-dead-access",
    },
  });

  await cleanupExpired();

  assert.ok(
    await prisma.oauthToken.findUnique({ where: { id: liveRevoked.id } }),
    "a revoked row that has not expired must survive for replay detection",
  );
  assert.equal(
    await prisma.oauthToken.findUnique({ where: { id: expiredRefresh.id } }),
    null,
  );
  assert.equal(
    await prisma.oauthToken.findUnique({
      where: { id: expiredAccessOnly.id },
    }),
    null,
  );
});

test("stale unused DCR clients are swept while used ones survive", { skip }, async () => {
  const stamp = Date.now();
  const hundredDays = 100 * 24 * 60 * 60 * 1000;
  const staleUnused = await prisma.oauthClient.create({
    data: {
      id: randomUUID(),
      name: `stale-unused-${stamp}`,
      redirectUris: [CALLBACK],
      createdAt: new Date(Date.now() - hundredDays),
    },
  });
  const staleUsed = await prisma.oauthClient.create({
    data: {
      id: randomUUID(),
      name: `stale-used-${stamp}`,
      redirectUris: [CALLBACK],
      createdAt: new Date(Date.now() - hundredDays),
      lastUsedAt: new Date(Date.now() - hundredDays),
    },
  });
  const recentUnused = await prisma.oauthClient.create({
    data: {
      id: randomUUID(),
      name: `recent-unused-${stamp}`,
      redirectUris: [CALLBACK],
      lastUsedAt: new Date(),
    },
  });
  // Fresh, never used: exactly the row the old predicate deleted mid-flow.
  const freshUnused = await prisma.oauthClient.create({
    data: {
      id: randomUUID(),
      name: `fresh-unused-${stamp}`,
      redirectUris: [CALLBACK],
    },
  });

  await prisma.oauthToken.create({
    data: {
      userId,
      clientId: staleUsed.id,
      accessTokenHash: generateToken("access").hash,
      scopes: ["notes:read"],
      accessExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  await cleanupUnusedClients();

  assert.equal(
    await prisma.oauthClient.findUnique({ where: { id: staleUnused.id } }),
    null,
  );
  assert.ok(
    await prisma.oauthClient.findUnique({ where: { id: staleUsed.id } }),
    "a client with a token must never be swept",
  );
  assert.ok(
    await prisma.oauthClient.findUnique({ where: { id: recentUnused.id } }),
    "a recently used client is not stale",
  );
  assert.ok(
    await prisma.oauthClient.findUnique({ where: { id: freshUnused.id } }),
    "a fresh client is younger than 90 days even with no lastUsedAt",
  );
});

test("a fresh registration survives the next register's sweep and can authorize", { skip }, async () => {
  const first = await registerClient(CALLBACK, "fresh client");

  // This register runs cleanupUnusedClients before inserting itself. The first
  // client has lastUsedAt: null and no tokens, but is younger than 90 days.
  await registerClient(CALLBACK, "second client");

  assert.ok(
    await prisma.oauthClient.findUnique({ where: { id: first } }),
    "a just-registered client must survive the sweep",
  );

  const res = await approve(authorizeBody(first));
  const code = codeFrom(res);
  const row = await prisma.oauthCode.findUnique({
    where: { id: hashToken(code) },
  });
  assert.ok(row, "the fresh client's authorize flow must still issue a code");
  assert.equal(row.clientId, first);
});

test("stop server", { skip }, async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (originalPublicUrl === undefined) delete process.env.MCP_PUBLIC_URL;
  else process.env.MCP_PUBLIC_URL = originalPublicUrl;

  if (originalRegisterLimit === undefined) {
    delete process.env.OAUTH_REGISTER_LIMIT;
  } else {
    process.env.OAUTH_REGISTER_LIMIT = originalRegisterLimit;
  }
});
