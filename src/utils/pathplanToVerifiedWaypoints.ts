/**
 * pathplanToVerifiedWaypoints — strict conversion with full rejection.
 *
 * Validation rules:
 *   COORDS: lat/lon must be finite numbers, in valid range, not both zero.
 *   MARK:   wp.mark must be explicitly boolean (true or false).
 *           If undefined and requireMark=true, the waypoint is rejected.
 *
 * Contract:
 *   - If ANY error exists, errors[] is non-empty and waypoints[] is empty.
 *   - The caller MUST block the upload when errors.length > 0.
 *   - There is NO silent filtering of invalid points.
 *   - All invalid points are reported simultaneously (not just the first).
 *
 * Note: PathPlanScreen already imports formatValidationErrors from waypointValidator.
 * The error-formatting helper here is named buildValidationErrorMessage to avoid
 * shadowing that import.
 */

import type { PathPlanWaypoint } from '../types/pathplan';
import type { VerifiedWaypoint } from '../types/fourwd/mission';

// ── Error types ───────────────────────────────────────────────────────────────

export interface WaypointValidationError {
  /** 1-based waypoint number for display. */
  waypointNumber: number;
  field: 'lat' | 'lon' | 'coords' | 'mark';
  reason: string;
}

export interface ConversionResult {
  /** Non-empty only when errors[] is empty. */
  waypoints: VerifiedWaypoint[];
  /** All validation failures — one entry per bad waypoint × field combination. */
  errors: WaypointValidationError[];
}

export interface ConversionOptions {
  /**
   * When true, any waypoint with mark === undefined is a validation error.
   * Default: true. The 4WD_SERVER requires `mark` on every waypoint regardless
   * of mission mode — the server validates this on upload.
   */
  requireMark?: boolean;
}

// ── Coordinate bounds ─────────────────────────────────────────────────────────

const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;

// ── Conversion ────────────────────────────────────────────────────────────────

export function pathplanToVerifiedWaypoints(
  source: PathPlanWaypoint[],
  options: ConversionOptions = {},
): ConversionResult {
  const { requireMark = true } = options;
  const errors: WaypointValidationError[] = [];

  for (let i = 0; i < source.length; i++) {
    const wp = source[i];
    const n = i + 1; // 1-based for display

    // ── Latitude ──────────────────────────────────────────────────────────────
    if (typeof wp.lat !== 'number' || isNaN(wp.lat) || !isFinite(wp.lat)) {
      errors.push({ waypointNumber: n, field: 'lat', reason: `lat is ${wp.lat}` });
    } else if (wp.lat < LAT_MIN || wp.lat > LAT_MAX) {
      errors.push({
        waypointNumber: n,
        field: 'lat',
        reason: `lat ${wp.lat} out of range [${LAT_MIN}, ${LAT_MAX}]`,
      });
    }

    // ── Longitude ─────────────────────────────────────────────────────────────
    if (typeof wp.lon !== 'number' || isNaN(wp.lon) || !isFinite(wp.lon)) {
      errors.push({ waypointNumber: n, field: 'lon', reason: `lon is ${wp.lon}` });
    } else if (wp.lon < LON_MIN || wp.lon > LON_MAX) {
      errors.push({
        waypointNumber: n,
        field: 'lon',
        reason: `lon ${wp.lon} out of range [${LON_MIN}, ${LON_MAX}]`,
      });
    }

    // ── Null-island guard (only when both coords are individually valid) ───────
    const latOk = typeof wp.lat === 'number' && !isNaN(wp.lat) && isFinite(wp.lat)
      && wp.lat >= LAT_MIN && wp.lat <= LAT_MAX;
    const lonOk = typeof wp.lon === 'number' && !isNaN(wp.lon) && isFinite(wp.lon)
      && wp.lon >= LON_MIN && wp.lon <= LON_MAX;
    if (latOk && lonOk && wp.lat === 0 && wp.lon === 0) {
      errors.push({
        waypointNumber: n,
        field: 'coords',
        reason: 'both lat and lon are 0 (null island — likely unpopulated)',
      });
    }

    // ── Mark ──────────────────────────────────────────────────────────────────
    if (requireMark && typeof wp.mark !== 'boolean') {
      errors.push({
        waypointNumber: n,
        field: 'mark',
        reason:
          'mark is not set. Each waypoint must have mark: true or mark: false before upload.',
      });
    }
  }

  if (errors.length > 0) {
    return { waypoints: [], errors };
  }

  // All valid — convert preserving source metadata.
  const waypoints: VerifiedWaypoint[] = source.map((wp, i) => {
    const label =
      [wp.block, wp.row, wp.pile].filter(Boolean).join('-') || String(i + 1);
    return {
      index: i,
      lat: wp.lat,
      lon: wp.lon,
      alt: typeof wp.alt === 'number' && !isNaN(wp.alt) ? wp.alt : 0,
      mark: wp.mark as boolean, // safe: validated above when requireMark
      block: wp.block,
      row: wp.row,
      pile: wp.pile ?? String(i + 1),
      label,
    };
  });

  return { waypoints, errors: [] };
}

// ── Human-readable error formatting ──────────────────────────────────────────

/**
 * Build a human-readable multi-line error message from WaypointValidationError[].
 * Named buildValidationErrorMessage (not formatValidationErrors) to avoid
 * shadowing the same-named export from waypointValidator.ts.
 */
export function buildValidationErrorMessage(
  errors: WaypointValidationError[],
): string {
  const byWaypoint = new Map<number, string[]>();
  for (const e of errors) {
    if (!byWaypoint.has(e.waypointNumber)) {
      byWaypoint.set(e.waypointNumber, []);
    }
    byWaypoint.get(e.waypointNumber)!.push(e.reason);
  }

  const lines: string[] = [];
  for (const [n, reasons] of byWaypoint) {
    lines.push(`Waypoint ${n}: ${reasons.join('; ')}`);
  }
  return lines.join('\n');
}
