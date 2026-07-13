// ============================================================
// DXF Parser — Production-Grade CAD File Parser
// ============================================================
//
// Uses the `dxf-parser` library for raw parsing, then normalizes
// to our internal entity format with:
//   - Correct unit scaling (mm, cm, m, inch, foot, yard, km, mile)
//   - LWPOLYLINE bulge → Arc segment conversion
//   - POLYLINE (nested vertex format) support
//   - Proper Point entity (not faked as Line)
//   - SPLINE → polyline approximation (recursive subdivision)
//   - ELLIPSE → polyline approximation (parametric sampling)
//   - INSERT → block reference with transform (position, scale, rotation)
//   - TEXT / MTEXT → TextEntity
//   - DIMENSION → dimension line + measurement text
//   - Layer metadata on every entity
//   - Angle normalization (always radians, handle wrap-around)
//
// Bulge math:
//   bulge = tan(theta / 4) where theta is the included angle
//   theta = 4 * atan(bulge)
//   chordLength = distance between consecutive vertices
//   sagitta = chordLength * |bulge| / 2
//   radius = chordLength / (2 * sin(|theta| / 2))
//   Arc direction: bulge > 0 = CCW, bulge < 0 = CW

import DxfParserLib from 'dxf-parser';
import {
  CADModel,
  CADUnits,
  UNIT_TO_METER,
  Entity,
  Line,
  PointEntity,
  Polyline,
  PolylineSegment,
  Arc,
  TextEntity,
  Point2D,
} from '../geometry/types';

// ============================================================
// Unit Detection & Scaling
// ============================================================

/** DXF $INSUNITS integer codes → our unit strings (AutoCAD standard) */
const DXF_UNIT_MAP: Record<number, CADUnits> = {
  0:  'unknown',     // Unitless
  1:  'inch',        // Inches
  2:  'foot',        // Feet
  3:  'mile',        // Miles
  4:  'mm',          // Millimeters
  5:  'cm',          // Centimeters
  6:  'm',           // Meters
  7:  'microinch',   // Microinches
  8:  'mil',         // Mils
  9:  'yard',        // Yards
  10: 'unknown',     // Angstroms
  11: 'unknown',     // Nanometers
  12: 'unknown',     // Microns
  13: 'unknown',     // Decimeters
  14: 'unknown',     // Decameters
  15: 'unknown',     // Hectometers
  16: 'km',          // Kilometers
  17: 'unknown',     // Decimal inches
  18: 'unknown',     // Decimal feet
  19: 'unknown',     // Decimal yards
  20: 'm',           // Astronomical units
  21: 'm',           // Light years
  22: 'm',           // Parsecs
} as const;

/**
 * Detect the drawing units from DXF header.
 * Falls back to 'unknown' if $INSUNITS is not set.
 */
function detectUnits(dxf: any): CADUnits {
  const headerUnits = dxf?.header?.$INSUNITS;
  if (typeof headerUnits === 'number' && headerUnits in DXF_UNIT_MAP) {
    return DXF_UNIT_MAP[headerUnits] as CADUnits;
  }
  return 'unknown';
}

// ============================================================
// ID Generation — per-parse counter (not module-level global)
// ============================================================

/** Creates a fresh ID generator for each parse operation. */
function createIdGenerator() {
  let counter = 0;
  return (prefix: string): string => `${prefix}_${++counter}`;
}

// ============================================================
// Bulge → Arc Math
// ============================================================

/**
 * Compute arc parameters from a bulge value between two vertices.
 *
 * The bulge is the tangent of 1/4 of the included angle (theta)
 * that the arc subtends between the two vertices.
 *
 *   bulge = tan(theta / 4)
 *   theta = 4 * atan(bulge)
 *
 * Positive bulge = arc is CCW from start to end
 * Negative bulge = arc is CW from start to end
 *
 * @param start - Start vertex of the segment
 * @param end   - End vertex of the segment
 * @param bulge - Bulge value (non-zero)
 * @returns Arc parameters: center, radius, startAngle, endAngle
 */
