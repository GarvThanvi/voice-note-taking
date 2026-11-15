import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type Scope = "notes:read" | "notes:write";

export const READ_SCOPE: Scope = "notes:read";
export const WRITE_SCOPE: Scope = "notes:write";
export const ALL_SCOPES: readonly Scope[] = [READ_SCOPE, WRITE_SCOPE];

type TokenKind = "pat" | "access" | "refresh" | "code";

const TOKEN_PREFIXES: Record<TokenKind, string> = {
  pat: "nf_pat_",
  access: "nf_at_",
  refresh: "nf_rt_",
  code: "nf_code_",
};

const OAUTH_PREFIXES = [
  TOKEN_PREFIXES.access,
  TOKEN_PREFIXES.refresh,
  TOKEN_PREFIXES.code,
];

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(kind: TokenKind): {
  token: string;
  hash: string;
  prefix: string;
} {
  const token = `${TOKEN_PREFIXES[kind]}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export function readCredential(
  header: string | undefined,
): { type: "pat" | "oauth"; token: string } | null {
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;

  if (token.startsWith(TOKEN_PREFIXES.pat)) return { type: "pat", token };
  if (OAUTH_PREFIXES.some((prefix) => token.startsWith(prefix))) {
    return { type: "oauth", token };
  }

  return null;
}

export function hasScope(scopes: readonly string[], required: Scope): boolean {
  return scopes.includes(required);
}

export function parseScopes(input: string | null | undefined): Scope[] | null {
  const requested = (input ?? "")
    .split(/[\s,]+/)
    .filter((value) => value.length > 0);

  for (const value of requested) {
    if (!ALL_SCOPES.includes(value as Scope)) return null;
  }

  const granted = new Set<Scope>(requested as Scope[]);
  granted.add(READ_SCOPE);

  return ALL_SCOPES.filter((scope) => granted.has(scope));
}

export function toBase64Url(input: Buffer): string {
  return input.toString("base64url");
}

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== "S256") return false;
  if (verifier.length === 0 || challenge.length === 0) return false;

  const expected = Buffer.from(
    toBase64Url(createHash("sha256").update(verifier).digest()),
  );
  const actual = Buffer.from(challenge);

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
