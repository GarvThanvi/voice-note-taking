import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLabel,
  deleteLabel,
  getLabels,
  updateLabel,
} from "../api/labelApi";
import type { Label } from "../api/labelApi";

interface UseLabelsResult {
  labels: Label[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (data: { name: string; color: string }) => Promise<Label>;
  update: (id: number, data: { name?: string; color?: string }) => Promise<Label>;
  remove: (id: number) => Promise<void>;
}

export function useLabels(): UseLabelsResult {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getLabels();
      if (!mountedRef.current) return;
      setLabels(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load labels");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    getLabels()
      .then((next) => {
        if (cancelled) return;
        setLabels(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load labels");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(
    async (data: { name: string; color: string }) => {
      const created = await createLabel(data);
      await refresh();
      return created;
    },
    [refresh]
  );

  const update = useCallback(
    async (id: number, data: { name?: string; color?: string }) => {
      const updated = await updateLabel(id, data);
      await refresh();
      return updated;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteLabel(id);
      await refresh();
    },
    [refresh]
  );

  return { labels, loading, error, refresh, create, update, remove };
}
