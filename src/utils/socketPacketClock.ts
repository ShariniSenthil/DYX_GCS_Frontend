/**
 * Tablet-clock time of the last Socket.IO telemetry packet.
 *
 * TelemetryContext's `stale` flag uses the backend's generated_at (skew
 * dependent) with a 2.5 s window and a 1 s tick, so a silent socket that
 * never reports a disconnect could keep live panels LIVE for ~3.5 s. Live
 * panels poll this receive clock instead. One socket per app, so a module
 * singleton is sufficient.
 */

let lastPacketMs: number | null = null;

export function markSocketTelemetryPacket(nowMs: number = Date.now()): void {
  lastPacketMs = nowMs;
}

export function clearSocketTelemetryPacket(): void {
  lastPacketMs = null;
}

/** Milliseconds since the last telemetry packet, or null if none this connection. */
export function socketTelemetryPacketAgeMs(nowMs: number = Date.now()): number | null {
  return lastPacketMs === null ? null : Math.max(0, nowMs - lastPacketMs);
}

/** Live panels treat a silent stream as stale after this long. */
export const LIVE_PANEL_PACKET_STALE_MS = 750;

export function isSocketTelemetryStalled(
  nowMs: number = Date.now(),
  limitMs: number = LIVE_PANEL_PACKET_STALE_MS,
): boolean {
  const age = socketTelemetryPacketAgeMs(nowMs);
  return age === null || age > limitMs;
}
