import { mcpPublicUrl } from "./publicUrl.js";
import {
  generateToken,
  hashToken,
  parseScopes,
  verifyPkce,
  type Scope,
} from "./mcpTokens.js";

// Lifetimes from the design: an hour of access, a month of refresh, and a code
// that is useless to anyone who reads the redirect off a screen.
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;

const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  responseType: "code";
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: Scope[];
  state?: string;
  resource?: string;
}

export type AuthorizeParseResult =
  | { ok: true; value: AuthorizeRequest }
  | { ok: false; error: string; error_description: string };

export interface OAuthErrorBody {
  error: string;
  error_description: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type RefreshRotation =
  | {
      ok: true;
      tokens: IssuedTokens;
      scopes: string[];
      resource: string | null;
    }
  | { ok: false; error: string; error_description: string };

export interface AuthorizationCodeInput {
  clientId: string;
  userId: number;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  resource?: string;
}

export interface AuthorizationCodeRedemption {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}

export type CodeRedemption =
  | {
      ok: true;
      userId: number;
      clientId: string;
      scopes: string[];
      resource: string | null;
    }
  | { ok: false; error: string; error_description: string };

const INVALID_GRANT: { ok: false; error: string; error_description: string } = {
  ok: false,
  error: "invalid_grant",
  error_description: "Invalid authorization code",
};

const INVALID_REFRESH: { ok: false; error: string; error_description: string } = {
  ok: false,
  error: "invalid_grant",
  error_description: "Invalid refresh token",
};

// The only database handle in this module; loaded lazily so the pure helper
// tests never construct a Prisma client.
const db = async () => (await import("./prisma.js")).prisma;

// The resource this server mints tokens for. The protected-resource metadata
// advertises the same string, so a client that echoes it matches exactly.
export function mcpResourceUrl(): string {
  return `${mcpPublicUrl()}/mcp`;
}

export function oauthError(
  code: string,
  description: string,
): OAuthErrorBody {
  return { error: code, error_description: description };
}

// Any https origin is acceptable; plain http only on a loopback name, so a
// code can never be delivered over the wire to a third-party host.
export function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return parsed.hash === "";
  if (parsed.protocol !== "http:") return false;

  return (
    parsed.hash === "" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  );
}

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

// RFC 8707: omitting the resource means "the default one", and a trailing slash
// is not a different endpoint. Anything else is a mismatch.
export function checkResource(
  resource: string | undefined,
  expected: string,
): boolean {
  if (resource === undefined) return true;

  return trimTrailingSlashes(resource) === trimTrailingSlashes(expected);
}

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// Validates only the shape of the authorization request. Client and redirect
// lookups need the database and stay in the route.
export function parseAuthorizeRequest(
  query: Record<string, unknown>,
): AuthorizeParseResult {
  const clientId = readString(query.client_id)?.trim();
  if (!clientId) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "client_id is required",
    };
  }

  const redirectUri = readString(query.redirect_uri);
  if (!redirectUri) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "redirect_uri is required",
    };
  }

  if (readString(query.response_type) !== "code") {
    return {
      ok: false,
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported",
    };
  }

  if (readString(query.code_challenge_method) !== "S256") {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "code_challenge_method must be S256",
    };
  }

  const codeChallenge = readString(query.code_challenge);
  if (!codeChallenge || !PKCE_CHALLENGE.test(codeChallenge)) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "code_challenge must be 43 base64url characters",
    };
  }

  const scopes = parseScopes(readString(query.scope));
  if (scopes === null) {
    return {
      ok: false,
      error: "invalid_scope",
      error_description: "Unknown scope",
    };
  }

  const value: AuthorizeRequest = {
    clientId,
    redirectUri,
    responseType: "code",
    codeChallenge,
    codeChallengeMethod: "S256",
    scopes,
  };

  const state = readString(query.state);
  if (state !== undefined) value.state = state;

  const resource = readString(query.resource);
  if (resource !== undefined) value.resource = resource;

  return { ok: true, value };
}

const touchClient = (clientId: string): void => {
  // Bookkeeping only: a failed touch must never fail the grant.
  void db()
    .then((prisma) =>
      prisma.oauthClient.update({
        where: { id: clientId },
        data: { lastUsedAt: new Date() },
      }),
    )
    .catch(() => {});
};

const insertTokens = async (
  userId: number,
  clientId: string,
  scopes: string[],
  resource: string | null | undefined,
): Promise<IssuedTokens> => {
  const prisma = await db();
  const access = generateToken("access");
  const refresh = generateToken("refresh");
  const now = Date.now();

  // The row id is assigned by the database, so the family id (its own id as a
  // string) is written in the same transaction as the insert.
  await prisma.$transaction(async (tx) => {
    const row = await tx.oauthToken.create({
      data: {
        userId,
        clientId,
        accessTokenHash: access.hash,
        refreshTokenHash: refresh.hash,
        scopes,
        resource: resource ?? null,
        accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      },
    });

    await tx.oauthToken.update({
      where: { id: row.id },
      data: { familyId: String(row.id) },
    });
  });

  touchClient(clientId);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
};

export async function issueTokens(
  userId: number,
  clientId: string,
  scopes: string[],
  resource: string | null | undefined,
): Promise<IssuedTokens> {
  return insertTokens(userId, clientId, scopes, resource);
}

