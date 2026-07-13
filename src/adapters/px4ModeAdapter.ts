/**
 * px4ModeAdapter — Normalize PX4 vehicle mode strings.
 *
 * 4WD_SERVER only uses MANUAL and OFFBOARD. This replaces the legacy
 * ARDUROVER_MODES / CMODE(n) translation table in useRoverTelemetry.ts.
 */

/** Canonical PX4 mode names. */
export type Px4Mode = 'MANUAL' | 'OFFBOARD' | string;

const KNOWN_MODES = new Set(['MANUAL', 'OFFBOARD']);

/**
 * Normalize a raw mode string from the PX4 backend.
 *
 * - Trims and upper-cases
 * - Returns 'MANUAL' or 'OFFBOARD' for known modes
 * - Falls back to 'UNKNOWN' for empty/null
 * - Passes through unknown strings unchanged (forward-compat)
 */
export function normalizePx4Mode(raw: unknown): Px4Mode {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return 'UNKNOWN';
  return normalized;
}

/** Returns true when the vehicle is in mission-capable mode. */
export function isOffboardMode(mode: string): boolean {
  return mode.toUpperCase() === 'OFFBOARD';
}

/** Returns true when the vehicle can accept manual joystick commands. */
export function isManualMode(mode: string): boolean {
  return mode.toUpperCase() === 'MANUAL';
}

/**
 * Derive a human-readable label for the mode indicator badge.
 * Unknown modes are shown as-is so new server values are visible.
 */
export function modeDisplayLabel(mode: string): string {
  switch (mode.toUpperCase()) {
    case 'MANUAL':   return 'MANUAL';
    case 'OFFBOARD': return 'OFFBOARD';
    case 'UNKNOWN':  return '—';
    default:         return mode;
  }
}

/**
 * Pick badge color for mode display.
 * Returns a hex color string.
 */
export function modeBadgeColor(mode: string): string {
  switch (mode.toUpperCase()) {
    case 'MANUAL':   return '#F59E0B'; // amber — operator in control
    case 'OFFBOARD': return '#4ADE80'; // green — mission running
    default:         return '#64748B'; // slate — unknown/idle
  }
}