function bulgeToArc(
  start: Point2D,
  end: Point2D,
  bulge: number
): { center: Point2D; radius: number; startAngle: number; endAngle: number } {
  // Chord vector and length
  const chordX = end.x - start.x;
  const chordY = end.y - start.y;
  const chordLength = Math.sqrt(chordX * chordX + chordY * chordY);

  // Included angle from bulge
  const theta = 4 * Math.atan(bulge);
  const absTheta = Math.abs(theta);

  // Radius: r = chord / (2 * sin(theta/2))
  // Guard against division by zero (straight line — should not reach here)
  const sinHalf = Math.sin(absTheta / 2);
  const radius = chordLength / (2 * sinHalf);

  // Midpoint of chord
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Distance from chord midpoint to arc center (sagitta geometry)
  // h = chord/2 * (1/|tan(theta/2)|) = r * cos(theta/2)
  // But we need the signed distance to determine which side of the chord the center is on.
  // Using: h = (chordLength/2) / tan(|theta|/2)
  // Sign: if bulge > 0, center is to the LEFT of the chord direction
  const cosHalf = Math.cos(absTheta / 2);
  const h = radius * cosHalf; // distance from chord midpoint to center

  // Perpendicular to chord (rotated 90° CCW)
  // Chord direction: (chordX, chordY)
  // Perpendicular: (-chordY, chordX) — normalized
  const perpX = -chordY / chordLength;
  const perpY = chordX / chordLength;

  // Center is on the left side of chord if bulge > 0
  const sign = bulge > 0 ? 1 : -1;
  const centerX = midX + sign * h * perpX;
  const centerY = midY + sign * h * perpY;

  // Start and end angles from center (raw atan2, range [-π, π])
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
  const endAngle = Math.atan2(end.y - centerY, end.x - centerX);

  // Compute signed sweep so endAngle - startAngle always equals the correct sweep.
  // DXF convention: bulge > 0 = CCW (positive sweep), bulge < 0 = CW (negative sweep).
  let sweep = endAngle - startAngle;
  if (bulge > 0) {
    // CCW: ensure sweep is in (0, 2π]
    if (sweep <= 0) sweep += 2 * Math.PI;
  } else {
    // CW: ensure sweep is in [-2π, 0)
    if (sweep >= 0) sweep -= 2 * Math.PI;
  }

  return { center: { x: centerX, y: centerY }, radius, startAngle, endAngle: startAngle + sweep };
}

// ============================================================
// Angle Normalization
// ============================================================

/**
 * Normalize an angle to [0, 2π) range.
 * DXF stores angles in degrees; we always work in radians.
 */
function normalizeAngle(angleRad: number): number {
  const twoPi = 2 * Math.PI;
  let normalized = angleRad % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

/**
 * Convert DXF angle (degrees) to radians, normalized to [0, 2π).
 */
function dxfAngleToRadians(degrees: number): number {
  return normalizeAngle((degrees * Math.PI) / 180);
}

// ============================================================
// Coordinate Scaling
// ============================================================

/**
 * Scale a point by the unit-to-meter factor.
 * All coordinates in the output are in meters.
 */
function scalePoint(p: Point2D, scale: number): Point2D {
  return { x: p.x * scale, y: p.y * scale };
}

// ============================================================
// Entity Conversion
// ============================================================

function convertLine(raw: any, unitScale: number, nextId: (p: string) => string): Line {
  const start = scalePoint(
    { x: raw.vertices[0].x ?? 0, y: raw.vertices[0].y ?? 0 },
    unitScale
  );
  const end = scalePoint(
    { x: raw.vertices[1].x ?? 0, y: raw.vertices[1].y ?? 0 },
    unitScale
  );

  return {
    id: nextId('line'),
    type: 'Line',
    start,
    end,
    layer: raw.layer ?? undefined,
  };
}

function convertPoint(raw: any, unitScale: number, nextId: (p: string) => string): PointEntity {
  const position = scalePoint(
    { x: raw.position?.x ?? 0, y: raw.position?.y ?? 0 },
    unitScale
  );

  return {
    id: nextId('point'),
    type: 'Point',
    position,
    layer: raw.layer ?? undefined,
  };
}

function convertArc(raw: any, unitScale: number, nextId: (p: string) => string): Arc {
  const center = scalePoint(
    { x: raw.center?.x ?? 0, y: raw.center?.y ?? 0 },
    unitScale
  );
  const radius = (raw.radius ?? 0) * unitScale;

  // dxf-parser already converts DXF degrees → radians.
  // DXF ARC is always drawn CCW from startAngle to endAngle.
  const startAngle = raw.startAngle ?? 0;
  let endAngle = raw.endAngle ?? (2 * Math.PI);
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 2 * Math.PI; // wrap around for CCW
  endAngle = startAngle + sweep;

  return {
    id: nextId('arc'),
    type: 'Arc',
    center,
    radius,
    startAngle,
    endAngle,
    layer: raw.layer ?? undefined,
  };
}

function convertCircle(raw: any, unitScale: number, nextId: (p: string) => string): Arc {
  const center = scalePoint(
    { x: raw.center?.x ?? 0, y: raw.center?.y ?? 0 },
    unitScale
  );
  const radius = (raw.radius ?? 0) * unitScale;

  return {
    id: nextId('arc'),
    type: 'Arc',
    center,
    radius,
    startAngle: 0,
    endAngle: 2 * Math.PI,
    layer: raw.layer ?? undefined,
  };
}

/**
 * Convert a LWPOLYLINE entity to our Polyline type.
 *
 * LWPOLYLINE stores vertices in a flat array with optional bulge per vertex.
 * The bulge on vertex i applies to the segment from vertex i to vertex i+1.
 *
 * Each segment is either:
 *   - Line (bulge === 0 or absent)
 *   - Arc (bulge !== 0)
 */
function convertLWPolyline(raw: any, unitScale: number, nextId: (p: string) => string): Polyline {
  const vertices: Array<{ x: number; y: number; bulge?: number }> = raw.vertices || [];
  const isClosed = raw.shape === true || raw.closed === true;

  // Scale all vertices
  const scaledVertices = vertices.map((v) =>
    scalePoint({ x: v.x ?? 0, y: v.y ?? 0 }, unitScale)
  );

  // Build segments
  const segments: PolylineSegment[] = [];
  const segmentCount = isClosed ? scaledVertices.length : scaledVertices.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const startIdx = i;
    const endIdx = (i + 1) % scaledVertices.length;
    const start = scaledVertices[startIdx];
    const end = scaledVertices[endIdx];
    const bulge = vertices[startIdx]?.bulge ?? 0;

    if (Math.abs(bulge) > 1e-10) {
      // Bulge present → Arc segment
      const arc = bulgeToArc(start, end, bulge);
      segments.push({
        segmentType: 'Arc',
        center: scalePoint(arc.center, 1), // already scaled via start/end
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
        to: end,
      });
    } else {
      // Straight segment
      segments.push({
        segmentType: 'Line',
        to: end,
      });
    }
  }

  return {
    id: nextId('polyline'),
    type: 'Polyline',
    startPoint: scaledVertices[0] ?? { x: 0, y: 0 },
    segments,
    closed: isClosed,
    layer: raw.layer ?? undefined,
  };
}

