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
