import { useCallback, useRef, useState } from "react";

export function usePendingActions() {
  const pendingRef = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  const isPending = useCallback(
    (key: string | number) => pending.has(String(key)),
    [pending]
  );

  const run = useCallback(async (key: string | number, task: () => Promise<void>) => {
    const id = String(key);
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setPending(new Set(pendingRef.current));
    try {
      await task();
    } finally {
      pendingRef.current.delete(id);
      setPending(new Set(pendingRef.current));
    }
  }, []);

  return { pending, isPending, run };
}
