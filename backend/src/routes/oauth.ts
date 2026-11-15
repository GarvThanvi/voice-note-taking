import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { ALL_SCOPES } from "../lib/mcpTokens.js";
import { mcpPublicUrl } from "../lib/publicUrl.js";
import {
  checkResource,
  cleanupExpired,
  cleanupUnusedClients,
  createAuthorizationCode,
  isAllowedRedirectUri,
  issueTokens,
  mcpResourceUrl,
  oauthError,
  parseAuthorizeRequest,
  redeemAuthorizationCode,
  revokeToken,
  rotateRefresh,
  type AuthorizeRequest,
  type IssuedTokens,
} from "../lib/oauth.js";
import {
  oauthPageLimiter,
  oauthRegisterLimiter,
  oauthTokenLimiter,
  signinLimiter,
} from "../middlewares/rateLimit.middleware.js";

const INVALID_CREDENTIALS = "Invalid email or password.";

// A real bcrypt hash for a string nobody knows, compared when the account does
// not exist so a missing row costs the same wall-clock time as a wrong password.
const DUMMY_HASH = "$2b$10$WYKdnj.N4kYcFBaKn8aEXeIld73gl6fMb81hyZWIre9PZpp2TyrBa";

const SCOPE_COPY: Record<string, string> = {
  "notes:read": "Read your notes and labels",
  "notes:write": "Create, edit and delete your notes",
};

const stringField = (
  source: Record<string, unknown>,
  name: string,
): string | undefined => {
  const value = source[name];
  return typeof value === "string" ? value : undefined;
};

const bodyOf = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>;

const sendOAuthError = (
  res: Response,
  status: number,
  code: string,
  description: string,
): void => {
  res.status(status).json(oauthError(code, description));
};

// --- Metadata documents -----------------------------------------------------

export const protectedResourceMetadata: RequestHandler = (_req, res) => {
  res.json({
    resource: mcpResourceUrl(),
    authorization_servers: [mcpPublicUrl()],
    scopes_supported: [...ALL_SCOPES],
  });
};

export const authorizationServerMetadata: RequestHandler = (_req, res) => {
  const base = mcpPublicUrl();

  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...ALL_SCOPES],
  });
};

