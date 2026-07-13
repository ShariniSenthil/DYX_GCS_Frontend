// ============================================================
// Viewport Transforms — World <-> Screen coordinate conversion
// ============================================================
//
// All entities live in world coordinates. The viewport maps them
// to screen pixels for rendering and maps touch input back to world.
//
// Key invariant: World Y goes UP, Screen Y goes DOWN.
// The Y-flip is baked into both transforms.

import { Viewport, WorldPoint, ScreenPoint, CanvasSize } from './types';

export const MIN_SCALE = 0.001;
export const MAX_SCALE = 10000;

/** Clamp a value between min and max */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** World point -> screen pixel position for rendering */
export function worldToScreen(p: WorldPoint, vp: Viewport): ScreenPoint {
  return {
    x: p.x * vp.scale + vp.offsetX,
    y: -p.y * vp.scale + vp.offsetY,
  };
}

/** Screen pixel -> world point for touch/mouse input */
export function screenToWorld(s: ScreenPoint, vp: Viewport): WorldPoint {
  return {
    x: (s.x - vp.offsetX) / vp.scale,
    y: -(s.y - vp.offsetY) / vp.scale,
  };
}

/** Scale a world-space distance to screen pixels */
export function worldToScreenLength(len: number, vp: Viewport): number {
  return len * vp.scale;
}

/** Scale a screen-pixel distance to world units */
export function screenToWorldLength(len: number, vp: Viewport): number {
  return len / vp.scale;
}

/** Zoom centered on a screen point — keeps the world position under the cursor stable */
export function zoomAt(screenPivot: ScreenPoint, factor: number, vp: Viewport): Viewport {
  const worldBefore = screenToWorld(screenPivot, vp);
  const newScale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
  return {
    scale: newScale,
    offsetX: screenPivot.x - worldBefore.x * newScale,
    offsetY: screenPivot.y + worldBefore.y * newScale,
  };
}

/** Pan the viewport by a screen-pixel delta */
export function panBy(deltaX: number, deltaY: number, vp: Viewport): Viewport {
  return {
    ...vp,
    offsetX: vp.offsetX + deltaX,
    offsetY: vp.offsetY + deltaY,
  };
}

/** Create a viewport that fits all entities in the given canvas size (Zoom Extents) */
export function computeFitViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  canvas: CanvasSize,
  padding: number = 60,
): Viewport {
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;

  if (worldW <= 0 || worldH <= 0) {
    return { scale: 50, offsetX: canvas.width / 2, offsetY: canvas.height / 2 };
  }

  const availW = canvas.width - 2 * padding;
  const availH = canvas.height - 2 * padding;
  const scale = clamp(
    Math.min(availW / worldW, availH / worldH),
    MIN_SCALE,
    MAX_SCALE,
  );

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    scale,
    offsetX: canvas.width / 2 - centerX * scale,
    offsetY: canvas.height / 2 + centerY * scale,
  };
}

/** Default viewport centered on origin at a moderate zoom */
export function createDefaultViewport(canvas: CanvasSize): Viewport {
  return {
    scale: 50,
    offsetX: canvas.width / 2,
    offsetY: canvas.height / 2,
  };
}
