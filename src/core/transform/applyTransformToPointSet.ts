// ============================================================
// Apply Similarity Transform to a ParsedPointSet
// ============================================================
//
// Maps every ParsedPoint from DXF-local coordinates to geographic
// coordinates (lat/lon) using a 4-parameter similarity transform
// solved in the ENU (East-North-Up) tangent plane.
//
// Transform formula (ENU meters):
//   east'  = a * sourceX - b * sourceY + tx
//   north' = b * sourceX + a * sourceY + ty
//
// where a = s*cos(θ), b = s*sin(θ), s = scale, θ = rotation.
//
// After computing (east', north'), the ENU point is inverse-projected
// back to (lat, lon) using the ENU origin anchor.
//
// Requirements: 14.1, 14.2, 14.4

import { ParsedPoint, ParsedPointSet, SimilarityParams } from '../geometry/parsedPoint';
import { enuToLatLon } from '../geo/enu';

/**
 * Apply a 4-parameter similarity transform to every point in a ParsedPointSet.
 *
 * For each point:
 *   1. Compute east'  = a * sourceX - b * sourceY + tx
 *   2. Compute north' = b * sourceX + a * sourceY + ty
 *   3. Inverse-project (east', north') to (lat, lon) via enuToLatLon
 *   4. Return a new point with targetLat, targetLon set and isTransformed = true
 *
 * The input array is NOT mutated. All other fields (id, sourceEntity, etc.)
 * are carried over unchanged.
 *
 * @param points     - The parsed point set to transform
 * @param params     - Similarity transform parameters { a, b, tx, ty }
 * @param enuOrigin  - ENU tangent-plane anchor (geoPoints[0])
 * @returns A new ParsedPointSet of the same length with transformed coordinates
 */
export function applyTransformToPointSet(
  points: ParsedPointSet,
  params: SimilarityParams,
  enuOrigin: { lat: number; lon: number }
): ParsedPointSet {
  const { a, b, tx, ty } = params;
  const origin = { lat: enuOrigin.lat, lon: enuOrigin.lon, alt: 0 as const };

  return points.map((point: ParsedPoint): ParsedPoint => {
    const { sourceX, sourceY } = point;

    // Step 1 & 2: Apply similarity transform in ENU meters
    const east  = a * sourceX - b * sourceY + tx;
    const north = b * sourceX + a * sourceY + ty;

    // Step 3: Inverse-project ENU → lat/lon
    const { lat, lon } = enuToLatLon(origin, { x: east, y: north });

    // Step 4: Return new point with all original fields preserved
    return {
      ...point,
      targetLat: lat,
      targetLon: lon,
      isTransformed: true,
    };
  });
}
