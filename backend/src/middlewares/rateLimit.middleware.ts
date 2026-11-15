import {
  rateLimit,
  ipKeyGenerator,
  type Options,
} from "express-rate-limit";

const TOO_MANY_REQUESTS = {
  success: false,
  message: "Too many requests. Please try again later.",
};

const WINDOW_MS = 60 * 1000;

// Read on every request, not at import: a test can lower a limit in-process.
const envLimit = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

// Pre-auth backstop for rotating credentials. Only failures count: a 401 from
// a made-up token hits this bucket, while a legitimate authenticated request
// (2xx) does not, so two tokens behind one IP can never exhaust each other's
// budget here. The ceiling is deliberately far above the per-token limit so it
// only trips on a flood.
export const mcpPreAuthOptions: Partial<Options> = {
  windowMs: WINDOW_MS,
  limit: () => envLimit("MCP_PREAUTH_LIMIT", 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
};

// Skipped once a credential has resolved, so real clients are governed by
// their token bucket instead of sharing an IP bucket.
export const mcpUnauthOptions: Partial<Options> = {
  windowMs: WINDOW_MS,
  limit: () => envLimit("MCP_UNAUTH_LIMIT", 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  skip: (req) => req.mcpPrincipal !== undefined,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
};

// Per-credential budget: the key is the stored token's hash, never the raw
// header, so two tokens from one IP never share a bucket.
export const mcpTokenOptions: Partial<Options> = {
  windowMs: WINDOW_MS,
  limit: () => envLimit("MCP_TOKEN_LIMIT", 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  skip: (req) => req.mcpPrincipal === undefined,
  keyGenerator: (req) =>
    req.mcpPrincipal?.tokenHash ?? ipKeyGenerator(req.ip ?? ""),
};

export const mcpPreAuthLimiter = rateLimit(mcpPreAuthOptions);
export const mcpUnauthLimiter = rateLimit(mcpUnauthOptions);
export const mcpTokenLimiter = rateLimit(mcpTokenOptions);

// Router-level budgets for the OAuth server. OAuth lives above globalLimiter,
// so each surface gets its own bucket instead of one shared per-IP cap that a
// cloud client's egress IP could exhaust during a launch.
const oauthLimiterOptions = (
  envName: string,
  fallback: number,
): Partial<Options> => ({
  windowMs: WINDOW_MS,
  limit: () => envLimit(envName, fallback),
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});

// DCR writes a row, so it is the tightest surface.
export const oauthRegisterOptions = oauthLimiterOptions(
  "OAUTH_REGISTER_LIMIT",
  10,
);
export const oauthRegisterLimiter = rateLimit(oauthRegisterOptions);

// Token/revoke are machine-to-machine and may burst when a provider reconnects
// many users at once.
export const oauthTokenOptions = oauthLimiterOptions("OAUTH_TOKEN_LIMIT", 120);
export const oauthTokenLimiter = rateLimit(oauthTokenOptions);

// Discovery documents and the consent page: cheap, but still a backstop.
export const oauthPageOptions = oauthLimiterOptions("OAUTH_PAGE_LIMIT", 60);
export const oauthPageLimiter = rateLimit(oauthPageOptions);

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  keyGenerator: (req) =>
    req.userId !== undefined
      ? `user:${req.userId}`
      : ipKeyGenerator(req.ip ?? ""),
});
