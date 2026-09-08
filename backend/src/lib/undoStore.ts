// ---------------------------------------------------------------------------
// In-memory undo store.
//
// Each voice action that mutates the DB produces an undo token — a random
// string the client keeps. When the user clicks "Undo", the client POSTs
// this token back and we reverse the original mutation.
//
// Tokens expire after 5 minutes. The store is per-process (in-memory), which
// is fine for v1 single-server deployment. Swap to Redis for multi-instance.
// ---------------------------------------------------------------------------

interface UndoEntry {
  action: string;
  userId: number;
  /** Data needed to reverse the action. Shape varies by action. */
  payload: Record<string, unknown>;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, UndoEntry>();

/** Generate a random 16-char hex token. */
export const createUndoToken = (
  action: string,
  userId: number,
  payload: Record<string, unknown>
): string => {
  const token = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");

  store.set(token, { action, userId, payload, createdAt: Date.now() });
  return token;
};

/** Retrieve and consume an undo entry. Returns null if expired or missing. */
export const consumeUndoToken = (token: string): UndoEntry | null => {
  const entry = store.get(token);
  if (!entry) return null;

  store.delete(token);

  if (Date.now() - entry.createdAt > TTL_MS) {
    return null; // expired
  }

  return entry;
};
