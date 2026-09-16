import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getNotes } from "../api/noteApi";
import type { Note } from "../api/noteApi";

const DEFAULT_LIMIT = 12;

interface UseInfiniteNotesResult {
  notes: Note[];
  total: number;
  setNotes: Dispatch<SetStateAction<Note[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
  initialLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reset: () => void;
}

const mergeNotes = (prev: Note[], incoming: Note[]): Note[] => {
  const seen = new Set(prev.map((note) => note.id));
  const merged = [...prev];
  for (const note of incoming) {
    if (!seen.has(note.id)) {
      seen.add(note.id);
      merged.push(note);
    }
  }
  return merged;
};

export function useInfiniteNotes(
  filter: string,
  search: string,
  limit: number = DEFAULT_LIMIT
): UseInfiniteNotesResult {
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);

  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  const buildOptions = useCallback(
    (page: number) => ({
      bookmarked: filter === "bookmark",
      archived: filter === "archive",
      trashed: filter === "trash",
      search: search || undefined,
      page,
      limit,
    }),
    [filter, search, limit]
  );

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    pageRef.current = 1;
    loadingRef.current = true;

    const loadFirstPage = async () => {
      setInitialLoading(true);
      setLoadingMore(false);
      setError(null);
      try {
        const data = await getNotes(buildOptions(1));
        if (cancelled || requestId !== requestIdRef.current) return;
        setNotes(data.notes);
        setTotal(data.total);
        setHasMore(data.hasMore);
        pageRef.current = data.page;
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load notes");
        setNotes([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoading(false);
          loadingRef.current = false;
        }
      }
    };

    loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [buildOptions, resetToken]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(null);
    const requestId = requestIdRef.current;
    const nextPage = pageRef.current + 1;

    try {
      const data = await getNotes(buildOptions(nextPage));
      if (requestId !== requestIdRef.current) return;
      setNotes((prev) => mergeNotes(prev, data.notes));
      setTotal(data.total);
      setHasMore(data.hasMore);
      pageRef.current = data.page;
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load more notes");
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [buildOptions, hasMore]);

  const reset = useCallback(() => setResetToken((token) => token + 1), []);

  return {
    notes,
    total,
    setNotes,
    setTotal,
    initialLoading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  };
}