/**
 * Convert a POLYLINE entity (old-style, nested vertices).
 *
 * POLYLINE uses a different structure: vertices are in a separate
 * `vertices` array with full vertex objects (x, y, bulge).
 */
function convertPolyline(raw: any, unitScale: number, nextId: (p: string) => string): Polyline {
  const vertices: Array<{ x: number; y: number; bulge?: number }> = raw.vertices || [];
  const isClosed = raw.shape === true || raw.closed === true;

  if (vertices.length === 0) {
    // Empty polyline — return degenerate
    return {
      id: nextId('polyline'),
      type: 'Polyline',
      startPoint: { x: 0, y: 0 },
      segments: [],
      closed: false,
      layer: raw.layer ?? undefined,
    };
  }

  const scaledVertices = vertices.map((v) =>
    scalePoint({ x: v.x ?? 0, y: v.y ?? 0 }, unitScale)
  );

  const segments: PolylineSegment[] = [];
  const segmentCount = isClosed ? scaledVertices.length : scaledVertices.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const startIdx = i;
    const endIdx = (i + 1) % scaledVertices.length;
    const start = scaledVertices[startIdx];
    const end = scaledVertices[endIdx];
    const bulge = vertices[startIdx]?.bulge ?? 0;

    if (Math.abs(bulge) > 1e-10) {
      const arc = bulgeToArc(start, end, bulge);
      segments.push({
        segmentType: 'Arc',
        center: arc.center,
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
        to: end,
      });
    } else {
      segments.push({
        segmentType: 'Line',
        to: end,
      });
    }
  }

  return {
    id: nextId('polyline'),
    type: 'Polyline',
    startPoint: scaledVertices[0],
    segments,
    closed: isClosed,
    layer: raw.layer ?? undefined,
  };
}

// ============================================================
// SPLINE → Polyline approximation
// ============================================================

/**
 * Sample points along a cubic B-spline using De Boor's algorithm.
 *
 * Uses recursive midpoint subdivision on the control polygon for simplicity.
 * For NURBS (rational) splines, we fall back to control-point interpolation.
 *
 * @param raw - dxf-parser SPLINE entity
 * @param unitScale - unit-to-meter scale factor
 * @param nextId - ID generator
 * @returns Polyline approximation of the spline
 */
