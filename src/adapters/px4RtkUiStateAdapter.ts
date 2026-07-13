/**
 * px4RtkUiStateAdapter — Derive a discrete RTK UI state from GET /api/rtk/status.
 *
 * The icon layer must not inspect raw backend objects; it consumes a normalized
 * `RtkUiState`. This maps the rich RtkStatusResponse (running / healthy /
 * stream_healthy / gps_fix_type / errors) into one of:
 *
 *   off        — RTK process not running
 *   starting   — running, but corrections not yet established (no healthy stream)
 *   streaming  — corrections flowing (stream healthy) but no RTK float/fixed fix yet
 *   rtk_float  — GPS fix type 5 (RTK float)
 *   rtk_fixed  — GPS fix type 6 (RTK fixed)
 *   error      — running but unhealthy with an explicit error
 */

import type { RtkStatusResponse } from '../services/rtkService';

export type RtkUiState =
  | 'off'
  | 'starting'
  | 'streaming'
  | 'rtk_float'
  | 'rtk_fixed'
  | 'error';

/** Human-readable label for each RTK UI state. */
export const RTK_UI_STATE_LABEL: Record<RtkUiState, string> = {
  off: 'Off',
  starting: 'Starting',
  streaming: 'Streaming',
  rtk_float: 'RTK Float',
  rtk_fixed: 'RTK Fixed',
  error: 'Error',
};

/** Convenience accessor for a label, tolerant of undefined input. */
export function rtkUiStateLabel(state: RtkUiState | undefined | null): string {
  return state ? (RTK_UI_STATE_LABEL[state] ?? state) : RTK_UI_STATE_LABEL.off;
}

/** Resolve a numeric GPS fix type from the various alias fields the backend may send. */
function resolveFixType(status: RtkStatusResponse): number {
  if (typeof status.gps_fix_type === 'number') return status.gps_fix_type;
  if (typeof status.fix_type === 'number') return status.fix_type;
  return 0;
}

/**
 * Convert a raw RtkStatusResponse into a discrete UI state.
 * Safe for missing/null fields.
 */
export function toRtkUiState(status: RtkStatusResponse | null | undefined): RtkUiState {
  if (!status) return 'off';

  const running = Boolean(status.running ?? status.active ?? status.connected);
  if (!running) return 'off';

  const healthy = status.healthy ?? status.stream_healthy ?? true;
  const hasError = Boolean(status.last_error) || Boolean(status.last_process_error);

  // Explicit failure while running takes priority — the stream is up but broken.
  if (!healthy && hasError) return 'error';

  // Fix-type derived states (MAVLink GPS_FIX_TYPE: 5 = RTK float, 6 = RTK fixed).
  const fixType = resolveFixType(status);
  if (fixType >= 6) return 'rtk_fixed';
  if (fixType === 5) return 'rtk_float';

  // Corrections are flowing but no float/fixed fix established yet.
  const streamHealthy = status.stream_healthy ?? status.healthy ?? false;
  if (streamHealthy) return 'streaming';

  // Running, no healthy stream yet — warming up.
  return 'starting';
}
