/**
 * Presentation-state rules for the two live accuracy panels.
 *
 * Authority boundaries (never reconstructed here):
 *   AccuracyMonitorCard   <- /rpp/debug     (rpp_debug_* freshness)
 *   DistanceToTargetCard  <- /rpp/accuracy  (rpp_accuracy_* freshness)
 *
 * A panel may say LIVE only when the backend has positively reported its
 * source stream as fresh. Cached numbers may stay in memory, but a stream
 * that is absent, stale or of unknown freshness never renders as LIVE.
 */

import type { LiveDataState } from "./liveDataState";

export interface LiveStreamGate {
  /** Socket.IO connection state from TelemetryContext. */
  connectionState: string;
  /** Socket-level telemetry staleness (whole packet stream). */
  socketStale: boolean;
  /** Mission lifecycle says live accuracy is meaningful. */
  missionActive: boolean;
}

export interface RppDebugFreshness {
  available: boolean | undefined;
  fresh: boolean | undefined;
  valuesPresent: boolean;
}

export interface RppAccuracyFreshness {
  available: boolean | undefined;
  /**
   * Backend `rpp_accuracy_stream_fresh`. `undefined` means an older backend
   * that never reported it; that is treated as "unknown", not as fresh.
   */
  fresh: boolean | undefined;
  measurementPresent: boolean;
}

function gateState(gate: LiveStreamGate): LiveDataState | null {
  if (gate.connectionState !== "connected") return "offline";
  if (gate.socketStale) return "stale";
  if (!gate.missionActive) return "inactive";
  return null;
}

export function resolveRppDebugDataState(
  gate: LiveStreamGate,
  rpp: RppDebugFreshness,
): LiveDataState {
  const blocked = gateState(gate);
  if (blocked) return blocked;

  if (rpp.available === true && rpp.fresh === true) {
    return rpp.valuesPresent ? "live" : "waiting";
  }

  // Values exist but the backend did not confirm a fresh /rpp/debug sample:
  // they are historical, and must be labelled so.
  if (rpp.valuesPresent) return "stale";

  if (rpp.available === false) return "unavailable";
  return "waiting";
}

export function resolveRppAccuracyDataState(
  gate: LiveStreamGate,
  accuracy: RppAccuracyFreshness,
): LiveDataState {
  const blocked = gateState(gate);
  if (blocked) return blocked;

  if (accuracy.available !== true) {
    return accuracy.measurementPresent ? "stale" : "unavailable";
  }

  if (accuracy.fresh === false) return "stale";

  // Freshness unknown (older backend): the retained TRANSIENT_LOCAL sample
  // cannot be told apart from a current one. Never call that LIVE.
  if (accuracy.fresh !== true) {
    return accuracy.measurementPresent ? "stale" : "waiting";
  }

  return accuracy.measurementPresent ? "live" : "waiting";
}
