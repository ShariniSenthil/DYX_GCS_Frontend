// ============================================================
// Similarity Least-Squares Solver
// ============================================================
//
// Solves a 4-parameter similarity transform [a, b, tx, ty] from
// ≥ 3 control point correspondences in ENU (East-North-Up) meters.
//
// The transform maps DXF-local (sourceX, sourceY) to ENU meters:
//   east'  = a * sx - b * sy + tx
//   north' = b * sx + a * sy + ty
//
// where a = s*cos(θ), b = s*sin(θ), s = scale, θ = rotation.
//
// The normal equations M * [a, b, tx, ty]ᵀ = v are accumulated
// directly (without materialising the full N×4 design matrix A)
// and solved via Gaussian elimination with partial pivoting.
//
// Requirements: 13.1, 13.2, 13.3, 13.4

import {
  ControlPointInput,
  SolveOutcome,
  SolveResult,
  SolveFailure,
  SimilarityParams,
  ResidualEntry,
} from '../geometry/parsedPoint';
import { latLonToENU } from '../geo/enu';
import { TransformMatrix } from './transformEngine';

// ── Gaussian elimination with partial pivoting (4×4) ─────────

/**
 * Solve a 4×4 linear system A * x = b in-place via Gaussian
 * elimination with partial pivoting.
 *
 * @param A     4×4 matrix (will be mutated)
 * @param b     4-vector right-hand side (will be mutated)
 * @param normInf  max absolute entry of the original A (for pivot check)
 * @returns solution vector [x0, x1, x2, x3], or null if singular
 */
function gaussianElimination4x4(
  A: number[][],
  b: number[],
  normInf: number
): number[] | null {
  const n = 4;

  for (let col = 0; col < n; col++) {
    // ── Partial pivoting: find row with largest |A[row][col]| ──
    let maxVal = Math.abs(A[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    // ── Swap rows ──────────────────────────────────────────────
    if (maxRow !== col) {
      [A[col], A[maxRow]] = [A[maxRow], A[col]];
      [b[col], b[maxRow]] = [b[maxRow], b[col]];
    }

    // ── Singularity check ──────────────────────────────────────
    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12 * normInf) {
      return null; // singular or near-singular
    }

    // ── Eliminate below ────────────────────────────────────────
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  // ── Back substitution ──────────────────────────────────────
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) {
      sum -= A[row][k] * x[k];
    }
    x[row] = sum / A[row][row];
  }

  return x;
}

// ── Public solver ─────────────────────────────────────────────

/**
 * Solve a 4-parameter similarity transform from ≥ 3 control points.
 *
 * @param controlPoints  Array of control point correspondences
 * @param enuOrigin      ENU tangent-plane anchor (geoPoints[0])
 * @returns SolveOutcome — either a SolveResult or a SolveFailure
 */
