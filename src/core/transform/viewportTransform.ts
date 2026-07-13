// ============================================================
// Viewport Transform — CAD ↔ Canvas ↔ GPS coordinate conversion
// ============================================================
//
// Pure utility functions for converting between three coordinate
// spaces used in the CAD drawing canvas:
//
//   1. CAD space  — DXF/drawing units (arbitrary, e.g. mm or inches)
//   2. Canvas     — pixel coordinates on the React Native Canvas2D
//   3. GPS space  — latitude / longitude (WGS-84 decimal degrees)
//
// The viewport transform maps CAD coordinates into canvas pixels
// while preserving aspect ratio. GPS conversion uses the canvas
// center as a reference point and a meters-per-pixel ratio.
//
// All functions are pure with no side effects.

// ============================================================
// Types
// ============================================================

/** Axis-aligned bounding box in CAD coordinate space */
export type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

/** Describes how CAD coordinates map to canvas pixels */
export type ViewportTransform = {
  scale: number;       // pixels per CAD unit
  offsetX: number;     // pixel offset X (centers drawing horizontally)
  offsetY: number;     // pixel offset Y (centers drawing vertically)
  originX: number;     // CAD X origin (bbox.minX) absorbed into transform
  originY: number;     // CAD Y origin (bbox.minY) absorbed into transform
  canvasWidth: number;
  canvasHeight: number;
};

// ============================================================
// Bounding Box
// ============================================================

/**
 * Compute the axis-aligned bounding box of a set of 2D points.
 *
 * @param points - Array of {x, y} points in CAD space
 * @returns BBox with min/max extents and dimensions
 *
 * If the array is empty, returns a 1x1 box centered at the origin
 * so that downstream scale calculations never divide by zero.
 */