function convertSpline(raw: any, unitScale: number, nextId: (p: string) => string): Polyline {
  const controlPoints: Array<{ x: number; y: number }> = raw.controlPoints || raw.fitPoints || [];
  const degree: number = raw.degreeOfSplineCurve ?? 3;
  const isClosed: boolean = raw.closed === true;

  if (controlPoints.length < degree + 1) {
    // Degenerate: not enough control points for the degree, fall back to control points as-is
    if (controlPoints.length === 0) {
      return {
        id: nextId('polyline'),
        type: 'Polyline',
        startPoint: { x: 0, y: 0 },
        segments: [],
        closed: false,
        layer: raw.layer ?? undefined,
      };
    }
    // Just connect the points with line segments
    const scaled = controlPoints.map((p: any) =>
      scalePoint({ x: p.x ?? 0, y: p.y ?? 0 }, unitScale)
    );
    const segments: PolylineSegment[] = [];
    for (let i = 1; i < scaled.length; i++) {
      segments.push({ segmentType: 'Line', to: scaled[i] });
    }
    if (isClosed && scaled.length > 1) {
      segments.push({ segmentType: 'Line', to: scaled[0] });
    }
    return {
      id: nextId('polyline'),
      type: 'Polyline',
      startPoint: scaled[0],
      segments,
      closed: isClosed,
      layer: raw.layer ?? undefined,
    };
  }

  // Sample the spline by subdividing the control polygon.
  // Use Chaikin's corner-cutting algorithm for a smooth approximation.
  const sampledPoints = sampleSplinePoints(controlPoints, degree, isClosed);

  // Scale all points
  const scaledPoints = sampledPoints.map((p) => scalePoint(p, unitScale));

  // Build polyline
  const segments: PolylineSegment[] = [];
  for (let i = 1; i < scaledPoints.length; i++) {
    segments.push({ segmentType: 'Line', to: scaledPoints[i] });
  }
  if (isClosed && scaledPoints.length > 1) {
    segments.push({ segmentType: 'Line', to: scaledPoints[0] });
  }

  return {
    id: nextId('polyline'),
    type: 'Polyline',
    startPoint: scaledPoints[0],
    segments,
    closed: isClosed,
    layer: raw.layer ?? undefined,
  };
}

/**
 * Sample points along a B-spline curve using De Boor's algorithm.
 *
 * For simplicity and robustness, we use the uniform knot vector approach
 * and evaluate at regular parameter intervals. Falls back to Chaikin
 * subdivision for edge cases.
 */
function sampleSplinePoints(
  controlPoints: Array<{ x: number; y: number }>,
  degree: number,
  isClosed: boolean
): Array<{ x: number; y: number }> {
  const n = controlPoints.length;
  const k = degree;

  // For closed splines, wrap control points
  const pts = isClosed ? [...controlPoints, ...controlPoints.slice(0, k)] : controlPoints;

  // Generate a uniform knot vector
  const m = pts.length + k + 1;
  const knots: number[] = [];
  for (let i = 0; i < m; i++) {
    knots.push(i);
  }

  // Number of sample points proportional to curve complexity
  const numSamples = Math.max(20, n * 8);
  const tMin = knots[k];
  const tMax = knots[m - k - 1];

  if (tMax <= tMin) {
    return pts.slice(0, n);
  }

  const samples: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (tMax - tMin) * (i / numSamples);
    const pt = deBoor(k, t, knots, pts);
    if (pt) {
      samples.push(pt);
    }
  }

  return samples.length > 0 ? samples : pts.slice(0, n);
}

/**
 * Evaluate a B-spline at parameter t using De Boor's algorithm.
 */
function deBoor(
  degree: number,
  t: number,
  knots: number[],
  controlPoints: Array<{ x: number; y: number }>
): { x: number; y: number } | null {
  const n = controlPoints.length;
  if (n === 0) return null;

  // Find knot span
  let k = 0;
  while (k < knots.length - 1 && knots[k + 1] <= t) {
    k++;
  }

  // Clamp k to valid range
  const s = Math.max(0, Math.min(k - degree, n - degree - 1));

  // Initialize with control points
  const d: Array<{ x: number; y: number }> = [];
  for (let j = 0; j <= degree; j++) {
    const idx = s + j;
    if (idx < n) {
      d[j] = { x: controlPoints[idx].x, y: controlPoints[idx].y };
    } else if (n > 0) {
      d[j] = { x: controlPoints[n - 1].x, y: controlPoints[n - 1].y };
    }
  }

  // De Boor recursion
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const idx = s + j;
      const knotLeft = idx + degree - r + 1 < knots.length ? knots[idx + degree - r + 1] : knots[knots.length - 1];
      const knotRight = idx < knots.length ? knots[idx] : knots[knots.length - 1];
      const denom = knotLeft - knotRight;

      if (Math.abs(denom) < 1e-12) {
        // Coincident knots: keep previous value
        continue;
      }

      const alpha = (t - knotRight) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      };
    }
  }

  return d[degree];
}

