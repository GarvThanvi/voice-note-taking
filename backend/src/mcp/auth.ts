import { prisma } from "../lib/prisma.js";
import { checkResource, mcpResourceUrl } from "../lib/oauth.js";
import { hashToken } from "../lib/mcpTokens.js";

export interface Principal {
  userId: number;
  scopes: string[];
  via: "pat" | "oauth";
  // Hash of the presented credential, used as the per-token limiter key so a
  // raw bearer value never becomes a bucket name.
  tokenHash: string;
}

// lastUsedAt is bookkeeping, not authentication: a slow write must never delay
// a tool call, and a failed write must never fail the request.
const touchLastUsed = (update: Promise<unknown>): void => {
  void update.catch(() => {});
};

const userExists = async (userId: number): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    return user !== null;
  } catch {
    // Fail closed: a lookup that cannot prove the user exists is not a pass.
    return false;
  }
};

// A credential is trusted only because its hash matched a stored row, never
// because of its shape.
export async function resolvePrincipal(
  token: string,
): Promise<Principal | null> {
  const tokenHash = hashToken(token);

  const pat = await prisma.apiToken.findUnique({ where: { tokenHash } });

  if (pat) {
    if (pat.revokedAt !== null) return null;
    if (!(await userExists(pat.userId))) return null;

    touchLastUsed(
      prisma.apiToken.update({
        where: { id: pat.id },
        data: { lastUsedAt: new Date() },
      }),
    );

    return { userId: pat.userId, scopes: pat.scopes, via: "pat", tokenHash };
  }

  const oauth = await prisma.oauthToken.findUnique({
    where: { accessTokenHash: tokenHash },
  });

  if (!oauth) return null;
  if (oauth.revokedAt !== null) return null;
  if (oauth.accessExpiresAt.getTime() <= Date.now()) return null;
  // RFC 8707: a token minted for a different resource is not a credential for
  // this one. A null resource (a client that omitted it) is still accepted.
  if (!checkResource(oauth.resource ?? undefined, mcpResourceUrl())) return null;
  if (!(await userExists(oauth.userId))) return null;

  touchLastUsed(
    prisma.oauthToken.update({
      where: { id: oauth.id },
      data: { lastUsedAt: new Date() },
    }),
  );

  return { userId: oauth.userId, scopes: oauth.scopes, via: "oauth", tokenHash };
}
