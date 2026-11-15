import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Moon,
  Plus,
  Plug,
  Sun,
  X,
} from "lucide-react";
import ConfirmModal from "../components/ui/ConfirmModal";
import { useTheme } from "../context/ThemeContext";
import {
  createToken,
  getApps,
  getTokens,
  revokeApp,
  revokeToken,
  type ApiToken,
  type ConnectedApp,
  type McpScope,
} from "../api/mcpApi";
import { getApiErrorMessage } from "../lib/apiError";
import { formatLastUsed, mcpEndpointFrom, scopeSummary } from "../lib/tokenDisplay";

const MCP_ENDPOINT = mcpEndpointFrom(
  import.meta.env.VITE_APP_BASE_URL || "http://localhost:8080/api"
);

type PendingRevoke =
  | { kind: "token"; id: number; name: string }
  | { kind: "app"; clientId: string; name: string }
  | null;

const useCopy = () => {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  };

  return { copied, copy };
};

const CopyButton = ({
  copied,
  onClick,
  label,
}: {
  copied: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-surface-elevated transition-colors"
  >
    {copied ? <Check size={14} /> : <Copy size={14} />}
    {copied ? "Copied" : "Copy"}
  </button>
);

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: { token: string; apiToken: ApiToken }) => void;
}

const CreateTokenModal = ({ isOpen, onClose, onCreated }: CreateTokenModalProps) => {
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"read" | "write">("write");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 50 && !saving;

  const close = () => {
    if (saving) return;
    setName("");
    setAccess("write");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const scopes: McpScope[] =
      access === "write" ? ["notes:read", "notes:write"] : ["notes:read"];
    try {
      const result = await createToken({ name: trimmed, scopes });
      setName("");
      setAccess("write");
      onCreated(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create the token"));
    } finally {
      setSaving(false);
    }
  };

  const option = (value: "read" | "write", title: string, hint: string) => (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        access === value ? "border-primary/60 bg-primary/5" : "border-border hover:bg-surface"
      }`}
    >
      <input
        type="radio"
        name="token-access"
        value={value}
        checked={access === value}
        onChange={() => setAccess(value)}
        className="mt-0.5 accent-[var(--color-primary)]"
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-token-title"
        className="relative w-[calc(100%-1.5rem)] sm:w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="create-token-title" className="text-base font-semibold">
            New access token
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Name it after the tool that will use it, so you know what to revoke later.
          </p>
        </div>

        <div className="px-5 space-y-4">
          <div>
            <label
              htmlFor="token-name"
              className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              Name
            </label>
            <input
              id="token-name"
              autoFocus
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") close();
              }}
              placeholder="Claude Code on my laptop"
              className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Access
            </legend>
            {option("write", "Read and write", "Search, create, edit and delete notes and todos.")}
            {option("read", "Read only", "Search and read notes. Cannot change anything.")}
          </fieldset>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-border">
          <button
            type="button"
            disabled={saving}
            onClick={close}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Creating..." : "Create token"}
          </button>
        </div>
      </div>
    </div>
  );
};

const RowSkeleton = () => (
  <div className="h-[62px] rounded-xl border border-border-subtle bg-surface animate-pulse" />
);

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const { copied, copy } = useCopy();

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<PendingRevoke>(null);

  const [reloadKey, setReloadKey] = useState(0);

  // State is only set once the requests settle; bumping reloadKey retries.
  useEffect(() => {
    let cancelled = false;

    Promise.all([getTokens(), getApps()])
      .then(([nextTokens, nextApps]) => {
        if (cancelled) return;
        setTokens(nextTokens);
        setApps(nextApps);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getApiErrorMessage(err, "Could not load your access settings"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    document.title = "Settings · NoteFlow";
  }, []);

  const handleCreated = ({ token, apiToken }: { token: string; apiToken: ApiToken }) => {
    setCreateOpen(false);
    setTokens((current) => [apiToken, ...current]);
    setRevealed({ name: apiToken.name, token });
  };

  const cancelRevoke = useCallback(() => setPendingRevoke(null), []);

  const confirmRevoke = async () => {
    const target = pendingRevoke;
    setPendingRevoke(null);
    if (!target) return;
    setActionError(null);
    try {
      if (target.kind === "token") {
        await revokeToken(target.id);
        setTokens((current) => current.filter((t) => t.id !== target.id));
      } else {
        await revokeApp(target.clientId);
        setApps((current) => current.filter((a) => a.clientId !== target.clientId));
      }
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not revoke access"));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <header className="flex items-center gap-3 mb-8">
          <Link
            to="/note"
            className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Back to notes"
            title="Back to notes"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-semibold tracking-[-0.4px]">Settings</h1>
          <div className="ml-auto">
            <button
              onClick={toggleTheme}
              className="text-muted hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>

        <section aria-labelledby="ai-access-heading">
          <h2 id="ai-access-heading" className="text-lg font-semibold">
            AI access
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Let AI assistants search, read and edit your notes. ChatGPT and Claude
            connect through a connector and ask you to sign in. Local tools such as
            Claude Code or OpenCode use a personal access token.
          </p>

          <div className="mt-5 p-4 rounded-xl border border-border bg-surface">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Connector URL
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-sm font-mono">{MCP_ENDPOINT}</code>
              <CopyButton
                copied={copied === "endpoint"}
                onClick={() => copy("endpoint", MCP_ENDPOINT)}
                label="Copy connector URL"
              />
            </div>
          </div>

          {loadError && (
            <div className="mt-5 flex items-center justify-between gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-400">{loadError}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setReloadKey((key) => key + 1);
                }}
                className="text-xs font-medium text-foreground hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {actionError && (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {actionError}
            </p>
          )}

          <div className="mt-8">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div>
                <h3 className="text-base font-semibold">Personal access tokens</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Signed in with Google? Use a token; the connector sign-in page only
                  accepts an email and password.
                </p>
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Create token
              </button>
            </div>

            {revealed && (
              <div className="mb-4 p-4 rounded-xl border border-primary/40 bg-primary/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Token “{revealed.name}” created</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Copy it now. You won't see this token again.
                    </p>
                  </div>
                  <button
                    onClick={() => setRevealed(null)}
                    className="text-muted hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 min-w-0 break-all text-xs sm:text-sm font-mono p-2.5 rounded-lg bg-background border border-border select-all">
                    {revealed.token}
                  </code>
                  <CopyButton
                    copied={copied === "token"}
                    onClick={() => copy("token", revealed.token)}
                    label="Copy token"
                  />
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                <RowSkeleton />
                <RowSkeleton />
              </div>
            ) : tokens.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-border text-center">
                <KeyRound size={20} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  No tokens yet. Create one for a local tool and paste it into its MCP
                  config as a Bearer header; ChatGPT and Claude don't need one.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle rounded-xl border border-border overflow-hidden">
                {tokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center gap-4 px-4 py-3 bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{token.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        <code className="font-mono">{token.prefix}…</code>
                        <span>·</span>
                        <span>{scopeSummary(token.scopes)}</span>
                        <span>·</span>
                        <span>{formatLastUsed(token.lastUsedAt)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setPendingRevoke({ kind: "token", id: token.id, name: token.name })
                      }
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-10">
            <h3 className="text-base font-semibold mb-3">Connected apps</h3>

            {loading ? (
              <RowSkeleton />
            ) : apps.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-border text-center">
                <Plug size={20} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  No apps connected yet. Add the NoteFlow connector in ChatGPT or Claude
                  using the URL above.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle rounded-xl border border-border overflow-hidden">
                {apps.map((app) => (
                  <li
                    key={app.clientId}
                    className="flex items-center gap-4 px-4 py-3 bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {scopeSummary(app.scopes)} · {formatLastUsed(app.lastUsedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setPendingRevoke({ kind: "app", clientId: app.clientId, name: app.name })
                      }
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <CreateTokenModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <ConfirmModal
        isOpen={pendingRevoke !== null}
        title={pendingRevoke?.kind === "app" ? "Disconnect app?" : "Revoke token?"}
        message={
          pendingRevoke?.kind === "app"
            ? `${pendingRevoke.name} will lose access to your notes immediately. You can reconnect it later.`
            : `Anything using “${pendingRevoke?.name ?? ""}” will stop working immediately. This can't be undone.`
        }
        confirmLabel={pendingRevoke?.kind === "app" ? "Disconnect" : "Revoke"}
        cancelLabel="Cancel"
        onConfirm={confirmRevoke}
        onCancel={cancelRevoke}
      />
    </div>
  );
};

export default Settings;
