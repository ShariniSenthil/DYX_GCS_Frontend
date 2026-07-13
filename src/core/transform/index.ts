// ============================================================
// Transform module — barrel export
// ============================================================

export {
  computeBoundingBox,
  computeEntityBoundingBox,
  scaleToViewport,
  transformPoint,
  inverseTransformPoint,
  canvasToGPS,
  gpsToCanvas,
  estimateMetersPerPixel,
} from './viewportTransform';

export type { BBox, ViewportTransform } from './viewportTransform';