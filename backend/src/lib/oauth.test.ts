import test from "node:test";
import assert from "node:assert/strict";
import {
  checkResource,
  isAllowedRedirectUri,
  oauthError,
  parseAuthorizeRequest,
} from "./oauth.js";
import { READ_SCOPE, WRITE_SCOPE } from "./mcpTokens.js";

const challenge = "a".repeat(43);

const base = {
  client_id: "c1",
  redirect_uri: "https://claude.ai/cb",
  response_type: "code",
  code_challenge: challenge,
  code_challenge_method: "S256",
};

test("redirect uris allow https and localhost http only", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:33418/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8080/cb"), true);
  assert.equal(isAllowedRedirectUri("http://evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("notaurl"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
  // RFC 6749: a redirection endpoint URI must not carry a fragment.
  assert.equal(isAllowedRedirectUri("https://claude.ai/cb#fragment"), false);
});

test("resource binding accepts omission and exact matches only", () => {
  assert.equal(checkResource(undefined, "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://nf.dev/mcp", "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://nf.dev/mcp/", "https://nf.dev/mcp"), true);
  assert.equal(checkResource("https://other.dev/mcp", "https://nf.dev/mcp"), false);
});

test("authorize params require the code flow and a well-formed S256 challenge", () => {
  const parsed = parseAuthorizeRequest(base);
  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    assert.equal(parsed.value.clientId, "c1");
    assert.equal(parsed.value.redirectUri, "https://claude.ai/cb");
    assert.equal(parsed.value.codeChallenge, challenge);
    assert.equal(parsed.value.codeChallengeMethod, "S256");
    assert.deepEqual(parsed.value.scopes, [READ_SCOPE]);
    // Omitted optional parameters stay absent rather than becoming "undefined".
    assert.equal(parsed.value.state, undefined);
    assert.equal(parsed.value.resource, undefined);
  }

  assert.deepEqual(parseAuthorizeRequest({ ...base, response_type: "token" }), {
    ok: false,
    error: "unsupported_response_type",
    error_description: "Only response_type=code is supported",
  });
  assert.deepEqual(parseAuthorizeRequest({ ...base, code_challenge_method: "plain" }), {
    ok: false,
    error: "invalid_request",
    error_description: "code_challenge_method must be S256",
  });
  // The challenge is validated here, not at the token endpoint: a malformed
  // shape is a malformed authorization request.
  assert.deepEqual(parseAuthorizeRequest({ ...base, code_challenge: "abc" }), {
    ok: false,
    error: "invalid_request",
    error_description: "code_challenge must be 43 base64url characters",
  });
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge: "" }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge: "a".repeat(42) }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge: `${"a".repeat(42)}+` }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge_method: "" }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, client_id: "" }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, redirect_uri: "" }).ok, false);

  assert.deepEqual(parseAuthorizeRequest({ ...base, scope: "notes:read admin" }), {
    ok: false,
    error: "invalid_scope",
    error_description: "Unknown scope",
  });
});

test("authorize params default the scope and echo state and resource untouched", () => {
  const parsed = parseAuthorizeRequest({
    ...base,
    scope: "notes:write",
    state: "xyz",
    resource: "https://nf.dev/mcp",
  });

  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    // parseScopes always grants read so a write token can still search.
    assert.deepEqual(parsed.value.scopes, [READ_SCOPE, WRITE_SCOPE]);
    assert.equal(parsed.value.state, "xyz");
    assert.equal(parsed.value.resource, "https://nf.dev/mcp");
  }
});

test("repeated or non-string parameters are malformed", () => {
  assert.equal(parseAuthorizeRequest({ ...base, client_id: ["c1", "c2"] }).ok, false);
  assert.equal(parseAuthorizeRequest({ ...base, code_challenge: [challenge] }).ok, false);
  assert.equal(parseAuthorizeRequest({}).ok, false);
});

test("oauthError builds the RFC 6749 body", () => {
  assert.deepEqual(oauthError("invalid_grant", "Bad code"), {
    error: "invalid_grant",
    error_description: "Bad code",
  });
});
