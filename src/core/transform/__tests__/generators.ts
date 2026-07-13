// ============================================================
// Shared fast-check generators — similarity solver property tests
// ============================================================
//
// Provides arbitraries for control-point inputs and ENU origins.
// Used by property tests for the similarity solver and transform applier.
//
// Requirements: 13.1, 13.5, 13.6
// ============================================================

import * as fc from 'fast-check';
import { ControlPointInput } from '../../../core/geometry/parsedPoint';

// ── Constants ────────────────────────────────────────────────

const WGS84_R = 6378137; // mean Earth radius in meters
const DEG_TO_RAD = Math.PI / 180;

// Fixed ENU origin used by arbControlPointsIdentityEnu
const IDENTITY_ENU_ORIGIN = { lat: 37.0, lon: -122.0 };

// ── arbEnuOrigin ─────────────────────────────────────────────

/**
 * Generates a valid ENU origin with lat ∈ (-85, 85) and lon ∈ (-180, 180).
 * Kept away from the poles to keep the Phase-1 projection well-conditioned.
 */
export const arbEnuOrigin: fc.Arbitrary<{ lat: number; lon: number }> = fc.record({
  lat: fc.float({ min: -84.9, max: 84.9, noNaN: true }),
  lon: fc.float({ min: -179.9, max: 179.9, noNaN: true }),
});

// ── arbControlPointsNonCollinear ─────────────────────────────

/**
 * Generates an array of ≥ 3 ControlPointInput objects whose signed-triangle-area
 * (of the first 3 points' sourceX/sourceY) is strictly above epsilon = 1e-6.
 *
 * Each point has:
 *   - sourceX/sourceY in [-100, 100]
 *   - targetLat in [-85, 85]
 *   - targetLon in [-180, 180]
 */
export const arbControlPointsNonCollinear: fc.Arbitrary<ControlPointInput[]> = fc
  .array(
    fc.record({
      sourceX: fc.float({ min: -100, max: 100, noNaN: true }),
      sourceY: fc.float({ min: -100, max: 100, noNaN: true }),
      targetLat: fc.float({ min: -85, max: 85, noNaN: true }),
      targetLon: fc.float({ min: -180, max: 180, noNaN: true }),
    }),
    { minLength: 3, maxLength: 10 }
  )
  .filter((pts) => {
    // Check that the first 3 points are non-collinear using signed triangle area
    const [p0, p1, p2] = pts;
    const area =
      (p1.sourceX - p0.sourceX) * (p2.sourceY - p0.sourceY) -
      (p2.sourceX - p0.sourceX) * (p1.sourceY - p0.sourceY);
    return Math.abs(area) > 1e-6;
  })
  .map((pts: Array<{ sourceX: number; sourceY: number; targetLat: number; targetLon: number }>) =>
    pts.map((p, i): ControlPointInput => ({
      id: `cp_${i}`,
      sourceX: p.sourceX,
      sourceY: p.sourceY,
      targetLat: p.targetLat,
      targetLon: p.targetLon,
    }))
  );

// ── arbControlPointsIdentityEnu ──────────────────────────────

/**
 * Generates ≥ 3 ControlPointInput objects where every target ENU equals its source.
 *
 * Uses a fixed enuOrigin of (37.0, -122.0). Converts sourceX/sourceY to lat/lon
 * using the inverse ENU formula:
 *   lat = lat0 + (sourceY / R) * (180/π)
 *   lon = lon0 + (sourceX / (R * cos(lat0 * π/180))) * (180/π)
 *
 * sourceX/sourceY are in [-500, 500] to keep the approximation accurate.
 *
 * The resulting control points satisfy: targetEast ≈ sourceX, targetNorth ≈ sourceY
 * (i.e. the similarity transform should recover identity: a≈1, b≈0, tx≈0, ty≈0).
 */
export const arbControlPointsIdentityEnu: fc.Arbitrary<ControlPointInput[]> = fc
  .array(
    fc.record({
      sourceX: fc.float({ min: -500, max: 500, noNaN: true }),
      sourceY: fc.float({ min: -500, max: 500, noNaN: true }),
    }),
    { minLength: 3, maxLength: 10 }
  )
  .filter((pts) => {
    // Ensure the first 3 source points are non-collinear
    const [p0, p1, p2] = pts;
    const area =
      (p1.sourceX - p0.sourceX) * (p2.sourceY - p0.sourceY) -
      (p2.sourceX - p0.sourceX) * (p1.sourceY - p0.sourceY);
    return Math.abs(area) > 1e-6;
  })
  .map((pts: Array<{ sourceX: number; sourceY: number }>) => {
    const { lat: lat0, lon: lon0 } = IDENTITY_ENU_ORIGIN;
    const cosLat0 = Math.cos(lat0 * DEG_TO_RAD);

    return pts.map((p, i): ControlPointInput => {
      // Inverse ENU: convert (sourceX, sourceY) meters → (lat, lon)
      // so that latLonToENU(origin, {lat, lon}) ≈ {east: sourceX, north: sourceY}
      const dLat = p.sourceY / WGS84_R;
      const dLon = p.sourceX / (WGS84_R * cosLat0);
      const targetLat = lat0 + dLat * (180 / Math.PI);
      const targetLon = lon0 + dLon * (180 / Math.PI);

      return {
        id: `id_${i}`,
        sourceX: p.sourceX,
        sourceY: p.sourceY,
        targetLat,
        targetLon,
      };
    });
  });
