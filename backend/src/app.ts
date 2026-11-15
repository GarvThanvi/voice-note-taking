import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import noteRoutes from "./routes/note.js";
import labelRoutes from "./routes/label.js";
import voiceRoutes from "./routes/voice.js";
import voiceUndoRoutes from "./routes/voiceUndo.js";
import passwordResetRoutes from "./routes/passwordReset.js";
import guideRoutes from "./routes/guide.js";
import newsletterRoutes from "./routes/newsletter.js";
import mcpTokenRoutes from "./routes/mcpTokens.js";
import oauthRoutes, {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "./routes/oauth.js";
import {
  notFound,
  errorHandler,
  mcpBodyError,
  oauthBodyError,
} from "./middlewares/error.middleware.js";
import {
  globalLimiter,
  mcpPreAuthLimiter,
  oauthPageLimiter,
} from "./middlewares/rateLimit.middleware.js";
import { internalOnly } from "./middlewares/internal.middleware.js";
import { mcpRouter } from "./mcp/http.js";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(express.json());
// OAuth's token and authorize endpoints take form-encoded bodies; every
// existing route sends JSON, so this is inert for them.
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
// Immediately after the parser: malformed /mcp bodies become JSON-RPC errors
// instead of the 500 envelope, and never reach the logging error handler.
app.use(mcpBodyError);
app.use(oauthBodyError);

const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "FRONTEND_URL is not set; cross-origin browser requests will be blocked.",
  );
}

app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
  }),
);

// Loopback-only mount for MCP tool calls. Sits above globalLimiter because
// internal calls are machine-to-machine, not client traffic.
app.use("/internal/note", internalOnly, noteRoutes);
app.use("/internal/label", internalOnly, labelRoutes);

// OAuth discovery and the authorization server live above globalLimiter so the
// connector handshake does not consume the app's per-IP request budget. Each
// surface carries its own limiter inside the router (or here for metadata).
// The authorize POST composes the shared sign-in limiter on top.
app.get(
  "/.well-known/oauth-protected-resource",
  oauthPageLimiter,
  protectedResourceMetadata,
);
app.get(
  "/.well-known/oauth-authorization-server",
  oauthPageLimiter,
  authorizationServerMetadata,
);
app.use("/oauth", oauthRoutes);

// MCP clients authenticate per request with a token, so the pre-auth limiter
// runs first as a rotating-credential backstop; the router then applies the
// per-IP unauthenticated limit and the per-token limit.
app.use("/mcp", mcpPreAuthLimiter, mcpRouter);

app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/auth", guideRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/note", noteRoutes);
app.use("/api/label", labelRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/voice", voiceUndoRoutes);
app.use("/api/mcp", mcpTokenRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
