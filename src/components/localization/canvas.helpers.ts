// ============================================================
// Canvas Viewport Helpers
// ============================================================
//
// Pure TypeScript helpers for the DxfCanvas component.
// No react-native imports — testable under node.
//
// Requirements: 8.2, 9.3, 9.4

import { ParsedPointSet } from '../../core/geometry/parsedPoint';

// ── Viewport type ─────────────────────────────────────────────

/**
 * Canvas viewport state: pan offset and zoom scale.
 *
 * A point (sourceX, sourceY) maps to screen coordinates (Y flipped):
 *   sx =  sourceX * zoom + panX
 *   sy = -sourceY * zoom + panY
 *
 * Inverse (screen → DXF):
 *   sourceX =  (sx - panX) / zoom
 *   sourceY = -(sy - panY) / zoom
 */
export type Viewport = {
  panX: number;
  panY: number;
  zoom: number;
};

// ── Coordinate transforms ────────────────────────────────────

/** Map a DXF source coordinate to screen space (Y flipped: CAD Y-up → screen Y-down). */
export function toScreen(
  sourceX: number,
  sourceY: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: sourceX * viewport.zoom + viewport.panX,
    y: -sourceY * viewport.zoom + viewport.panY,
  };
}

/** Map a screen coordinate back to DXF source space. */
export function toWorld(
  screenX: number,
  screenY: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: -(screenY - viewport.panY) / viewport.zoom,
  };
}

// ── computeAutoFitViewport ────────────────────────────────────

/**
 * Compute a viewport that fits the axis-aligned bounding box of
 * the given ParsedPointSet uniformly into the canvas.
 *
 * The bounding box is padded by 5% on each side. The zoom is
 * chosen so the bounding box fits entirely within the canvas
 * with equal X/Y scale (uniform scale, no distortion).
 *
 * @param points       - The parsed point set to fit
 * @param canvasWidth  - Canvas width in screen pixels
 * @param canvasHeight - Canvas height in screen pixels
 * @returns Viewport that fits the bounding box
 */
export function computeAutoFitViewport(
  points: ParsedPointSet,
  canvasWidth: number,
  canvasHeight: number
): Viewport {
  if (points.length === 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }

  // Compute bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.sourceX < minX) minX = p.sourceX;
    if (p.sourceX > maxX) maxX = p.sourceX;
    if (p.sourceY < minY) minY = p.sourceY;
    if (p.sourceY > maxY) maxY = p.sourceY;
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Handle degenerate case (all points at same location)
  if (bboxW < 1e-10 && bboxH < 1e-10) {
    return {
      panX: canvasWidth / 2 - minX,
      panY: canvasHeight / 2 + minY,
      zoom: 1,
    };
  }

  // Add 5% padding on each side
  const padFactor = 0.9; // use 90% of canvas for the bbox
  const scaleX = bboxW > 0 ? (canvasWidth * padFactor) / bboxW : 1;
  const scaleY = bboxH > 0 ? (canvasHeight * padFactor) / bboxH : 1;

  // Uniform scale: use the smaller of the two to fit both axes
  const zoom = Math.min(scaleX, scaleY);

  // Center the bounding box in the canvas
  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;
  const panX = canvasWidth / 2 - bboxCenterX * zoom;
  const panY = canvasHeight / 2 + bboxCenterY * zoom;

  return { panX, panY, zoom };
}

// ── pickNearestPoint ──────────────────────────────────────────

/**
 * Find the nearest ParsedPoint to a screen-space tap position.
 *
 * Converts each point's (sourceX, sourceY) to screen coordinates
 * using toScreen (Y flipped), then returns the id of the nearest
 * point within `radiusPx` screen pixels, or null if none is in range.
 *
 * @param points   - The parsed point set
 * @param viewport - Current viewport state
 * @param tap      - Tap position in screen pixels { sx, sy }
 * @param radiusPx - Hit-test radius in screen pixels
 * @returns The id of the nearest point within radiusPx, or null
 */
export function pickNearestPoint(
  points: ParsedPointSet,
  viewport: Viewport,
  tap: { sx: number; sy: number },
  radiusPx: number
): string | null {
  let nearestId: string | null = null;
  let nearestDist = radiusPx;

  for (const p of points) {
    const sp = toScreen(p.sourceX, p.sourceY, viewport);

    const dx = sp.x - tap.sx;
    const dy = sp.y - tap.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = p.id;
    }
  }

  return nearestId;
}
