// ============================================================
// Localize DXF Point Set — Orchestrator
// ============================================================
//
// Orchestrates the full DXF localization pipeline:
//   1. Filter control points (isControlPoint === true)
//   2. Validate ≥ 3 control points
//   3. Solve similarity transform via solveSimilarityLS
//   4. On success, apply transform to all points
//   5. On failure, return input unchanged
//
// Requirements: 13.2, 13.4, 14.1, 14.2

import { ParsedPointSet, ControlPointInput, SolveOutcome } from '../geometry/parsedPoint';
import { solveSimilarityLS } from '../transform/solveSimilarityLS';
import { applyTransformToPointSet } from '../transform/applyTransformToPointSet';

/**
 * Localize a ParsedPointSet by solving a similarity transform from
 * its control points and applying it to every point.
 *
 * @param points - The parsed point set (some points have isControlPoint === true)
 * @returns { outcome: SolveOutcome; transformed: ParsedPointSet }
 *   - On success: outcome.ok === true, transformed has all points with isTransformed === true
 *   - On failure: outcome.ok === false, transformed === points (input unchanged)
 */
export function localizeDxfPointSet(
  points: ParsedPointSet
): { outcome: SolveOutcome; transformed: ParsedPointSet } {
  // Step 1: Filter control points
  const controlPoints = points.filter(p => p.isControlPoint);

  // Step 2: Validate ≥ 3 control points
  if (controlPoints.length < 3) {
    const outcome: SolveOutcome = {
      ok: false,
      reason: 'INSUFFICIENT_CONTROL_POINTS',
      message: 'At least 3 control points are required',
    };
    return { outcome, transformed: points };
  }

  // Build ControlPointInput array (targetLat/targetLon are non-null since isControlPoint === true)
  const controlPointInputs: ControlPointInput[] = controlPoints.map(p => ({
    id: p.id,
    sourceX: p.sourceX,
    sourceY: p.sourceY,
    targetLat: p.targetLat as number,
    targetLon: p.targetLon as number,
  }));

  // Step 3: Use the first control point's lat/lon as the ENU origin
  const enuOrigin = {
    lat: controlPointInputs[0].targetLat,
    lon: controlPointInputs[0].targetLon,
  };

  // Step 4: Solve similarity transform
  const outcome = solveSimilarityLS(controlPointInputs, enuOrigin);

  if (!outcome.ok) {
    // Step 5: On failure, return input unchanged
    return { outcome, transformed: points };
  }

  // Step 6: Apply transform to all points
  const transformed = applyTransformToPointSet(points, outcome.params, outcome.enuOrigin);

  return { outcome, transformed };
}
