import { useCallback, useEffect, useRef } from "react";

/**
 * setTimeout that is always cleared on unmount. Use this for UI delays that
 * call setState so they cannot fire after the component is gone.
 */
export function useSafeTimeout(): (
  callback: () => void,
  delayMs: number,
) => ReturnType<typeof setTimeout> {
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current.clear();
    };
  }, []);

  return useCallback((callback: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, delayMs);
    timersRef.current.add(id);
    return id;
  }, []);
}

export default useSafeTimeout;