// ============================================================
// ELLIPSE → Polyline approximation
// ============================================================

/**
 * Convert an ELLIPSE entity to a Polyline approximation by sampling points
 * along the ellipse using the parametric formula:
 *   x = cx + a * cos(t) * cos(angle) - b * sin(t) * sin(angle)
 *   y = cy + a * cos(t) * sin(angle) + b * sin(t) * cos(angle)
 *
 * dxf-parser provides:
 *   - center: {x, y, z}
 *   - majorAxisEndPoint: {x, y, z} — endpoint of major axis relative to center
 *   - axisRatio: minor axis length / major axis length
 *   - startAngle, endAngle: parametric angles in radians (0..2π)
 */
function convertEllipse(raw: any, unitScale: number, nextId: (p: string) => string): Polyline {
  const cx = (raw.center?.x ?? 0) * unitScale;
  const cy = (raw.center?.y ?? 0) * unitScale;

  // Major axis endpoint is RELATIVE to center in dxf-parser
  const majorEndX = (raw.majorAxisEndPoint?.x ?? 0) * unitScale;
  const majorEndY = (raw.majorAxisEndPoint?.y ?? 0) * unitScale;

  // Semi-major axis length = distance from center to major axis endpoint
  const a = Math.sqrt(majorEndX * majorEndX + majorEndY * majorEndY);
  const axisRatio = raw.axisRatio ?? 1;
  const b = a * axisRatio; // Semi-minor axis

  // Rotation angle of the major axis (radians)
  const rotation = Math.atan2(majorEndY, majorEndX);

  // Parametric angles — dxf-parser provides these in radians
  // Full ellipse when startAngle=0 and endAngle=2π
  let startAngle = raw.startAngle ?? 0;
  let endAngle = raw.endAngle ?? 2 * Math.PI;

  // Normalize: if endAngle <= startAngle, treat as full ellipse
  if (endAngle <= startAngle) {
    endAngle = startAngle + 2 * Math.PI;
  }

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  // Sample points along the ellipse
  const numSegments = Math.max(36, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 36)));
  const angleStep = (endAngle - startAngle) / numSegments;

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = startAngle + i * angleStep;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);

    // Parametric ellipse rotated by `rotation`
    const x = cx + a * cosT * cosR - b * sinT * sinR;
    const y = cy + a * cosT * sinR + b * sinT * cosR;
    points.push({ x, y });
  }

  // Build polyline segments
  const segments: PolylineSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({ segmentType: 'Line', to: points[i] });
  }

  // Check if it's a full ellipse (close it)
  const isFullEllipse = Math.abs(endAngle - startAngle - 2 * Math.PI) < 1e-6;
  if (isFullEllipse && points.length > 1) {
    segments.push({ segmentType: 'Line', to: points[0] });
  }

  return {
    id: nextId('polyline'),
    type: 'Polyline',
    startPoint: points[0] ?? { x: cx, y: cy },
    segments,
    closed: isFullEllipse,
    layer: raw.layer ?? undefined,
  };
}

// ============================================================
// INSERT (block reference) → recursive entity expansion
// ============================================================

/**
 * Convert an INSERT entity by looking up the block definition and recursively
 * converting its entities with the INSERT's transform applied.
 *
 * dxf-parser provides:
 *   - name: block name (lookup key in dxf.blocks)
 *   - position: {x, y, z} — insertion point
 *   - xScale, yScale, zScale — scale factors
 *   - rotation: rotation in degrees
 *   - columnCount, rowCount, columnSpacing, rowSpacing — for array inserts
 */
