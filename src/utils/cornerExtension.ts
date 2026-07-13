import { calcBearing, recalculateWaypointDistances, vincentyDistance } from './missionCalculator';
import { calculateDestination } from './geoPatterns';
import { PathPlanWaypoint } from '../types/pathplan';

export interface CornerDetectionResult {
  index: number;
  incomingBearing: number;
  outgoingBearing: number;
  turnAngle: number;
  segmentDistance: number;
  shortSegment?: boolean;
}

export interface CornerExtensionOptions {
  extensionDistance: number;
  turnAngleThreshold: number;
  keepOriginalWaypoints: boolean;
  invertMode: boolean;
}

export const DEFAULT_EXTENSION_OPTIONS: CornerExtensionOptions = {
  extensionDistance: 6.5,
  turnAngleThreshold: 30,
  keepOriginalWaypoints: true,
  invertMode: false,
};

/**
 * Absolute angular difference between two bearings [0, 180].
 * Handles wrap-around (e.g. 350 vs 10 = 20 degrees, not 340).
 */
export function angularDifference(b1: number, b2: number): number {
  let diff = Math.abs(b1 - b2);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Detect corners where a dummy waypoint is needed.
 * A corner qualifies only when BOTH conditions are true:
 *   1. turnAngle > threshold (it's a real corner)
 *   2. distance from this WP to the next WP < 5.0m (short segment — rover can't align naturally)
 * Skips the first waypoint (no incoming) and last waypoint (no outgoing).
 */
export function detectCorners(
  waypoints: PathPlanWaypoint[],
  threshold: number,
  extensionDistance: number = DEFAULT_EXTENSION_OPTIONS.extensionDistance,
): CornerDetectionResult[] {
  if (waypoints.length < 3) return [];

  const corners: CornerDetectionResult[] = [];
  const SHORT_SEGMENT_M = 5.0;

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const incomingBearing = calcBearing(
      { lat: prev.lat, lon: prev.lon },
      { lat: curr.lat, lon: curr.lon },
    );
    const outgoingBearing = calcBearing(
      { lat: curr.lat, lon: curr.lon },
      { lat: next.lat, lon: next.lon },
    );

    const turnAngle = angularDifference(incomingBearing, outgoingBearing);

    if (turnAngle > threshold) {
      const distToNext = vincentyDistance(
        { lat: curr.lat, lon: curr.lon },
        { lat: next.lat, lon: next.lon },
      );

      // Only insert dummy when the next segment is too short for natural alignment
      if (distToNext >= SHORT_SEGMENT_M) continue;

      const segDist = vincentyDistance(
        { lat: prev.lat, lon: prev.lon },
        { lat: curr.lat, lon: curr.lon },
      );
      corners.push({
        index: i,
        incomingBearing,
        outgoingBearing,
        turnAngle,
        segmentDistance: distToNext,
        shortSegment: segDist < extensionDistance,
      });
    }
  }

  return corners;
}

/**
 * Generate inverted corner extension waypoints.
 * Places dummies BEFORE the next waypoint on the approach path,
 * so the rover gets a guaranteed straight run into WP[i+1].
 *
 * For corner at WP[i] → WP[i+1]:
 *   backBearing = calcBearing(WP[i+1], WP[i])   // direction from next WP back toward corner
 *   dummy = calculateDestination(WP[i+1], backBearing, extensionDistance)
 *   D1→WP[i+1] = exactly extensionDistance m, on the WP[i]→WP[i+1] approach line
 *   Insert dummy BEFORE WP[i+1] in the array.
 */
function generateInvertedCornerWaypoints(
  waypoints: PathPlanWaypoint[],
  options: CornerExtensionOptions,
): PathPlanWaypoint[] {
  const corners = detectCorners(waypoints, options.turnAngleThreshold, options.extensionDistance);
  if (corners.length === 0) return waypoints;

  const result = [...waypoints];

  // Insert from end to start to preserve earlier indices
  for (let c = corners.length - 1; c >= 0; c--) {
    const corner = corners[c];
    const cornerWp = result[corner.index];
    const nextWp = result[corner.index + 1];

    // Direct bearing from next WP back toward the corner
    const backBearing = calcBearing(
      { lat: nextWp.lat, lon: nextWp.lon },
      { lat: cornerWp.lat, lon: cornerWp.lon },
    );

    // Place dummy extensionDistance meters from next WP toward the corner
    const dest = calculateDestination(
      { lat: nextWp.lat, lng: nextWp.lon },
      backBearing,
      options.extensionDistance,
    );

    const extensionWp: PathPlanWaypoint = {
      id: 0,
      lat: dest.lat,
      lon: dest.lng,
      alt: nextWp.alt,
      distance: 0,
      block: 'CORNER',
      row: 'INV',
      pile: 'D',
      mark: false,
    };

    if (options.keepOriginalWaypoints) {
      // Insert BEFORE next waypoint (index + 1)
      result.splice(corner.index + 1, 0, extensionWp);
    } else {
      // Replace the next waypoint — unusual but supported
      result.splice(corner.index + 1, 1, extensionWp);
    }
  }

  return recalculateWaypointDistances(
    result.map((wp, idx) => ({ ...wp, id: idx + 1 })),
  );
}

/**
 * Generate an extended waypoint array with corner extension points inserted.
 * Standard mode: dummies go PAST the corner along incoming bearing (overshoot).
 * Invert mode: dummies go BEFORE the next WP on the approach axis (runway).
 */
export function generateCornerExtensionWaypoints(
  waypoints: PathPlanWaypoint[],
  options: CornerExtensionOptions = DEFAULT_EXTENSION_OPTIONS,
): PathPlanWaypoint[] {
  if (options.invertMode) {
    return generateInvertedCornerWaypoints(waypoints, options);
  }

  const corners = detectCorners(waypoints, options.turnAngleThreshold, options.extensionDistance);
  if (corners.length === 0) return waypoints;

  const result = [...waypoints];

  // Insert from end to start to preserve earlier indices
  for (let c = corners.length - 1; c >= 0; c--) {
    const corner = corners[c];
    const cornerWp = result[corner.index];

    // Project extension point along incoming bearing past the corner
    const dest = calculateDestination(
      { lat: cornerWp.lat, lng: cornerWp.lon },
      corner.incomingBearing,
      options.extensionDistance,
    );

    const extensionWp: PathPlanWaypoint = {
      id: 0,
      lat: dest.lat,
      lon: dest.lng,
      alt: cornerWp.alt,
      distance: 0,
      block: 'CORNER',
      row: 'EXT',
      pile: '',
      mark: false,
    };

    if (options.keepOriginalWaypoints) {
      result.splice(corner.index + 1, 0, extensionWp);
    } else {
      result.splice(corner.index, 1, extensionWp);
    }
  }

  // Re-sequence IDs and recalculate distances
  return recalculateWaypointDistances(
    result.map((wp, idx) => ({ ...wp, id: idx + 1 })),
  );
}