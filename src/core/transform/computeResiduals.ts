// ============================================================
// Residual Computation
// ============================================================
//
// Computes per-control-point residuals and RMS in ENU meters
// for a given similarity transform.
//
// Requirements: 15.1

import { ControlPointInput, ResidualEntry, SimilarityParams } from '../geometry/parsedPoint';
import { latLonToENU } from '../geo/enu';

/**
 * Compute per-control-point residuals and RMS error in ENU meters.
 *
 * For each control point:
 *   predicted ENU = (a*sx - b*sy + tx, b*sx + a*sy + ty)
 *   target ENU    = latLonToENU(enuOrigin, { lat: targetLat, lon: targetLon })
 *   errorMeters   = sqrt((predEast - targetEast)^2 + (predNorth - targetNorth)^2)
 *
 * rmsMeters = sqrt(mean(errorMeters^2))
 *
 * @param controlPoints  Array of control point correspondences
 * @param params         Similarity transform parameters { a, b, tx, ty }
 * @param enuOrigin      ENU tangent-plane anchor
 * @returns { entries: ResidualEntry[]; rmsMeters: number }
 */
export function computeResiduals(
  controlPoints: ReadonlyArray<ControlPointInput>,
  params: SimilarityParams,
  enuOrigin: { lat: number; lon: number }
): { entries: ResidualEntry[]; rmsMeters: number } {
  const { a, b, tx, ty } = params;
  const origin = { lat: enuOrigin.lat, lon: enuOrigin.lon, alt: 0 as const };

  const entries: ResidualEntry[] = [];
  let sumSqErr = 0;

  for (const cp of controlPoints) {
    const predEast  = a * cp.sourceX - b * cp.sourceY + tx;
    const predNorth = b * cp.sourceX + a * cp.sourceY + ty;

    const targetEnu = latLonToENU(origin, {
      lat: cp.targetLat,
      lon: cp.targetLon,
      alt: 0,
    });

    const dx = predEast  - targetEnu.x;
    const dy = predNorth - targetEnu.y;
    const errorMeters = Math.sqrt(dx * dx + dy * dy);

    entries.push({
      controlPointId: cp.id,
      eastMeters:     predEast,
      northMeters:    predNorth,
      errorMeters,
    });

    sumSqErr += errorMeters * errorMeters;
  }

  const rmsMeters = entries.length > 0
    ? Math.sqrt(sumSqErr / entries.length)
    : 0;

  return { entries, rmsMeters };
}