// --- Server-rendered pages --------------------------------------------------

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const STYLES = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f7;color:#1d1d1f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(440px,calc(100% - 2rem));background:#fff;border:1px solid #d2d2d7;border-radius:14px;padding:2rem;box-shadow:0 12px 40px rgba(0,0,0,.08)}
h1{font-size:1.35rem;margin:0 0 .4rem;line-height:1.3}
.muted{color:#6e6e73;margin:0 0 1rem}
.scopes{margin:0 0 1.25rem;padding-left:1.15rem}
.scopes li{margin:.2rem 0}
label{display:block;margin:0 0 .9rem;font-weight:600;font-size:.9rem}
input{width:100%;margin-top:.35rem;padding:.65rem .75rem;border:1px solid #c7c7cc;border-radius:8px;font:inherit;background:#fff;color:inherit}
.actions{display:flex;gap:.6rem;margin-top:.4rem}
button{flex:1;padding:.7rem 1rem;border-radius:8px;border:1px solid #0071e3;background:#0071e3;color:#fff;font:inherit;font-weight:600;cursor:pointer}
button.secondary{background:#fff;color:#0071e3}
.error{background:#fff2f2;border:1px solid #ffb3b3;color:#a30000;padding:.65rem .75rem;border-radius:8px;margin:0 0 1rem}
code{background:#f5f5f7;padding:.1rem .3rem;border-radius:4px;word-break:break-all}
@media (prefers-color-scheme:dark){
body{background:#000;color:#f5f5f7}
.card{background:#1c1c1e;border-color:#3a3a3c}
.muted{color:#98989d}
input{background:#2c2c2e;border-color:#48484a}
button.secondary{background:#1c1c1e}
code{background:#2c2c2e}
.error{background:#3a1414;border-color:#7a1f1f;color:#ffb3b3}
}`;

const htmlPage = (title: string, content: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="card">${content}</main>
</body>
</html>`;

const renderErrorPage = (
  res: Response,
  status: number,
  code: string,
  description: string,
): void => {
  res
    .status(status)
    .type("html")
    .send(
      htmlPage(
        "Could not connect",
        `<h1>Could not connect</h1>
<p class="muted">${escapeHtml(description)}</p>
<p><code>${escapeHtml(code)}</code></p>
<p class="muted">Close this tab and start the connection again from the app.</p>`,
      ),
    );
};

interface FormState {
  request: AuthorizeRequest;
  clientName: string;
  email: string | undefined;
  error: string | undefined;
}

const hiddenFields = (request: AuthorizeRequest): string => {
  const fields: Array<[string, string]> = [
    ["client_id", request.clientId],
    ["redirect_uri", request.redirectUri],
    ["response_type", request.responseType],
    ["code_challenge", request.codeChallenge],
    ["code_challenge_method", request.codeChallengeMethod],
    ["scope", request.scopes.join(" ")],
  ];

  if (request.state !== undefined) fields.push(["state", request.state]);
  if (request.resource !== undefined) fields.push(["resource", request.resource]);

  return fields
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`,
    )
    .join("\n");
};

const renderAuthorizePage = (res: Response, state: FormState): void => {
  const scopes = state.request.scopes
    .map((scope) => `<li>${escapeHtml(SCOPE_COPY[scope] ?? scope)}</li>`)
    .join("");
  const error =
    state.error === undefined
      ? ""
      : `<p class="error" role="alert">${escapeHtml(state.error)}</p>`;
  // The client name is chosen by the registrant; the host is where the code
  // will actually go, so show it next to the name.
  const redirectUrl = new URL(state.request.redirectUri);
  const destination = redirectUrl.host;

  // Helmet's default CSP has form-action 'self', and browsers apply
  // form-action to the redirect that follows a submit. Without the client's
  // origin here, Chrome blocks the 302 back to claude.ai / chatgpt.com after
  // "Allow". The page has no scripts, so everything else stays locked down.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `form-action 'self' ${redirectUrl.origin}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
  );

  res
    .status(200)
    .type("html")
    .send(
      htmlPage(
        `Connect ${state.clientName} to NoteFlow`,
        `<h1>Connect ${escapeHtml(state.clientName)} to NoteFlow</h1>
<p class="muted">${escapeHtml(state.clientName)} is asking to access your NoteFlow account.</p>
<ul class="scopes">${scopes}</ul>
<p class="muted">You will return to <strong>${escapeHtml(destination)}</strong>.</p>
${error}
<form method="post" action="/oauth/authorize">
${hiddenFields(state.request)}
<label>Email<input type="email" name="email" autocomplete="username" required value="${escapeHtml(state.email ?? "")}"></label>
<label>Password<input type="password" name="password" autocomplete="current-password" required></label>
<div class="actions">
<button type="submit" name="decision" value="allow">Allow</button>
<button type="submit" name="decision" value="deny" class="secondary">Deny</button>
</div>
</form>`,
      ),
    );
};

// --- Redirects --------------------------------------------------------------

type RedirectParams = Record<string, string | undefined>;

const redirectTo = (
  res: Response,
  redirectUri: string,
  params: RedirectParams,
): void => {
  const target = new URL(redirectUri);

  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(name, value);
  }

  res.redirect(302, target.toString());
};

// --- Authorize --------------------------------------------------------------

interface ClientRecord {
  id: string;
  name: string;
  redirectUris: string[];
}

const findClient = (clientId: string): Promise<ClientRecord | null> =>
  prisma.oauthClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, redirectUris: true },
  });

// The redirect URI is the one value that must be trusted before any error can
// be reported, so unknown clients and unregistered URIs get a local error page
// instead of a redirect to a URI the caller chose.
const trustedClient = async (
  res: Response,
  clientId: string,
  redirectUri: string,
): Promise<ClientRecord | null> => {
  if (!clientId) {
    renderErrorPage(res, 400, "invalid_grant", "Unknown client");
    return null;
  }

  const client = await findClient(clientId);

  if (!client) {
    renderErrorPage(res, 400, "invalid_grant", "Unknown client");
    return null;
  }

  if (
    !redirectUri ||
    !client.redirectUris.includes(redirectUri) ||
    !isAllowedRedirectUri(redirectUri)
  ) {
    renderErrorPage(res, 400, "invalid_grant", "Invalid redirect URI");
    return null;
  }

  return client;
};

const authenticate = async (
  email: string | undefined,
  password: string | undefined,
): Promise<number | null> => {
  if (!email || !password) {
    if (password) await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, password: true },
  });

  // Google-only accounts have no password; they take the same generic path as
  // a wrong password so the page never confirms an account exists.
  if (!user || !user.password) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const matches = await bcrypt.compare(password, user.password);
  return matches ? user.id : null;
};

export const oauthRoutes = Router();

oauthRoutes.post("/register", oauthRegisterLimiter, async (req, res, next) => {
  try {
    const body = bodyOf(req);
    const submitted = body.redirect_uris;

    if (!Array.isArray(submitted) || submitted.length === 0) {
      sendOAuthError(
        res,
        400,
        "invalid_redirect_uri",
        "redirect_uris must be a non-empty array",
      );
      return;
    }

    if (submitted.length > 5) {
      sendOAuthError(
        res,
        400,
        "invalid_redirect_uri",
        "At most 5 redirect_uris are allowed",
      );
      return;
    }

    const redirectUris: string[] = [];

    for (const candidate of submitted) {
      if (typeof candidate !== "string" || !isAllowedRedirectUri(candidate)) {
        sendOAuthError(
          res,
          400,
          "invalid_redirect_uri",
          "redirect_uris must be https or loopback http URLs",
        );
        return;
      }

      if (!redirectUris.includes(candidate)) redirectUris.push(candidate);
    }

    const submittedName = stringField(body, "client_name")?.trim();

    // Sweep stale registrations before inserting this one: a client that never
    // obtained a token and has not been used for 90 days is disposable.
    try {
      await cleanupUnusedClients();
    } catch {
      // Maintenance is best-effort; never fail a registration over it.
    }

    const client = await prisma.oauthClient.create({
      data: {
        id: randomUUID(),
        name:
          submittedName === undefined || submittedName.length === 0
            ? "MCP client"
            : submittedName.slice(0, 100),
        redirectUris,
      },
    });

    res.status(201).json({
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
    });
  } catch (error) {
    next(error);
  }
});

oauthRoutes.get("/authorize", oauthPageLimiter, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const query = req.query as Record<string, unknown>;
    const clientId = stringField(query, "client_id")?.trim() ?? "";
    const redirectUri = stringField(query, "redirect_uri") ?? "";
    const state = stringField(query, "state");

    const client = await trustedClient(res, clientId, redirectUri);
    if (!client) return;

    const parsed = parseAuthorizeRequest(query);
    if (!parsed.ok) {
      redirectTo(res, redirectUri, {
        error: parsed.error,
        error_description: parsed.error_description,
        state,
      });
      return;
    }

    if (!checkResource(parsed.value.resource, mcpResourceUrl())) {
      redirectTo(res, redirectUri, {
        error: "invalid_request",
        error_description: "Unknown resource",
        state,
      });
      return;
    }

    renderAuthorizePage(res, {
      request: parsed.value,
      clientName: client.name,
      email: undefined,
      error: undefined,
    });
  } catch (error) {
    next(error);
  }
});

oauthRoutes.post("/authorize", signinLimiter, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const body = bodyOf(req);
    const clientId = stringField(body, "client_id")?.trim() ?? "";
    const redirectUri = stringField(body, "redirect_uri") ?? "";

    const client = await trustedClient(res, clientId, redirectUri);
    if (!client) return;

    const parsed = parseAuthorizeRequest(body);
    if (!parsed.ok) {
      redirectTo(res, redirectUri, {
        error: parsed.error,
        error_description: parsed.error_description,
        state: stringField(body, "state"),
      });
      return;
    }

    const request = parsed.value;

    if (!checkResource(request.resource, mcpResourceUrl())) {
      redirectTo(res, redirectUri, {
        error: "invalid_request",
        error_description: "Unknown resource",
        state: request.state,
      });
      return;
    }

    const decision = stringField(body, "decision");

    if (decision === "deny") {
      redirectTo(res, redirectUri, {
        error: "access_denied",
        error_description: "The user denied the request",
        state: request.state,
      });
      return;
    }

    if (decision !== "allow") {
      redirectTo(res, redirectUri, {
        error: "invalid_request",
        error_description: "Unknown decision",
        state: request.state,
      });
      return;
    }

    const submittedEmail = stringField(body, "email");
    const authorizedUserId = await authenticate(
      submittedEmail,
      stringField(body, "password"),
    );

    if (authorizedUserId === null) {
      renderAuthorizePage(res, {
        request,
        clientName: client.name,
        email: submittedEmail,
        error: INVALID_CREDENTIALS,
      });
      return;
    }

    const code = await createAuthorizationCode({
      clientId: client.id,
      userId: authorizedUserId,
      redirectUri,
      scopes: request.scopes,
      codeChallenge: request.codeChallenge,
      ...(request.resource === undefined ? {} : { resource: request.resource }),
    });

    redirectTo(res, redirectUri, { code, state: request.state });
  } catch (error) {
    next(error);
  }
});

// --- Token and revocation ---------------------------------------------------

const tokenResponse = (
  res: Response,
  tokens: IssuedTokens,
  scopes: string[],
): void => {
  res.status(200).json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: scopes.join(" "),
  });
};

