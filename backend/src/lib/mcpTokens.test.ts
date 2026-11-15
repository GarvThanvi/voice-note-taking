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
