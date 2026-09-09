interface UndoEntry {
  action: string;
  userId: number;
  payload: Record<string, unknown>;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, UndoEntry>();

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

export const consumeUndoToken = (token: string): UndoEntry | null => {
  const entry = store.get(token);
  if (!entry) return null;

  store.delete(token);

  if (Date.now() - entry.createdAt > TTL_MS) {
    return null;
  }

  return entry;
};
