import type { RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";

const INTERNAL_HEADER = "x-noteflow-internal";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export const isLoopback = (address: string | undefined): boolean =>
  address !== undefined && LOOPBACK_ADDRESSES.has(address);

// Hashing first keeps the comparison length-safe: timingSafeEqual throws on
// differing buffer lengths, which would otherwise leak the secret's length.
const secureEqual = (provided: string, expected: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );

export const internalOnly: RequestHandler = (req, res, next) => {
  const secret = process.env.MCP_INTERNAL_SECRET;

  // Fail closed when the secret is unset or empty.
  if (!secret) {
    res.status(404).end();
    return;
  }

  // Use the TCP socket address; req.ip is proxy- and header-influenced.
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(404).end();
    return;
  }

  const provided = req.get(INTERNAL_HEADER);

  if (!provided || !secureEqual(provided, secret)) {
    res.status(404).end();
    return;
  }

  next();
};
