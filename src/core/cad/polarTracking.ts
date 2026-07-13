// ============================================================
// Polar Tracking & Ortho Mode
// ============================================================

import { WorldPoint } from './types';

export interface PolarTrackResult {
  angle: number;
  snappedPoint: WorldPoint;
  distance: number;
}

/**
 * Check if the cursor is near a polar tracking angle from the anchor.
 * If so, return the projected point along that angle.
 */
export function resolvePolarTrack(
  anchor: WorldPoint,
  cursor: WorldPoint,
  angles: number[],
  toleranceDeg: number,
): PolarTrackResult | null {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  const cursorAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const dist = Math.hypot(dx, dy);

  for (const angle of angles) {
    let diff = Math.abs(cursorAngle - angle);
    if (diff > 180) diff = 360 - diff;
    if (diff < toleranceDeg) {
      const rad = angle * Math.PI / 180;
      return {
        angle,
        snappedPoint: {
          x: anchor.x + dist * Math.cos(rad),
          y: anchor.y + dist * Math.sin(rad),
        },
        distance: dist,
      };
    }
  }
  return null;
}

/** Ortho mode: only horizontal/vertical (0, 90, 180, 270) */
export function resolveOrtho(anchor: WorldPoint, cursor: WorldPoint): WorldPoint {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: cursor.x, y: anchor.y };
  }
  return { x: anchor.x, y: cursor.y };
}
