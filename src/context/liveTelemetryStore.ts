/**
 * Selector store for high-rate rover telemetry.
 *
 * TelemetryContext's value changes on every telemetry packet, so every
 * `useTelemetry()` consumer re-renders at packet rate. Large screens instead
 * subscribe through `useLiveTelemetrySelector`, which re-renders the caller
 * only when the selected slice changes (compared with `isEqual`).
 *
 * The store holds exactly what TelemetryContext exposes (the same visible,
 * connection-gated snapshot); it is a delivery mechanism, not a second
 * source of truth.
 */

import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import type { ConnectionState, RoverTelemetry } from "../types/telemetry";

export interface LiveTelemetrySnapshot {
  telemetry: RoverTelemetry;
  roverPosition: { lat: number; lng: number; timestamp: number } | null;
  connectionState: ConnectionState;
}

export interface LiveTelemetryStore {
  getSnapshot(): LiveTelemetrySnapshot;
  subscribe(listener: () => void): () => void;
  publish(snapshot: LiveTelemetrySnapshot): void;
}

export function createLiveTelemetryStore(
  initial: LiveTelemetrySnapshot,
): LiveTelemetryStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(snapshot) {
      if (
        snapshot.telemetry === current.telemetry &&
        snapshot.roverPosition === current.roverPosition &&
        snapshot.connectionState === current.connectionState
      ) {
        return;
      }
      current = snapshot;
      listeners.forEach((listener) => listener());
    },
  };
}

export const LiveTelemetryStoreContext = createContext<LiveTelemetryStore | null>(null);

export function useLiveTelemetryStore(): LiveTelemetryStore {
  const store = useContext(LiveTelemetryStoreContext);
  if (!store) {
    throw new Error("useLiveTelemetryStore must be used within a TelemetryProvider");
  }
  return store;
}

/** Shallow equality for flat selector results. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

/**
 * Select a slice of live telemetry. The caller re-renders only when
 * `isEqual(previousSlice, nextSlice)` is false.
 */
export function useLiveTelemetrySelector<T>(
  selector: (snapshot: LiveTelemetrySnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useLiveTelemetryStore();
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;
  const cache = useRef<{
    snapshot: LiveTelemetrySnapshot;
    selector: (snapshot: LiveTelemetrySnapshot) => T;
    value: T;
  } | null>(null);

  const getSelection = useCallback((): T => {
    const snapshot = store.getSnapshot();
    const selectNow = selectorRef.current;
    const cached = cache.current;
    if (cached && cached.snapshot === snapshot && cached.selector === selectNow) {
      return cached.value;
    }
    const next = selectNow(snapshot);
    if (cached && isEqualRef.current(cached.value, next)) {
      cache.current = { snapshot, selector: selectNow, value: cached.value };
      return cached.value;
    }
    cache.current = { snapshot, selector: selectNow, value: next };
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
