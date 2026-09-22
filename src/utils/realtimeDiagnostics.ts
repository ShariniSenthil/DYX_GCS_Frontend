/**
 * Development-only realtime instrumentation.
 *
 * Enable with EXPO_PUBLIC_REALTIME_DIAGNOSTICS=true. Disabled (default) every
 * function is a cheap no-op. When enabled, counters are summarised in ONE
 * console line per second -- never one log per packet or render.
 *
 * Measures:
 *   socket packets/sec per event (telemetry, mission_status, point_*)
 *   component renders/sec (MissionReportScreen, cards, WaypointsTable)
 *   point event received -> waypoint row displayed latency
 */

import { useRef } from "react";

const ENV_FLAG = process.env.EXPO_PUBLIC_REALTIME_DIAGNOSTICS;

let enabled = ENV_FLAG === "true" || ENV_FLAG === "1";

const packetCounts = new Map<string, number>();
const renderCounts = new Map<string, number>();
const pendingPointEvents = new Map<string, number>();
const rowLatenciesMs: number[] = [];
let windowStartedMs = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export interface RealtimeDiagnosticsSummary {
  windowMs: number;
  packetsPerSec: Record<string, number>;
  rendersPerSec: Record<string, number>;
  pointRowLatencyMs: { count: number; max: number; median: number } | null;
}

let sink: (summary: RealtimeDiagnosticsSummary) => void = (summary) => {
  // eslint-disable-next-line no-console
  console.log("[REALTIME_DIAG]", JSON.stringify(summary));
};

function ensureTimer(): void {
  if (!enabled || flushTimer !== null) return;
  windowStartedMs = Date.now();
  flushTimer = setInterval(flushRealtimeDiagnostics, 1000);
}

function perSec(counts: Map<string, number>, windowMs: number) {
  const out: Record<string, number> = {};
  counts.forEach((count, key) => {
    out[key] = Math.round((count * 10000) / Math.max(1, windowMs)) / 10;
  });
  return out;
}

export function flushRealtimeDiagnostics(): RealtimeDiagnosticsSummary | null {
  if (!enabled) return null;
  const now = Date.now();
  const windowMs = now - windowStartedMs;
  const sorted = [...rowLatenciesMs].sort((a, b) => a - b);
  const summary: RealtimeDiagnosticsSummary = {
    windowMs,
    packetsPerSec: perSec(packetCounts, windowMs),
    rendersPerSec: perSec(renderCounts, windowMs),
    pointRowLatencyMs: sorted.length
      ? {
          count: sorted.length,
          max: sorted[sorted.length - 1],
          median: sorted[Math.floor(sorted.length / 2)],
        }
      : null,
  };
  packetCounts.clear();
  renderCounts.clear();
  rowLatenciesMs.length = 0;
  windowStartedMs = now;
  sink(summary);
  return summary;
}

export function isRealtimeDiagnosticsEnabled(): boolean {
  return enabled;
}

export function countSocketPacket(eventName: string): void {
  if (!enabled) return;
  ensureTimer();
  packetCounts.set(eventName, (packetCounts.get(eventName) ?? 0) + 1);
}

export function countRender(component: string): void {
  if (!enabled) return;
  ensureTimer();
  renderCounts.set(component, (renderCounts.get(component) ?? 0) + 1);
}

/** Call from render: counts renders of `component` when enabled. */
export function useRenderCounter(component: string): void {
  const nameRef = useRef(component);
  nameRef.current = component;
  countRender(nameRef.current);
}

export function markPointEventReceived(pointKey: string): void {
  if (!enabled) return;
  ensureTimer();
  pendingPointEvents.set(pointKey, Date.now());
}

export function markPointRowDisplayed(pointKey: string): void {
  if (!enabled) return;
  const receivedAt = pendingPointEvents.get(pointKey);
  if (receivedAt === undefined) return;
  pendingPointEvents.delete(pointKey);
  rowLatenciesMs.push(Date.now() - receivedAt);
}

/** Test hook. */
export function __configureRealtimeDiagnosticsForTest(options: {
  enabled: boolean;
  sink?: (summary: RealtimeDiagnosticsSummary) => void;
}): void {
  enabled = options.enabled;
  if (options.sink) sink = options.sink;
  packetCounts.clear();
  renderCounts.clear();
  pendingPointEvents.clear();
  rowLatenciesMs.length = 0;
  windowStartedMs = Date.now();
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
