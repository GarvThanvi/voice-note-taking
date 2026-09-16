import { useEffect, useRef } from "react";

interface UseIntersectionObserverOptions {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean;
}

export function useIntersectionObserver(
  onIntersect: () => void,
  {
    rootMargin = "200px",
    threshold = 0,
    enabled = true,
  }: UseIntersectionObserverOptions = {}
): React.RefObject<HTMLDivElement | null> {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onIntersect);

  useEffect(() => {
    callbackRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          callbackRef.current();
        }
      },
      { root: null, rootMargin, threshold }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, rootMargin, threshold]);

  return targetRef;
}
