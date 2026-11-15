import express, {
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./tools.js";
import { createApi } from "./client.js";
import { resolvePrincipal } from "./auth.js";
import { readCredential } from "../lib/mcpTokens.js";
import { mcpPublicUrl } from "../lib/publicUrl.js";
import {
  mcpTokenLimiter,
  mcpUnauthLimiter,
} from "../middlewares/rateLimit.middleware.js";

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

export const mcpRouter = express.Router();

const unauthorized = (res: Response): void => {
  // An MCP client reads this header to discover where the OAuth metadata lives;
  // the body is only for humans and curl.
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${mcpPublicUrl()}${RESOURCE_METADATA_PATH}"`,
  );
  res.status(401).json({ success: false, message: "Unauthorized" });
};

const methodNotAllowed = (_req: Request, res: Response): void => {
  // JSON responses only: there is no SSE stream for a GET to resume here.
  res.setHeader("Allow", "POST");
  res.status(405).end();
};

const bodyId = (req: Request): unknown =>
  (req.body as { id?: unknown } | undefined)?.id ?? null;

const internalError = (res: Response, id: unknown): void => {
  res.status(500).json({
    jsonrpc: "2.0",
    error: { code: -32603, message: "Internal server error" },
    id,
  });
};

// Resolved before the limiters so the unauth bucket can skip authenticated
// callers and the token bucket can key on the stored hash. A failure here is
// a JSON-RPC internal error, not an Express 500, because the caller is an MCP
// client expecting a JSON-RPC body.
const resolveMcpPrincipal: RequestHandler = async (req, res, next) => {
  try {
    const credential = readCredential(req.headers.authorization);
    const principal = credential
      ? await resolvePrincipal(credential.token)
      : null;

    if (principal) req.mcpPrincipal = principal;
    next();
  } catch (error) {
    console.error(
      "MCP credential resolution failed:",
      error instanceof Error ? error.message : error,
    );
    internalError(res, bodyId(req));
  }
};

const handleMcpRequest: RequestHandler = async (req, res) => {
  const principal = req.mcpPrincipal;

  if (!principal) {
    unauthorized(res);
    return;
  }

  try {
    // Stateless: a fresh server per request scoped to this token, so one
    // caller's session can never be reused by another's request.
    const server = createServer({
      userId: principal.userId,
      scopes: principal.scopes,
      api: createApi(principal.userId),
    });
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode: no session id is issued, so no session can be resumed
      // or shared. The SDK treats an absent generator exactly like undefined.
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(
      "MCP request failed:",
      error instanceof Error ? error.message : error,
    );

    if (res.headersSent) {
      res.end();
      return;
    }

    internalError(res, bodyId(req));
  }
};

mcpRouter.post(
  "/",
  resolveMcpPrincipal,
  mcpUnauthLimiter,
  mcpTokenLimiter,
  handleMcpRequest,
);

mcpRouter.all("/", methodNotAllowed);
