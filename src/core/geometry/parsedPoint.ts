// ============================================================
// ParsedPoint data model — DXF Localization Pipeline
// ============================================================
//
// This file defines the core data types for the DXF localization
// pipeline: parsed point representation, source entity variants,
// solver I/O, and residual types.
//
// Requirements: 7.1, 7.2, 7.3, 7.4, 13.4
// ============================================================

// ── Entity type discriminant ─────────────────────────────────

export type EntityType = 'LWPOLYLINE' | 'LINE' | 'CIRCLE' | 'ARC';

// ── Source entity variants (discriminated union) ─────────────

export type LwPolylineSource = {
  kind: 'LWPOLYLINE';
  vertices: ReadonlyArray<{ x: number; y: number }>;
  closed: boolean;
  vertexIndex: number; // index of THIS parsed point inside the vertex array
};

export type LineSource = {
  kind: 'LINE';
  start: { x: number; y: number };
  end:   { x: number; y: number };
  endpoint: 'start' | 'end';
};

export type CircleSource = {
  kind: 'CIRCLE';
  cx: number;
  cy: number;
  r:  number;
  sampleIndex: number; // 0..35, kept so Phase 2 can reorder if needed
};

export type ArcSource = {
  kind: 'ARC';
  cx: number;
  cy: number;
  r:  number;
  startAngleDeg: number; // raw DXF values, not normalized
  endAngleDeg:   number;
  sampleIndex:   number;
  sampleCount:   number; // ceil(sweep/10)
};

export type SourceEntity =
  | LwPolylineSource
  | LineSource
  | CircleSource
  | ArcSource;

// ── ParsedPoint — flat, ordered record for every sampled point ─

export interface ParsedPoint {
  id: string;                 // unique within a ParsedPointSet; format "p_<counter>"
  lineCode: string;           // DXF group code 8 (layer name)
  controlCode: string;        // "" or "CLS" (last vertex of a closed LWPOLYLINE)
  sourceX: number;            // DXF-local X (no unit conversion in Phase 1)
  sourceY: number;            // DXF-local Y
  entityType: EntityType;
  layer: string;              // same value as lineCode; kept for schema completeness
  targetLat: number | null;   // null until operator assigns or transform is applied
  targetLon: number | null;   // null until operator assigns or transform is applied
  isControlPoint: boolean;    // true when operator has submitted a valid (lat, lon)
  isTransformed: boolean;     // true after applyTransformToPointSet succeeds
  isTessellated: boolean;     // true for CIRCLE/ARC samples; false for LWPOLYLINE/LINE
  sourceEntity: SourceEntity; // shape matches entityType (kind === entityType invariant)
}

export type ParsedPointSet = ReadonlyArray<ParsedPoint>;

// ── Solver I/O types ─────────────────────────────────────────

export interface ControlPointInput {
  id: string;
  sourceX: number;
  sourceY: number;
  targetLat: number;
  targetLon: number;
}

/** Four-parameter similarity transform solved in ENU meters */
export interface SimilarityParams {
  a:  number; // s * cos(theta)
  b:  number; // s * sin(theta)
  tx: number; // east translation in meters
  ty: number; // north translation in meters
}

export interface ResidualEntry {
  controlPointId: string;
  eastMeters: number;   // predicted east in ENU
  northMeters: number;  // predicted north in ENU
  errorMeters: number;  // euclidean residual in ENU
}

export interface SolveResult {
  ok: true;
  params: SimilarityParams;
  residuals: ResidualEntry[];
  rmsMeters: number;
  enuOrigin: { lat: number; lon: number }; // geoPoints[0]
}

export interface SolveFailure {
  ok: false;
  reason:
    | 'INSUFFICIENT_CONTROL_POINTS'
    | 'SINGULAR_NORMAL_MATRIX'
    | 'NON_FINITE_INPUT';
  message?: string;
}

export type SolveOutcome = SolveResult | SolveFailure;