export function computeBoundingBox(
  points: Array<{ x: number; y: number }>
): BBox {
  if (points.length === 0) {
    return { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5, width: 1, height: 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Compute the bounding box encompassing all CAD entities.
 *
 * Handles:
 *   - Entities with `points` arrays: includes every point
 *   - Entities with `center` + `radius` (circles/arcs): includes
 *     center minus/plus radius in both axes
 *
 * @param entities - Array of CAD entities with varying shapes
 * @returns BBox covering all entity geometry
 */
export function computeEntityBoundingBox(
  entities: Array<{
    type: string;
    points?: Array<{ x: number; y: number }>;
    center?: { x: number; y: number };
    radius?: number;
  }>
): BBox {
  const allPoints: Array<{ x: number; y: number }> = [];

  for (const entity of entities) {
    if (entity.points && entity.points.length > 0) {
      allPoints.push(...entity.points);
    }
    if (entity.center !== undefined && entity.radius !== undefined) {
      const r = entity.radius;
      const c = entity.center;
      allPoints.push(
        { x: c.x - r, y: c.y - r },
        { x: c.x + r, y: c.y + r }
      );
    }
  }

  return computeBoundingBox(allPoints);
}

// ============================================================
// Viewport Scaling
// ============================================================

/**
 * Compute the viewport transform that fits a bounding box inside
 * the canvas while preserving aspect ratio.
 *
 * The drawing is centered in the canvas with the given padding
 * around all edges. The scale factor is the smaller of the
 * horizontal and vertical scales so no axis is stretched.
 *
 * @param bbox         - Bounding box of the drawing in CAD units
 * @param canvasWidth  - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param padding      - Margin around the drawing in pixels (default 40)
 * @returns ViewportTransform with scale, offsets, and canvas dimensions
 */
export function scaleToViewport(
  bbox: BBox,
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 40
): ViewportTransform {
  const availWidth = canvasWidth - 2 * padding;
  const availHeight = canvasHeight - 2 * padding;

  // Guard against non-positive available area
  if (availWidth <= 0 || availHeight <= 0) {
    return {
      scale: 1,
      offsetX: padding,
      offsetY: padding,
      originX: bbox.minX,
      originY: bbox.minY,
      canvasWidth,
      canvasHeight,
    };
  }

  // Guard against zero-size bounding box (single point or coincident points)
  const drawWidth = bbox.width || 1;
  const drawHeight = bbox.height || 1;

  const scaleX = availWidth / drawWidth;
  const scaleY = availHeight / drawHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center the drawing within the available area
  const renderedWidth = drawWidth * scale;
  const renderedHeight = drawHeight * scale;

  const offsetX = padding + (availWidth - renderedWidth) / 2;
  const offsetY = padding + (availHeight - renderedHeight) / 2;

  return { scale, offsetX, offsetY, originX: bbox.minX, originY: bbox.minY, canvasWidth, canvasHeight };
}

// ============================================================
// Point Transforms (CAD ↔ Canvas)
// ============================================================

/**
 * Convert a CAD coordinate to canvas pixel coordinates.
 *
 * Formula:
 *   canvasX = (cadX - originX) * scale + offsetX
 *   canvasY = (cadY - originY) * scale + offsetY
 *
 * Note: CAD Y typically increases upward while canvas Y increases
 * downward. The caller is responsible for any Y-flip needed by
 * the rendering layer.
 *
 * @param point     - Point in CAD coordinate space
 * @param transform - Viewport transform (from scaleToViewport)
 * @returns Point in canvas pixel coordinates
 */
export function transformPoint(
  point: { x: number; y: number },
  transform: ViewportTransform
): { x: number; y: number } {
  return {
    x: (point.x - transform.originX) * transform.scale + transform.offsetX,
    y: (point.y - transform.originY) * transform.scale + transform.offsetY,
  };
}

/**
 * Convert canvas pixel coordinates back to CAD coordinates.
 *
 * Inverse of transformPoint:
 *   cadX = (canvasX - offsetX) / scale + originX
 *   cadY = (canvasY - offsetY) / scale + originY
 *
 * @param point     - Point in canvas pixel coordinates
 * @param transform - Viewport transform (from scaleToViewport)
 * @param bbox      - Original bounding box used to create the transform
 * @returns Point in CAD coordinate space
 */
export function inverseTransformPoint(
  point: { x: number; y: number },
  transform: ViewportTransform,
  bbox: BBox
): { x: number; y: number } {
  return {
    x: (point.x - transform.offsetX) / transform.scale + bbox.minX,
    y: (point.y - transform.offsetY) / transform.scale + bbox.minY,
  };
}

// ============================================================
// GPS ↔ Canvas Conversion
// ============================================================

/** Meters per degree of latitude (WGS-84 approximation) */
const METERS_PER_DEGREE_LAT = 111320;

/**
 * Convert canvas pixel position to GPS (latitude / longitude).
 *
 * Uses the canvas center as the reference point for the given
 * centerLat / centerLng. The metersPerPixel parameter defines
 * the spatial resolution of each pixel.
 *
 * Formula:
 *   deltaXMeters = (canvasX - canvasWidth/2) * metersPerPixel
 *   deltaYMeters = (canvasY - canvasHeight/2) * metersPerPixel
 *   lat = centerLat - (deltaYMeters / 111320)
 *   lng = centerLng + (deltaXMeters / (111320 * cos(centerLat)))
 *
 * The latitude cosine factor correctly adjusts longitude scaling
 * at higher latitudes where degrees of longitude are shorter.
 *
 * @param canvasX       - X pixel position on canvas
 * @param canvasY       - Y pixel position on canvas
 * @param centerLat     - Latitude of the canvas center point
 * @param centerLng     - Longitude of the canvas center point
 * @param metersPerPixel - Spatial resolution (meters per pixel)
 * @param canvasWidth   - Canvas width in pixels
 * @param canvasHeight  - Canvas height in pixels
 * @returns { lat, lng } in decimal degrees
 */
export function canvasToGPS(
  canvasX: number,
  canvasY: number,
  centerLat: number,
  centerLng: number,
  metersPerPixel: number,
  canvasWidth: number,
  canvasHeight: number
): { lat: number; lng: number } {
  const deltaXMeters = (canvasX - canvasWidth / 2) * metersPerPixel;
  const deltaYMeters = (canvasY - canvasHeight / 2) * metersPerPixel;

  const lat = centerLat - (deltaYMeters / METERS_PER_DEGREE_LAT);
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const safeCosLat = Math.max(Math.abs(cosLat), 1e-10);
  const lng = centerLng + (deltaXMeters / (METERS_PER_DEGREE_LAT * safeCosLat));

  return { lat, lng };
}

/**
 * Convert GPS (latitude / longitude) to canvas pixel position.
 *
 * Inverse of canvasToGPS:
 *   canvasX = canvasWidth/2 + ((lng - centerLng) * 111320 * cos(centerLat)) / metersPerPixel
 *   canvasY = canvasHeight/2 - ((lat - centerLat) * 111320) / metersPerPixel
 *
 * @param lat           - Latitude in decimal degrees
 * @param lng           - Longitude in decimal degrees
 * @param centerLat     - Latitude of the canvas center point
 * @param centerLng     - Longitude of the canvas center point
 * @param metersPerPixel - Spatial resolution (meters per pixel)
 * @param canvasWidth   - Canvas width in pixels
 * @param canvasHeight  - Canvas height in pixels
 * @returns { x, y } in canvas pixel coordinates
 */
export function gpsToCanvas(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  metersPerPixel: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const safeCosLat = Math.max(Math.abs(cosLat), 1e-10);

  const deltaLngMeters = (lng - centerLng) * METERS_PER_DEGREE_LAT * safeCosLat;
  const deltaLatMeters = (lat - centerLat) * METERS_PER_DEGREE_LAT;

  const x = canvasWidth / 2 + deltaLngMeters / metersPerPixel;
  const y = canvasHeight / 2 - deltaLatMeters / metersPerPixel;

  return { x, y };
}

// ============================================================
// Meters Per Pixel Estimation
// ============================================================

/**
 * Estimate the meters-per-pixel ratio for a given bounding box
 * and canvas size.
 *
 * This is useful when you know the physical extent of the drawing
 * (from DXF units and the georeferencing scale) and need the
 * metersPerPixel value for GPS ↔ canvas conversions.
 *
 * The estimation assumes:
 *   - The drawing is already in meter units (or the caller has
 *     converted the bbox to meters using the unit scale factor)
 *   - The drawing fits the canvas with the given padding
 *
 * @param bbox         - Bounding box of the drawing (in meters)
 * @param canvasWidth  - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param padding      - Margin around the drawing in pixels (default 40)
 * @returns metersPerPixel — approximate spatial resolution
 */
export function estimateMetersPerPixel(
  bbox: BBox,
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 40
): number {
  const availWidth = canvasWidth - 2 * padding;
  const availHeight = canvasHeight - 2 * padding;

  if (availWidth <= 0 || availHeight <= 0) {
    return 1;
  }

  const drawWidth = bbox.width || 1;
  const drawHeight = bbox.height || 1;

  // pixels-per-meter for each axis
  const pixPerMeterX = availWidth / drawWidth;
  const pixPerMeterY = availHeight / drawHeight;

  // Use the tighter fit (smaller pixels-per-meter → coarser resolution)
  const pixPerMeter = Math.min(pixPerMeterX, pixPerMeterY);

  // Guard against zero
  if (pixPerMeter <= 0) {
    return 1;
  }

  return 1 / pixPerMeter;
}