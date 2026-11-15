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

// Mirrors the frontend's design tokens (frontend/src/index.css): dark by
// default like the app, with its light palette for light-mode systems.
const STYLES = `
:root{
--bg:#050607;--surface:#0d0f10;--border:#24272a;--border-subtle:#191b1d;
--fg:#f5f5f5;--muted:#a1a1a1;--muted-fg:#66686b;
--primary:#ff4058;--primary-soft:#ff7184;--primary-dark:#b91f38;
--input-bg:#050607;--shadow:0 20px 70px rgba(0,0,0,.35);
color-scheme:dark}
@media (prefers-color-scheme:light){:root{
--bg:#f5f6f8;--surface:#ffffff;--border:#d9dde3;--border-subtle:#e7e9ed;
--fg:#17191d;--muted:#4b5563;--muted-fg:#737b87;--primary-dark:#d92f46;
--input-bg:#f5f6f8;--shadow:0 20px 60px rgba(23,25,29,.08);
color-scheme:light}}
*{box-sizing:border-box}
html,body{margin:0}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;padding:2.5rem 1rem;background:var(--bg);color:var(--fg);font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.brand{display:flex;align-items:center;gap:.6rem;font-size:1.1rem;font-weight:600;letter-spacing:-.02em}
.brand svg{display:block}
.card{position:relative;overflow:hidden;width:min(440px,100%);background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2rem 1.75rem;box-shadow:var(--shadow)}
.card::before{content:"";position:absolute;left:50%;top:-3rem;width:16rem;height:8rem;transform:translateX(-50%);border-radius:9999px;background:rgba(255,64,88,.08);filter:blur(48px);pointer-events:none}
.card>*{position:relative}
.apps{display:flex;align-items:center;justify-content:center;gap:.75rem;margin:0 0 1.25rem}
.app{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:1.05rem;border:1px solid var(--border);background:var(--bg);color:var(--fg)}
.app.nf{background:none;border:0}.app.nf svg{width:44px;height:44px}
.dots{display:flex;gap:4px}.dots i{width:4px;height:4px;border-radius:50%;background:var(--muted-fg)}
h1{font-size:1.4rem;font-weight:600;letter-spacing:-.03em;line-height:1.3;margin:0 0 .35rem;text-align:center}
.lead{color:var(--muted);font-size:.9rem;margin:0 0 1.5rem;text-align:center;line-height:1.5}
.muted{color:var(--muted);font-size:.875rem;line-height:1.5;margin:0 0 1rem}
.panel{border:1px solid var(--border);border-radius:.75rem;background:var(--bg);padding:.9rem 1rem;margin:0 0 1.5rem}
.panel-title{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-fg);margin:0 0 .6rem}
.scopes{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
.scopes li{display:flex;align-items:flex-start;gap:.6rem;font-size:.9rem}
.scopes li::before{content:"";flex:none;width:16px;height:16px;margin-top:2px;border-radius:50%;background:rgba(255,64,88,.15) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.2 2.2 4.8-4.8' fill='none' stroke='%23ff4058' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat}
.dest{border-top:1px solid var(--border-subtle);margin:.85rem 0 0;padding-top:.75rem;font-size:.8rem;color:var(--muted)}
.dest strong{color:var(--fg);font-weight:500;word-break:break-all}
form{display:grid;gap:1rem}
label{display:grid;gap:.5rem;font-size:.875rem;font-weight:400}
input{height:48px;width:100%;padding:0 1rem;border:1px solid var(--border);border-radius:.625rem;background:var(--input-bg);color:var(--fg);font:inherit;font-size:.9rem;outline:none;transition:border-color .2s,box-shadow .2s}
input::placeholder{color:var(--muted-fg)}
input:focus{border-color:rgba(255,64,88,.5);box-shadow:0 0 0 3px rgba(255,64,88,.1)}
.actions{display:grid;gap:.6rem;margin-top:.5rem}
button{height:46px;border-radius:.625rem;font:inherit;font-size:.9rem;font-weight:500;cursor:pointer;transition:transform .2s,box-shadow .2s,background .2s,border-color .2s}
button.primary{border:0;color:#fff;background:linear-gradient(90deg,var(--primary),var(--primary-soft),var(--primary-dark));box-shadow:0 4px 20px rgba(255,64,88,.2)}
button.primary:hover{transform:translateY(-1px);box-shadow:0 6px 25px rgba(255,64,88,.3)}
button.secondary{border:1px solid var(--border);background:transparent;color:var(--fg)}
button.secondary:hover{border-color:rgba(255,64,88,.4)}
button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.error{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:#f87171;font-size:.875rem;padding:.7rem .85rem;border-radius:.625rem;margin:0 0 1rem}
.hint{font-size:.78rem;color:var(--muted-fg);text-align:center;margin:1.25rem 0 0;line-height:1.5}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;background:var(--bg);border:1px solid var(--border);padding:.15rem .4rem;border-radius:6px;word-break:break-all}
.footer{font-size:.75rem;color:var(--muted-fg)}
@media (max-width:420px){.card{padding:1.75rem 1.25rem}}`;

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">`;

// The same mark as frontend/public/favicon.svg.
const LOGO = `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#ff4058"/><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const htmlPage = (title: string, content: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
${FONT_LINKS}
<style>${STYLES}</style>
</head>
<body>
<div class="brand">${LOGO}<span>NoteFlow</span></div>
<main class="card">${content}</main>
<p class="footer">Only approve apps you trust.</p>
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
<p class="lead">${escapeHtml(description)}.</p>
<div class="panel">
<p class="panel-title">Error code</p>
<code>${escapeHtml(code)}</code>
</div>
<p class="muted" style="text-align:center;margin:0">Close this tab and start the connection again from the app.</p>`,
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

// First letter of the client's name for its badge; registrants choose the
// name, so fall back to "?" for one with no letters or digits.
const initialOf = (name: string): string =>
  name.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "?";

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
      "style-src 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src data:",
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
        `<div class="apps" aria-hidden="true">
<span class="app">${escapeHtml(initialOf(state.clientName))}</span>
<span class="dots"><i></i><i></i><i></i></span>
<span class="app nf">${LOGO}</span>
</div>
<h1>Connect ${escapeHtml(state.clientName)}</h1>
<p class="lead">${escapeHtml(state.clientName)} wants access to your NoteFlow account. Sign in to approve.</p>
<div class="panel">
<p class="panel-title">This will allow it to</p>
<ul class="scopes">${scopes}</ul>
<p class="dest">You'll return to <strong>${escapeHtml(destination)}</strong></p>
</div>
${error}
<form method="post" action="/oauth/authorize">
${hiddenFields(state.request)}
<label>Email<input type="email" name="email" autocomplete="username" placeholder="you@example.com" required value="${escapeHtml(state.email ?? "")}"></label>
<label>Password<input type="password" name="password" autocomplete="current-password" placeholder="Your NoteFlow password" required></label>
<div class="actions">
<button type="submit" name="decision" value="allow" class="primary">Allow access</button>
<button type="submit" name="decision" value="deny" class="secondary" formnovalidate>Cancel</button>
</div>
</form>
<p class="hint">Signed in with Google? Create a personal access token in NoteFlow Settings → AI access instead.</p>`,
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
