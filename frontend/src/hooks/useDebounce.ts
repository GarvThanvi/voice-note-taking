import { useState, useEffect, useRef, useCallback } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export interface DebouncedCallback<A extends unknown[]> {
  run: (...args: A) => void;
  flush: () => void;
  cancel: () => void;
}

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number
): DebouncedCallback<A> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const lastArgsRef = useRef<A | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const args = lastArgsRef.current;
    if (!args) return;
    lastArgsRef.current = null;
    callbackRef.current(...args);
  }, []);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  const run = useCallback(
    (...args: A) => {
      lastArgsRef.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = lastArgsRef.current;
        if (!pending) return;
        lastArgsRef.current = null;
        callbackRef.current(...pending);
      }, delay);
    },
    [delay]
  );

  return { run, flush, cancel };
}