export async function createAuthorizationCode(
  input: AuthorizationCodeInput,
): Promise<string> {
  const prisma = await db();
  const code = generateToken("code").token;

  // Only the hash is stored; the plaintext code exists once, in the redirect.
  await prisma.oauthCode.create({
    data: {
      id: hashToken(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      resource: input.resource ?? null,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  });

  return code;
}

// A code is claimed before any validation: one failed attempt burns it, so the
// verifier cannot be guessed against a live code, and a replay finds usedAt set.
export async function redeemAuthorizationCode(
  input: AuthorizationCodeRedemption,
): Promise<CodeRedemption> {
  const prisma = await db();
  const record = await prisma.oauthCode.findUnique({
    where: { id: hashToken(input.code) },
  });

  if (!record) return INVALID_GRANT;

  const claimed = await prisma.oauthCode.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (claimed.count !== 1) return INVALID_GRANT;
  if (record.expiresAt.getTime() <= Date.now()) return INVALID_GRANT;
  if (record.clientId !== input.clientId) return INVALID_GRANT;
  if (record.redirectUri !== input.redirectUri) return INVALID_GRANT;
  if (
    !verifyPkce(
      input.codeVerifier,
      record.codeChallenge,
      record.codeChallengeMethod,
    )
  ) {
    return INVALID_GRANT;
  }
  if (!checkResource(input.resource, record.resource ?? mcpResourceUrl())) {
    return INVALID_GRANT;
  }

  // OauthCode has no foreign key, so a code can outlive its user. Issuing a
  // token would fail the OauthToken FK; refuse the grant instead of a 500.
  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true },
  });
  if (!user) return INVALID_GRANT;

  return {
    ok: true,
    userId: record.userId,
    clientId: record.clientId,
    scopes: record.scopes,
    resource: record.resource,
  };
}

// Presenting an old refresh token is theft until proven otherwise: revoke the
// whole family so the thief and the victim both have to re-authorize.
export async function rotateRefresh(
  refreshToken: string,
  requestedResource?: string,
  requestedClientId?: string,
): Promise<RefreshRotation> {
  const prisma = await db();
  const current = await prisma.oauthToken.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
  });

  if (!current) return INVALID_REFRESH;

  const familyId = current.familyId ?? String(current.id);

  if (current.revokedAt !== null) {
    // Replay of an already-rotated token: one indexed update kills the chain.
    await prisma.oauthToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
    return INVALID_REFRESH;
  }

  if (
    current.refreshExpiresAt === null ||
    current.refreshExpiresAt.getTime() <= Date.now()
  ) {
    return INVALID_REFRESH;
  }

  if (
    requestedClientId !== undefined &&
    requestedClientId !== current.clientId
  ) {
    return INVALID_REFRESH;
  }

  if (!checkResource(requestedResource, current.resource ?? mcpResourceUrl())) {
    return INVALID_REFRESH;
  }

  const access = generateToken("access");
  const refresh = generateToken("refresh");
  const now = Date.now();

  // Claim and successor live in one transaction: two concurrent rotations can
  // only produce one successor, and a crash cannot revoke the parent without
  // issuing its replacement. A failed claim revokes the whole family in place.
  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.oauthToken.updateMany({
      where: {
        id: current.id,
        revokedAt: null,
        refreshExpiresAt: { gt: new Date(now) },
      },
      data: { revokedAt: new Date(now) },
    });

    if (claimed.count !== 1) {
      await tx.oauthToken.updateMany({
        where: { familyId },
        data: { revokedAt: new Date(now) },
      });
      return { ok: false as const };
    }

    await tx.oauthToken.create({
      data: {
        userId: current.userId,
        clientId: current.clientId,
        accessTokenHash: access.hash,
        refreshTokenHash: refresh.hash,
        scopes: current.scopes,
        resource: current.resource,
        accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        rotatedFromId: current.id,
        familyId,
      },
    });

    return { ok: true as const };
  });

  if (!outcome.ok) return INVALID_REFRESH;

  touchClient(current.clientId);

  return {
    ok: true,
    tokens: {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
    scopes: current.scopes,
    resource: current.resource,
  };
}

export async function revokeToken(token: string): Promise<void> {
  const prisma = await db();

  await prisma.oauthToken.updateMany({
    where: {
      OR: [
        { accessTokenHash: hashToken(token) },
        { refreshTokenHash: hashToken(token) },
      ],
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

// Rows are swept on the next token call rather than by a cron job. A row may
// outlive its revocation (so a replay can still find the family), but never its
// own expiry.
export async function cleanupExpired(): Promise<void> {
  const prisma = await db();
  const now = new Date();

  await prisma.oauthCode.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.oauthToken.deleteMany({
    where: {
      OR: [
        { refreshExpiresAt: { lt: now } },
        { refreshExpiresAt: null, accessExpiresAt: { lt: now } },
      ],
    },
  });
}

// Registration rows are not user-owned and outlive nobody. Delete clients that
// are older than 90 days, were never used (or last used more than 90 days ago),
// and never obtained a token. The createdAt guard keeps a freshly registered
// client from being swept while its consent flow is still open.
export async function cleanupUnusedClients(): Promise<void> {
  const prisma = await db();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const used = await prisma.oauthToken.findMany({
    distinct: ["clientId"],
    select: { clientId: true },
  });
  const usedClientIds = used.map((row) => row.clientId);

  await prisma.oauthClient.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
      ...(usedClientIds.length === 0
        ? {}
        : { id: { notIn: usedClientIds } }),
    },
  });
}
