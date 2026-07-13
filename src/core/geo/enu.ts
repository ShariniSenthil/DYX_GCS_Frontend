// ============================================================
// ENU (East-North-Up) Coordinate Conversion
// ============================================================
//
// Converts between geographic coordinates (lat/lon) and a local
// tangent-plane metric space (meters). Uses a simplified equirectangular
// projection valid for small areas (< few km).
//
// Why ENU?
//   - Lat/lon are angular (degrees), NOT linear distances
//   - 1 degree of longitude ≠ 1 degree of latitude in meters
//   - We convert to meters FIRST so all transform math (scale, rotation)
//     operates on true Euclidean distances
//   - After transform, we convert back to lat/lon for map display
//
// Reference: https://en.wikipedia.org/wiki/Local_tangent_plane_coordinates

import { GeoPoint, Vec2D } from '../geometry/types';

/** Mean Earth radius in meters (WGS-84) */
export const EARTH_RADIUS = 6378137;

/**
 * Convert a geographic point to ENU meters relative to an origin.
 *
 * Math:
 *   dLat = (point.lat - origin.lat) in radians
 *   dLon = (point.lon - origin.lon) in radians
 *   East (x) = dLon * cos(meanLat) * R
 *   North (y) = dLat * R
 *
 * @param origin - The reference point (becomes ENU (0, 0))
 * @param point  - The point to convert
 * @returns { x: east_meters, y: north_meters }
 */
export function latLonToENU(origin: GeoPoint, point: GeoPoint): Vec2D {
  const dLat = (point.lat - origin.lat) * (Math.PI / 180);
  const dLon = (point.lon - origin.lon) * (Math.PI / 180);
  const meanLat = ((origin.lat + point.lat) / 2) * (Math.PI / 180);

  // Easting: longitude difference scaled by cosine of latitude
  const x = dLon * Math.cos(meanLat) * EARTH_RADIUS;
  // Northing: latitude difference is linear with radius
  const y = dLat * EARTH_RADIUS;

  return { x, y };
}

/**
 * Convert ENU meters back to geographic coordinates.
 *
 * Math:
 *   dLat = enu.y / R  (radians → degrees)
 *   dLon = enu.x / (R * cos(lat_origin))  (radians → degrees)
 *
 * @param origin - The ENU origin (reference GeoPoint)
 * @param enu    - East-North displacement in meters
 * @returns GeoPoint at the given ENU offset from origin
 */
export function enuToLatLon(origin: GeoPoint, enu: Vec2D): GeoPoint {
  const cosLat = Math.cos(origin.lat * (Math.PI / 180));

  // Guard against cos(90°) = 0 at poles
  const safeCosLat = Math.max(cosLat, 1e-10);

  const dLat = enu.y / EARTH_RADIUS;
  const dLon = enu.x / (EARTH_RADIUS * safeCosLat);

  return {
    lat: origin.lat + (dLat * 180 / Math.PI),
    lon: origin.lon + (dLon * 180 / Math.PI),
  };
}

/**
 * Compute the Euclidean distance between two ENU points (in meters).
 */
export function enuDistance(a: Vec2D, b: Vec2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the angle (in radians) of a vector from point A to point B.
 */
export function enuAngle(a: Vec2D, b: Vec2D): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
