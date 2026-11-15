import type { Request, Response, NextFunction } from "express";

const PARSE_ERROR = {
  jsonrpc: "2.0",
  error: { code: -32700, message: "Parse error" },
  id: null,
};

const TOO_LARGE_ERROR = {
  jsonrpc: "2.0",
  error: { code: -32600, message: "Request body too large" },
  id: null,
};

const OAUTH_PARSE_ERROR = {
  error: "invalid_request",
  error_description: "Malformed request body",
};

const OAUTH_TOO_LARGE_ERROR = {
  error: "invalid_request",
  error_description: "Request body too large",
};

// express.json() runs app-wide, so a malformed /mcp body would otherwise reach
// errorHandler as a 500 whose log line can echo the raw body. MCP clients
// expect a JSON-RPC error, so translate the parser's two typed failures and
// leave every other route to the normal envelope.
export const mcpBodyError = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.path.startsWith("/mcp")) {
    next(error);
    return;
  }

  const type = (error as { type?: unknown } | null | undefined)?.type;

  if (type === "entity.parse.failed") {
    res.status(400).json(PARSE_ERROR);
    return;
  }

  if (type === "entity.too.large") {
    res.status(413).json(TOO_LARGE_ERROR);
    return;
  }

  next(error);
};

// OAuth clients parse `error` codes, not the app's success envelope. A body the
// parser rejected must still look like an RFC 6749 error.
export const oauthBodyError = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.path.startsWith("/oauth")) {
    next(error);
    return;
  }

  const type = (error as { type?: unknown } | null | undefined)?.type;

  if (type === "entity.parse.failed") {
    res.status(400).json(OAUTH_PARSE_ERROR);
    return;
  }

  if (type === "entity.too.large") {
    res.status(413).json(OAUTH_TOO_LARGE_ERROR);
    return;
  }

  next(error);
};

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found" });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Only the message: stringified error objects can carry request bodies such
  // as note content, and the logs are not the place for user data.
  console.error(
    "Unhandled error:",
    error instanceof Error ? error.message : error,
  );
  res.status(500).json({ success: false, message: "Internal server error" });
};
