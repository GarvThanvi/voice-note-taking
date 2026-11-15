import test from "node:test";
import assert from "node:assert/strict";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { signInternalToken } from "./internalJwt.js";

// A bare `tsx --test` process has no dotenv layer, so JWT_SECRET is unset here.
// Pin a non-production value before signing; never inherit an ambient one.
process.env.JWT_SECRET ??= "test-secret-not-for-production";

test("signInternalToken embeds the user id and the internal flag", () => {
  const decoded = jwt.verify(
    signInternalToken(7),
    process.env.JWT_SECRET!,
  ) as JwtPayload;

  assert.equal(decoded.userId, 7);
  assert.equal(decoded.internal, true);
});

test("signInternalToken expires after exactly five minutes", () => {
  const decoded = jwt.verify(
    signInternalToken(1),
    process.env.JWT_SECRET!,
  ) as JwtPayload;

  assert.equal(decoded.exp! - decoded.iat!, 300);
});

test("a token signed for user 7 does not verify with another secret", () => {
  assert.throws(() => jwt.verify(signInternalToken(7), "wrong-secret"));
});
