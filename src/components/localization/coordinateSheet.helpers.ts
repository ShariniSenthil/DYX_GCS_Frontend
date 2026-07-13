// ============================================================
// Coordinate Sheet Pure Helpers
// ============================================================
//
// Pure TypeScript helpers for the CoordinateSheet component.
// No react-native or expo-* imports — testable under node.
//
// Requirements: 11.3, 11.4, 11.5

import { ParsedPoint } from '../../core/geometry/parsedPoint';

/**
 * Validate that a (lat, lon) pair is within the valid geographic range.
 *
 * @param lat - Latitude value
 * @param lon - Longitude value
 * @returns true iff both are finite, lat ∈ [-90, 90], lon ∈ [-180, 180]
 */
export function validateCoords(lat: number, lon: number): boolean {
  return (
    isFinite(lat) &&
    isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Return a copy of the point with targetLat, targetLon, and isControlPoint set.
 * All other fields are unchanged.
 *
 * @param p   - The source ParsedPoint
 * @param lat - Valid latitude to assign
 * @param lon - Valid longitude to assign
 * @returns New ParsedPoint with updated coordinate fields
 */
export function setControlPoint(p: ParsedPoint, lat: number, lon: number): ParsedPoint {
  return {
    ...p,
    targetLat: lat,
    targetLon: lon,
    isControlPoint: true,
  };
}

/**
 * Return a copy of the point with targetLat, targetLon cleared and isControlPoint = false.
 * All other fields are unchanged.
 *
 * @param p - The source ParsedPoint
 * @returns New ParsedPoint with coordinate fields cleared
 */
export function clearControlPoint(p: ParsedPoint): ParsedPoint {
  return {
    ...p,
    targetLat: null,
    targetLon: null,
    isControlPoint: false,
  };
}