oauthRoutes.post("/token", oauthTokenLimiter, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    // Best-effort sweep of rows that can no longer be used.
    void cleanupExpired().catch(() => {});

    const body = bodyOf(req);
    const grantType = stringField(body, "grant_type");

    if (grantType === "authorization_code") {
      const clientId = stringField(body, "client_id");
      const code = stringField(body, "code");
      const codeVerifier = stringField(body, "code_verifier");
      const redirectUri = stringField(body, "redirect_uri");

      if (!clientId) {
        sendOAuthError(res, 400, "invalid_request", "client_id is required");
        return;
      }
      if (!code) {
        sendOAuthError(res, 400, "invalid_request", "code is required");
        return;
      }
      if (!codeVerifier) {
        sendOAuthError(
          res,
          400,
          "invalid_request",
          "code_verifier is required",
        );
        return;
      }
      if (!redirectUri) {
        sendOAuthError(res, 400, "invalid_request", "redirect_uri is required");
        return;
      }

      const resource = stringField(body, "resource");
      const redemption = await redeemAuthorizationCode({
        clientId,
        code,
        redirectUri,
        codeVerifier,
        ...(resource === undefined ? {} : { resource }),
      });

      if (!redemption.ok) {
        sendOAuthError(
          res,
          400,
          redemption.error,
          redemption.error_description,
        );
        return;
      }

      const tokens = await issueTokens(
        redemption.userId,
        redemption.clientId,
        redemption.scopes,
        redemption.resource,
      );

      tokenResponse(res, tokens, redemption.scopes);
      return;
    }

    if (grantType === "refresh_token") {
      const refreshToken = stringField(body, "refresh_token");

      if (!refreshToken) {
        sendOAuthError(res, 400, "invalid_request", "refresh_token is required");
        return;
      }

      const rotated = await rotateRefresh(
        refreshToken,
        stringField(body, "resource"),
        stringField(body, "client_id"),
      );

      if (!rotated.ok) {
        sendOAuthError(res, 400, rotated.error, rotated.error_description);
        return;
      }

      tokenResponse(res, rotated.tokens, rotated.scopes);
      return;
    }

    if (!grantType) {
      sendOAuthError(res, 400, "invalid_request", "grant_type is required");
      return;
    }

    sendOAuthError(
      res,
      400,
      "unsupported_grant_type",
      "Unsupported grant_type",
    );
  } catch (error) {
    next(error);
  }
});

oauthRoutes.post("/revoke", oauthTokenLimiter, async (req, res, next) => {
  try {
    // RFC 7009: an unknown or already-revoked token still answers 200, so a
    // caller cannot probe which values exist.
    const token = stringField(bodyOf(req), "token");

    if (token !== undefined && token.length > 0) {
      await revokeToken(token);
    }

    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

export default oauthRoutes;
