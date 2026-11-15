import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  ALL_SCOPES,
  generateToken,
  parseScopes,
  type Scope,
} from "../lib/mcpTokens.js";

const router = Router();

router.use(authMiddleware);

// A user can hold this many live PATs at once. Generous for real use, and it
// stops a script from filling the table under one account.
const MAX_ACTIVE_TOKENS = 25;

const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Token name is required")
    .max(50, "Token name must be 50 characters or fewer"),
  scopes: z.array(z.string()).max(ALL_SCOPES.length * 2).optional(),
});

const tokenSelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

router.get("/tokens", async (req, res, next) => {
  try {
    const userId: number = req.userId!;

    const tokens = await prisma.apiToken.findMany({
      where: { userId, revokedAt: null },
      select: tokenSelect,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ success: true, tokens });
  } catch (error) {
    return next(error);
  }
});

router.post("/tokens", async (req, res, next) => {
  try {
    const userId: number = req.userId!;

    const result = createTokenSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
    }

    // Omitted scopes mean read-write: the common reason to create a token is
    // to let a local agent edit notes. An explicit list is parsed strictly.
    const scopes: Scope[] | null =
      result.data.scopes === undefined
        ? [...ALL_SCOPES]
        : parseScopes(result.data.scopes.join(" "));

    if (!scopes) {
      return res
        .status(400)
        .json({ success: false, message: "Unknown scope" });
    }

    const active = await prisma.apiToken.count({
      where: { userId, revokedAt: null },
    });

    if (active >= MAX_ACTIVE_TOKENS) {
      return res.status(400).json({
        success: false,
        message: `You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`,
      });
    }

    const { token, hash, prefix } = generateToken("pat");

    const apiToken = await prisma.apiToken.create({
      data: { userId, name: result.data.name, tokenHash: hash, prefix, scopes },
      select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
    });

    // The plaintext leaves the server exactly once, here. Only its hash is kept.
    return res.status(201).json({ success: true, token, apiToken });
  } catch (error) {
    return next(error);
  }
});

router.delete("/tokens/:id", async (req, res, next) => {
  try {
    const userId: number = req.userId!;
    const tokenId = Number(req.params.id);

    if (!Number.isInteger(tokenId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid token ID" });
    }

    // Revoke rather than delete: the hash stays so a leaked copy keeps failing
    // as "revoked" and never matches a future row.
    const { count } = await prisma.apiToken.updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Token not found" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// A grant is live while either half of the pair can still be used: an expired
// access token with a valid refresh token still lets the client back in.
const liveOauthWhere = (userId: number) => {
  const now = new Date();
  return {
    userId,
    revokedAt: null,
    OR: [
      { accessExpiresAt: { gt: now } },
      { refreshExpiresAt: { gt: now } },
    ],
  };
};

router.get("/apps", async (req, res, next) => {
  try {
    const userId: number = req.userId!;

    const tokens = await prisma.oauthToken.findMany({
      where: liveOauthWhere(userId),
      select: { clientId: true, scopes: true, lastUsedAt: true, createdAt: true },
    });

    const byClient = new Map<
      string,
      { scopes: Set<string>; lastUsedAt: Date | null; connectedAt: Date }
    >();

    for (const token of tokens) {
      const entry = byClient.get(token.clientId) ?? {
        scopes: new Set<string>(),
        lastUsedAt: null,
        connectedAt: token.createdAt,
      };
      token.scopes.forEach((scope) => entry.scopes.add(scope));
      if (
        token.lastUsedAt &&
        (!entry.lastUsedAt || token.lastUsedAt > entry.lastUsedAt)
      ) {
        entry.lastUsedAt = token.lastUsedAt;
      }
      if (token.createdAt < entry.connectedAt) entry.connectedAt = token.createdAt;
      byClient.set(token.clientId, entry);
    }

    const clients = await prisma.oauthClient.findMany({
      where: { id: { in: [...byClient.keys()] } },
      select: { id: true, name: true },
    });
    const names = new Map(clients.map((client) => [client.id, client.name]));

    const apps = [...byClient.entries()]
      .map(([clientId, entry]) => ({
        clientId,
        // Dynamic registration lets a client omit its name; show something a
        // person can still recognise and revoke.
        name: names.get(clientId)?.trim() || "Unnamed app",
        scopes: ALL_SCOPES.filter((scope) => entry.scopes.has(scope)),
        lastUsedAt: entry.lastUsedAt,
        connectedAt: entry.connectedAt,
      }))
      .sort(
        (a, b) =>
          (b.lastUsedAt ?? b.connectedAt).getTime() -
          (a.lastUsedAt ?? a.connectedAt).getTime(),
      );

    return res.status(200).json({ success: true, apps });
  } catch (error) {
    return next(error);
  }
});

router.delete("/apps/:clientId", async (req, res, next) => {
  try {
    const userId: number = req.userId!;
    const clientId = String(req.params.clientId ?? "");

    if (clientId.length === 0 || clientId.length > 200) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid client ID" });
    }

    const [revoked] = await prisma.$transaction([
      prisma.oauthToken.updateMany({
        where: { userId, clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // An authorization code issued moments ago would otherwise let the
      // client mint a fresh grant right after the user revoked it.
      prisma.oauthCode.updateMany({
        where: { userId, clientId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    if (revoked.count === 0) {
      return res
        .status(404)
        .json({ success: false, message: "App not found" });
    }

    return res.status(200).json({ success: true, revoked: revoked.count });
  } catch (error) {
    return next(error);
  }
});

export default router;
