// ============================================================
// Transform Engine — computes and applies TRS (Translate-Rotate-Scale)
// ============================================================
//
// This is the mathematical core of the georeferencing engine.
// It computes a 2D affine transformation that maps CAD local
// coordinates to real-world metric space (ENU meters).
//
// The transform is computed from TWO point correspondences:
//   CAD point A ↔ GPS point A (converted to ENU)
//   CAD point B ↔ GPS point B (converted to ENU)
//
// From these, we derive:
//   1. Scale  — ratio of real-world distance to CAD distance
//   2. Rotation — angle difference between CAD vector and ENU vector
//   3. Translation — offset to align CAD origin with ENU origin
//
// Transform application order for a point P:
//   1. Translate P relative to CAD reference point A
//   2. Scale
//   3. Rotate
//   4. Translate to ENU reference origin
//
// This ensures the two reference points map exactly.

import { Point2D, GeoPoint, Vec2D } from '../geometry/types';
import { latLonToENU } from '../geo/enu';

/**
 * 2D transformation matrix (TRS decomposition).
 *
 * All transform operations decompose into these three components:
 *   - scale:   uniform scaling factor (CAD units → meters)
 *   - rotation: angle in radians (CAD frame → ENU frame)
 *   - translation: offset in meters (ENU space)
 */
export type TransformMatrix = {
  scale: number;
  rotation: number; // radians, counter-clockwise positive
  translation: { x: number; y: number };
};

/**
 * Compute the transformation that maps CAD coordinates → ENU meters.
 *
 * @param cadA - First reference point in CAD space
 * @param cadB - Second reference point in CAD space
 * @param geoA - First reference point in geographic coordinates
 * @param geoB - Second reference point in geographic coordinates
 * @returns TransformMatrix with scale, rotation, translation
 * @throws Error if CAD points are coincident (zero distance)
 *
 * Math derivation:
 * ───────────────
 * We have two vectors:
 *   v_cad = cadB - cadA    (in CAD units)
 *   v_enu = enuB - enuA    (in meters)
 *
 * Scale = |v_enu| / |v_cad|
 *
 * rotation = atan2(v_enu) - atan2(v_cad)
 *
 * translation = enuA - R(rotation) * S(scale) * cadA
 *
 * Where R is the rotation matrix and S is uniform scaling.
 */
export function computeTransform(
  cadA: Point2D,
  cadB: Point2D,
  geoA: GeoPoint,
  geoB: GeoPoint
): TransformMatrix {
  // ── Step 1: Convert GPS → ENU meters ──────────────────────
  // geoA becomes the ENU origin (0, 0) for this local frame
  const enuA = latLonToENU(geoA, geoA); // {0, 0} by definition
  const enuB = latLonToENU(geoA, geoB); // relative to geoA

  // ── Step 2: Compute vectors in each space ─────────────────
  const cadVec = {
    x: cadB.x - cadA.x,
    y: cadB.y - cadA.y,
  };
  const geoVec = {
    x: enuB.x - enuA.x,
    y: enuB.y - enuA.y,
  };

  // ── Step 3: Compute distances ─────────────────────────────
  const cadDist = Math.sqrt(cadVec.x * cadVec.x + cadVec.y * cadVec.y);
  const geoDist = Math.sqrt(geoVec.x * geoVec.x + geoVec.y * geoVec.y);

  // ── Validation: prevent division by zero ──────────────────
  if (cadDist < 1e-10) {
    throw new Error(
      'CAD reference points are coincident (distance ≈ 0). ' +
      'Choose two distinct points on the drawing.'
    );
  }

  if (geoDist < 1e-10) {
    throw new Error(
      'GPS reference points are coincident (distance ≈ 0). ' +
      'Choose two distinct geographic locations.'
    );
  }

  // ── Step 4: Compute scale ─────────────────────────────────
  // How many real-world meters per CAD unit?
  const scale = geoDist / cadDist;

  // ── Step 5: Compute rotation ──────────────────────────────
  // Angle of each vector in its own frame
  const cadAngle = Math.atan2(cadVec.y, cadVec.x);
  const geoAngle = Math.atan2(geoVec.y, geoVec.x);

  // Rotation needed to align CAD vector direction with ENU vector direction
  const rotation = geoAngle - cadAngle;

  // ── Step 6: Compute translation ───────────────────────────
  // After scaling and rotating cadA, where does it land in ENU?
  //   scaledRotatedA = R(rotation) * S(scale) * cadA
  // We want: translatedA = enuA
  // So: translation = enuA - scaledRotatedA
  //
  // Since enuA = (0, 0) by construction, this simplifies to:
  //   translation = -R(rotation) * S(scale) * cadA
  //
  // But we keep the general form for clarity:
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  const scaledRotatedCadA = {
    x: scale * (cadA.x * cosR - cadA.y * sinR),
    y: scale * (cadA.x * sinR + cadA.y * cosR),
  };

  const translation = {
    x: enuA.x - scaledRotatedCadA.x,
    y: enuA.y - scaledRotatedCadA.y,
  };

  return { scale, rotation, translation };
}

/**
 * Apply a transformation matrix to a 2D point.
 *
 * Transform order (mathematically correct):
 *   1. Scale the point
 *   2. Rotate the point
 *   3. Translate the point
 *
 * This is equivalent to: P' = R * S * P + T
 *
 * @param point  - Point in CAD space
 * @param matrix - Precomputed transform matrix
 * @returns Transformed point in ENU (meters)
 */
export function applyTransform(
  point: Point2D,
  matrix: TransformMatrix
): Vec2D {
  const { scale, rotation, translation } = matrix;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  // Step 1 + 2: Scale and rotate simultaneously
  //   [cos -sin] [scale   0  ] [x]
  //   [sin  cos] [  0   scale] [y]
  const xScaledRot = scale * (point.x * cosR - point.y * sinR);
  const yScaledRot = scale * (point.x * sinR + point.y * cosR);

  // Step 3: Translate
  return {
    x: xScaledRot + translation.x,
    y: yScaledRot + translation.y,
  };
}

/**
 * Apply a transformation to transform an entity's point.
 * Convenience wrapper that handles both Point2D inputs.
 */
export function transformPoint(
  point: Point2D,
  matrix: TransformMatrix
): Point2D {
  const result = applyTransform(point, matrix);
  return { x: result.x, y: result.y };
}