export function solveSimilarityLS(
  controlPoints: ReadonlyArray<ControlPointInput>,
  enuOrigin: { lat: number; lon: number }
): SolveOutcome {
  // ── 1. Input validation ────────────────────────────────────

  if (controlPoints.length < 3) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_CONTROL_POINTS',
      message: 'At least 3 control points are required',
    } satisfies SolveFailure;
  }

  for (const cp of controlPoints) {
    if (
      !isFinite(cp.sourceX) ||
      !isFinite(cp.sourceY) ||
      !isFinite(cp.targetLat) ||
      !isFinite(cp.targetLon)
    ) {
      return {
        ok: false,
        reason: 'NON_FINITE_INPUT',
        message: 'Control point contains non-finite coordinates',
      } satisfies SolveFailure;
    }
  }

  // ── 2. Project targets to ENU ──────────────────────────────

  const origin = { lat: enuOrigin.lat, lon: enuOrigin.lon, alt: 0 as const };

  const enuTargets: Array<{ x: number; y: number }> = controlPoints.map(cp => {
    return latLonToENU(origin, { lat: cp.targetLat, lon: cp.targetLon, alt: 0 });
  });

  // ── 3. Accumulate 4×4 normal equations M = AᵀA, v = Aᵀb ──

  // M is 4×4 symmetric; initialise to zero
  const M: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const v: number[] = [0, 0, 0, 0];

  for (let i = 0; i < controlPoints.length; i++) {
    const sx = controlPoints[i].sourceX;
    const sy = controlPoints[i].sourceY;
    const te = enuTargets[i].x; // target east
    const tn = enuTargets[i].y; // target north

    // Design matrix rows: [sx, -sy, 1, 0] and [sy, sx, 0, 1]
    // AᵀA contributions:
    M[0][0] += sx * sx + sy * sy;
    M[1][1] += sy * sy + sx * sx; // same as M[0][0] contribution
    M[2][2] += 1;
    M[3][3] += 1;
    M[0][1] += 0; // sx*(-sy) + sy*sx = 0
    M[0][2] += sx;
    M[0][3] += sy;
    M[1][2] += -sy;
    M[1][3] += sx;
    M[2][3] += 0;

    // Aᵀb contributions:
    v[0] += sx * te + sy * tn;
    v[1] += -sy * te + sx * tn;
    v[2] += te;
    v[3] += tn;
  }

  // Symmetrize M (copy upper triangle to lower)
  for (let i = 1; i < 4; i++) {
    for (let j = 0; j < i; j++) {
      M[i][j] = M[j][i];
    }
  }

  // ── 4. Solve M * [a, b, tx, ty]ᵀ = v ─────────────────────

  // Compute ||M||_∞ for singularity threshold
  let normInf = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const absVal = Math.abs(M[i][j]);
      if (absVal > normInf) normInf = absVal;
    }
  }

  // Deep-copy M and v so the originals are preserved for diagnostics
  const Acopy = M.map(row => [...row]);
  const bCopy = [...v];

  const solution = gaussianElimination4x4(Acopy, bCopy, normInf);

  if (solution === null) {
    return {
      ok: false,
      reason: 'SINGULAR_NORMAL_MATRIX',
      message: 'Control points are collinear or degenerate',
    } satisfies SolveFailure;
  }

  const [a, b, tx, ty] = solution;

  // ── 5. Build TransformMatrix from params (internal use only) ─

  const scale = Math.sqrt(a * a + b * b);
  const rotation = Math.atan2(b, a);
  // TransformMatrix is constructed but not included in the return value
  // (SolveResult only exposes params, not matrix)
  const _matrix: TransformMatrix = {
    scale,
    rotation,
    translation: { x: tx, y: ty },
  };
  void _matrix; // suppress unused-variable warning

  // ── 6. Compute residuals ───────────────────────────────────

  const residuals: ResidualEntry[] = [];
  let sumSqErr = 0;

  for (let i = 0; i < controlPoints.length; i++) {
    const cp = controlPoints[i];
    const sx = cp.sourceX;
    const sy = cp.sourceY;

    const predEast  = a * sx - b * sy + tx;
    const predNorth = b * sx + a * sy + ty;

    const targetEnu = latLonToENU(origin, {
      lat: cp.targetLat,
      lon: cp.targetLon,
      alt: 0,
    });

    const dx = predEast  - targetEnu.x;
    const dy = predNorth - targetEnu.y;
    const errorMeters = Math.sqrt(dx * dx + dy * dy);

    residuals.push({
      controlPointId: cp.id,
      eastMeters:     predEast,
      northMeters:    predNorth,
      errorMeters,
    });

    sumSqErr += errorMeters * errorMeters;
  }

  const rmsMeters = Math.sqrt(sumSqErr / controlPoints.length);

  // ── 7. Return SolveResult ──────────────────────────────────

  const params: SimilarityParams = { a, b, tx, ty };

  return {
    ok: true,
    params,
    residuals,
    rmsMeters,
    enuOrigin,
  } satisfies SolveResult;
}