function convertInsert(
  raw: any,
  unitScale: number,
  nextId: (p: string) => string,
  blocks: Record<string, any>
): Entity[] {
  const blockName: string = raw.name ?? '';
  const block = blocks[blockName];

  if (!block || !block.entities || block.entities.length === 0) {
    // Block not found or empty — create a Point entity at the insert position
    return [convertPoint(
      { position: raw.position, layer: raw.layer },
      unitScale,
      nextId
    )];
  }

  // Extract transform parameters
  const insertX = (raw.position?.x ?? 0) * unitScale;
  const insertY = (raw.position?.y ?? 0) * unitScale;
  const scaleX = raw.xScale ?? 1;
  const scaleY = raw.yScale ?? 1;
  const rotationDeg = raw.rotation ?? 0;
  const rotationRad = (rotationDeg * Math.PI) / 180;

  // Precompute rotation transform
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);

  /**
   * Apply INSERT transform to a 2D point:
   * 1. Scale by (scaleX, scaleY)
   * 2. Rotate by rotationRad
   * 3. Translate by insert position
   */
  const transformPoint = (p: { x: number; y: number }): { x: number; y: number } => {
    const sx = p.x * scaleX;
    const sy = p.y * scaleY;
    return {
      x: sx * cosR - sy * sinR + insertX,
      y: sx * sinR + sy * cosR + insertY,
    };
  };

  /**
   * Apply INSERT transform to a radius (uniform scale approximation).
   * Uses the geometric mean of scaleX and scaleY for approximate scaling.
   */
  const transformRadius = (r: number): number => {
    return r * Math.sqrt(Math.abs(scaleX * scaleY)) * unitScale;
  };

  /**
   * Apply INSERT transform to an angle (add the rotation).
   */
  const transformAngle = (angle: number): number => {
    return angle + rotationRad;
  };

  const resultEntities: Entity[] = [];
  const colCount = raw.columnCount ?? 1;
  const rowCount = raw.rowCount ?? 1;
  const colSpacing = (raw.columnSpacing ?? 0) * unitScale;
  const rowSpacing = (raw.rowSpacing ?? 0) * unitScale;

  // Handle MINSERT (array of block references)
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      // Offset for array position
      const offsetX = col * colSpacing;
      const offsetY = row * rowSpacing;

      // Process each entity in the block definition
      for (const blockEntity of block.entities) {
        const entityType = blockEntity.type?.toUpperCase();

        switch (entityType) {
          case 'LINE': {
            if (!blockEntity.vertices || blockEntity.vertices.length < 2) break;
            const start = transformPoint({
              x: (blockEntity.vertices[0].x ?? 0) * unitScale + offsetX,
              y: (blockEntity.vertices[0].y ?? 0) * unitScale + offsetY,
            });
            const end = transformPoint({
              x: (blockEntity.vertices[1].x ?? 0) * unitScale + offsetX,
              y: (blockEntity.vertices[1].y ?? 0) * unitScale + offsetY,
            });
            resultEntities.push({
              id: nextId('line'),
              type: 'Line',
              start,
              end,
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          case 'POINT': {
            const pos = transformPoint({
              x: (blockEntity.position?.x ?? 0) * unitScale + offsetX,
              y: (blockEntity.position?.y ?? 0) * unitScale + offsetY,
            });
            resultEntities.push({
              id: nextId('point'),
              type: 'Point',
              position: pos,
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          case 'ARC': {
            const center = transformPoint({
              x: (blockEntity.center?.x ?? 0) * unitScale + offsetX,
              y: (blockEntity.center?.y ?? 0) * unitScale + offsetY,
            });
            const radius = transformRadius(blockEntity.radius ?? 0);
            const startAngle = blockEntity.startAngle ?? 0;
            let endAngle = blockEntity.endAngle ?? (2 * Math.PI);
            let sweep = endAngle - startAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
            const transformedStart = transformAngle(startAngle);
            resultEntities.push({
              id: nextId('arc'),
              type: 'Arc',
              center,
              radius,
              startAngle: transformedStart,
              endAngle: transformedStart + sweep,
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          case 'CIRCLE': {
            const center = transformPoint({
              x: (blockEntity.center?.x ?? 0) * unitScale + offsetX,
              y: (blockEntity.center?.y ?? 0) * unitScale + offsetY,
            });
            const radius = transformRadius(blockEntity.radius ?? 0);
            resultEntities.push({
              id: nextId('arc'),
              type: 'Arc',
              center,
              radius,
              startAngle: transformAngle(0),
              endAngle: transformAngle(2 * Math.PI),
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          case 'LWPOLYLINE':
          case 'POLYLINE': {
            const verts: Array<{ x: number; y: number; bulge?: number }> = blockEntity.vertices || [];
            if (verts.length < 2) break;
            const isClosed = blockEntity.shape === true || blockEntity.closed === true;
            const scaledVerts = verts.map((v: any) => transformPoint({
              x: (v.x ?? 0) * unitScale + offsetX,
              y: (v.y ?? 0) * unitScale + offsetY,
            }));
            const segments: PolylineSegment[] = [];
            const segCount = isClosed ? scaledVerts.length : scaledVerts.length - 1;
            for (let i = 0; i < segCount; i++) {
              const endIdx = (i + 1) % scaledVerts.length;
              const bulge = verts[i]?.bulge ?? 0;
              if (Math.abs(bulge) > 1e-10) {
                const arc = bulgeToArc(scaledVerts[i], scaledVerts[endIdx], bulge);
                segments.push({
                  segmentType: 'Arc',
                  center: arc.center,
                  radius: arc.radius * Math.sqrt(Math.abs(scaleX * scaleY)),
                  startAngle: transformAngle(arc.startAngle),
                  endAngle: transformAngle(arc.endAngle),
                  to: scaledVerts[endIdx],
                });
              } else {
                segments.push({ segmentType: 'Line', to: scaledVerts[endIdx] });
              }
            }
            resultEntities.push({
              id: nextId('polyline'),
              type: 'Polyline',
              startPoint: scaledVerts[0],
              segments,
              closed: isClosed,
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          case 'TEXT':
          case 'MTEXT': {
            const textPos = blockEntity.position ?? blockEntity.startPoint;
            const pos = transformPoint({
              x: (textPos?.x ?? 0) * unitScale + offsetX,
              y: (textPos?.y ?? 0) * unitScale + offsetY,
            });
            const height = ((blockEntity.textHeight ?? blockEntity.height ?? 0) * unitScale) * Math.abs(scaleY);
            const textRotation = transformAngle(dxfAngleToRadians(blockEntity.rotation ?? 0));
            resultEntities.push({
              id: nextId('text'),
              type: 'Text',
              position: pos,
              text: blockEntity.text ?? '',
              height,
              rotation: textRotation,
              layer: raw.layer ?? blockEntity.layer ?? undefined,
            });
            break;
          }

          // Nested INSERT is not supported — skip to prevent infinite recursion
          case 'INSERT':
            break;

          default:
            break;
        }
      }
    }
  }

  return resultEntities;
}

// ============================================================
// TEXT / MTEXT → TextEntity
// ============================================================

/**
 * Convert a TEXT entity to a TextEntity.
 *
 * dxf-parser provides:
 *   - startPoint: {x, y, z} — first alignment point
 *   - text: string content
 *   - textHeight: number
 *   - rotation: degrees
 *   - layer: string
 */
function convertText(raw: any, unitScale: number, nextId: (p: string) => string): TextEntity {
  const position = scalePoint(
    { x: raw.startPoint?.x ?? 0, y: raw.startPoint?.y ?? 0 },
    unitScale
  );
  const height = (raw.textHeight ?? 0) * unitScale;
  const rotation = dxfAngleToRadians(raw.rotation ?? 0);

  return {
    id: nextId('text'),
    type: 'Text',
    position,
    text: raw.text ?? '',
    height,
    rotation,
    layer: raw.layer ?? undefined,
  };
}

/**
 * Convert an MTEXT entity to a TextEntity.
 *
 * dxf-parser provides:
 *   - position: {x, y, z} — insertion point
 *   - text: string content (may be concatenated from groups 3 and 1)
 *   - height: text height
 *   - rotation: degrees
 *   - layer: string
 */
function convertMText(raw: any, unitScale: number, nextId: (p: string) => string): TextEntity {
  const position = scalePoint(
    { x: raw.position?.x ?? 0, y: raw.position?.y ?? 0 },
    unitScale
  );
  const height = (raw.height ?? 0) * unitScale;
  const rotation = dxfAngleToRadians(raw.rotation ?? 0);

  return {
    id: nextId('text'),
    type: 'Text',
    position,
    text: raw.text ?? '',
    height,
    rotation,
    layer: raw.layer ?? undefined,
  };
}

// ============================================================
// DIMENSION → Line + TextEntity
// ============================================================

/**
 * Convert a DIMENSION entity to a Line (dimension line) and a TextEntity (measurement).
 *
 * dxf-parser provides:
 *   - anchorPoint: {x, y, z} — definition point (group 10)
 *   - linearOrAngularPoint1: {x, y, z} — first definition point (group 13)
 *   - linearOrAngularPoint2: {x, y, z} — second definition point (group 14)
 *   - middleOfText: {x, y, z} — middle of dimension text (group 11)
 *   - actualMeasurement: number (group 42)
 *   - text: string (group 1) — user override text, empty means use measurement
 *   - angle: degrees (group 50) — rotation for linear dimensions
 *   - dimensionType: number (group 70) — bit-coded type
 */
function convertDimension(raw: any, unitScale: number, nextId: (p: string) => string): Entity[] {
  const entities: Entity[] = [];

  // Use definition points for the dimension line
  const p1 = scalePoint(
    { x: raw.linearOrAngularPoint1?.x ?? raw.anchorPoint?.x ?? 0, y: raw.linearOrAngularPoint1?.y ?? raw.anchorPoint?.y ?? 0 },
    unitScale
  );
  const p2 = scalePoint(
    { x: raw.linearOrAngularPoint2?.x ?? raw.anchorPoint?.x ?? 0, y: raw.linearOrAngularPoint2?.y ?? raw.anchorPoint?.y ?? 0 },
    unitScale
  );

  // Dimension line between the two definition points
  // Only create if points are distinct
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.sqrt(dx * dx + dy * dy) > 1e-10) {
    entities.push({
      id: nextId('line'),
      type: 'Line',
      start: p1,
      end: p2,
      layer: raw.layer ?? undefined,
    });
  }

  // Measurement text
  const textPosition = scalePoint(
    { x: raw.middleOfText?.x ?? ((p1.x + p2.x) / 2), y: raw.middleOfText?.y ?? ((p1.y + p2.y) / 2) },
    unitScale
  );

  // Determine text content
  const measurement = raw.actualMeasurement ?? 0;
  const textContent = raw.text && raw.text.length > 0 ? raw.text : measurement.toFixed(2);

  // Text height — use a reasonable default if not available
  const height = unitScale; // Default to 1 drawing unit, scaled

  entities.push({
    id: nextId('text'),
    type: 'Text',
    position: textPosition,
    text: textContent,
    height,
    rotation: dxfAngleToRadians(raw.angle ?? 0),
    layer: raw.layer ?? undefined,
  });

  return entities;
}

// ============================================================
// Main Parser
// ============================================================

/**
 * Parse a DXF file string into our internal CADModel.
 *
 * All output coordinates are in meters (after unit scaling).
 *
 * @param dxfContent - Raw DXF file content as string
 * @returns CADModel with normalized entities, detected units, and unit scale
 * @throws Error if parsing fails
 */
export function parseDXF(dxfContent: string): CADModel {
  const nextId = createIdGenerator();

  const parser = new DxfParserLib();
  let dxf: any;

  try {
    dxf = parser.parse(dxfContent);
  } catch (err: any) {
    throw new Error(`DXF parse error: ${err.message ?? String(err)}`);
  }

  const units = detectUnits(dxf);
  const unitScale = UNIT_TO_METER[units];
  const entities: Entity[] = [];
  const blocks: Record<string, any> = dxf?.blocks || {};
  const rawEntities = dxf?.entities || [];

  for (const raw of rawEntities) {
    const entityType = raw.type?.toUpperCase();

    switch (entityType) {
      case 'LINE':
        if (raw.vertices && raw.vertices.length >= 2) {
          entities.push(convertLine(raw, unitScale, nextId));
        }
        break;

      case 'LWPOLYLINE':
        if (raw.vertices && raw.vertices.length >= 2) {
          entities.push(convertLWPolyline(raw, unitScale, nextId));
        }
        break;

      case 'POLYLINE':
        // Old-style polyline with nested vertices
        if (raw.vertices && raw.vertices.length >= 2) {
          entities.push(convertPolyline(raw, unitScale, nextId));
        }
        break;

      case 'ARC':
        entities.push(convertArc(raw, unitScale, nextId));
        break;

      case 'CIRCLE':
        entities.push(convertCircle(raw, unitScale, nextId));
        break;

      case 'POINT':
        entities.push(convertPoint(raw, unitScale, nextId));
        break;

      case 'SPLINE':
        entities.push(convertSpline(raw, unitScale, nextId));
        break;

      case 'ELLIPSE':
        entities.push(convertEllipse(raw, unitScale, nextId));
        break;

      case 'INSERT':
        entities.push(...convertInsert(raw, unitScale, nextId, blocks));
        break;

      case 'TEXT':
        entities.push(convertText(raw, unitScale, nextId));
        break;

      case 'MTEXT':
        entities.push(convertMText(raw, unitScale, nextId));
        break;

      case 'DIMENSION':
        entities.push(...convertDimension(raw, unitScale, nextId));
        break;

      default:
        // Skip unsupported entity types silently
        break;
    }
  }

  return { entities, units, unitScale };
}

// ============================================================
// Mock CAD Model (for testing)
// ============================================================

/**
 * Create a mock CADModel for testing without a real DXF file.
 * Returns a 10×10 meter square with proper Point entity.
 */
export function createMockCADModel(): CADModel {
  return {
    units: 'm',
    unitScale: 1.0,
    entities: [
      {
        id: 'mock_line_1',
        type: 'Line',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        layer: '0',
      },
      {
        id: 'mock_line_2',
        type: 'Line',
        start: { x: 10, y: 0 },
        end: { x: 10, y: 10 },
        layer: '0',
      },
      {
        id: 'mock_line_3',
        type: 'Line',
        start: { x: 10, y: 10 },
        end: { x: 0, y: 10 },
        layer: '0',
      },
      {
        id: 'mock_line_4',
        type: 'Line',
        start: { x: 0, y: 10 },
        end: { x: 0, y: 0 },
        layer: '0',
      },
    ],
  };
}
