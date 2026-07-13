// ============================================================
// Core geometry types for the CAD Georeferencing Engine
// ============================================================

/** 2D point in CAD local coordinate space */
export type Point2D = {
  x: number;
  y: number;
};

/** Geographic point (latitude, longitude, optional altitude) */
export type GeoPoint = {
  lat: number;
  lon: number;
  alt?: number;
};

/** 2D vector (used for ENU metric space) */
export type Vec2D = {
  x: number;
  y: number;
};

// ============================================================
// CAD Entity Types
// ============================================================

/** Straight line segment */
export type Line = {
  id: string;
  type: 'Line';
  start: Point2D;
  end: Point2D;
  layer?: string;
};

/** Single point marker */
export type PointEntity = {
  id: string;
  type: 'Point';
  position: Point2D;
  layer?: string;
};

/**
 * A segment within a polyline.
 * Each segment can be either a straight line or an arc (from bulge).
 */
export type PolylineSegment =
  | { segmentType: 'Line'; to: Point2D }
  | { segmentType: 'Arc'; center: Point2D; radius: number; startAngle: number; endAngle: number; to: Point2D };

/**
 * Polyline entity — a connected sequence of segments.
 * Supports bulge-generated arcs between vertices.
 */
export type Polyline = {
  id: string;
  type: 'Polyline';
  startPoint: Point2D;           // first vertex
  segments: PolylineSegment[];   // segments between vertices
  closed: boolean;               // whether the polyline loops back to start
  layer?: string;
};

/**
 * Arc entity (standalone, not part of a polyline).
 * Angles are always in radians, CCW from +X axis.
 */
export type Arc = {
  id: string;
  type: 'Arc';
  center: Point2D;
  radius: number;
  startAngle: number; // radians, CCW from +X
  endAngle: number;   // radians, CCW from +X (may be < startAngle if wrapping)
  layer?: string;
};

/** Text entity — from TEXT, MTEXT, or DIMENSION measurement text */
export type TextEntity = {
  id: string;
  type: 'Text';
  position: Point2D;
  text: string;
  height: number;   // text height in drawing units (scaled by unitScale)
  rotation: number;  // radians, CCW from +X
  layer?: string;
};

/** Union of all CAD entity types */
export type Entity = Line | PointEntity | Polyline | Arc | TextEntity;

// ============================================================
// CAD Model
// ============================================================

/** DXF drawing units — maps to $INSUNITS header variable */
export type CADUnits = 'mm' | 'cm' | 'm' | 'inch' | 'foot' | 'yard' | 'km' | 'mile' | 'microinch' | 'mil' | 'unknown';

/** Scale factor to convert from given unit → meters */
export const UNIT_TO_METER: Record<CADUnits, number> = {
  microinch: 0.0000000254,
  mil:       0.0000254,
  mm:        0.001,
  cm:        0.01,
  inch:      0.0254,
  foot:      0.3048,
  yard:      0.9144,
  m:         1.0,
  km:        1000.0,
  mile:      1609.344,
  unknown:   1.0, // assume 1:1 (drawing units = meters)
};

/** Complete CAD model parsed from a DXF file */
export type CADModel = {
  entities: Entity[];
  units: CADUnits;
  unitScale: number; // multiplier to convert CAD units → meters
};

// ============================================================
// Georeferenced Entity Types
// ============================================================

/** Georeferenced line */
export type GeoLine = {
  id: string;
  type: 'Line';
  localStart: Vec2D;
  localEnd: Vec2D;
  geoStart: GeoPoint;
  geoEnd: GeoPoint;
  layer?: string;
};

/** Georeferenced point */
export type GeoPointEntity = {
  id: string;
  type: 'Point';
  localPosition: Vec2D;
  geoPosition: GeoPoint;
  layer?: string;
};

/** Georeferenced polyline segment */
export type GeoPolylineSegment =
  | { segmentType: 'Line'; toLocal: Vec2D; toGeo: GeoPoint }
  | { segmentType: 'Arc'; centerLocal: Vec2D; centerGeo: GeoPoint; radius: number; startAngle: number; endAngle: number; toLocal: Vec2D; toGeo: GeoPoint };

/** Georeferenced polyline */
export type GeoPolyline = {
  id: string;
  type: 'Polyline';
  startLocal: Vec2D;
  startGeo: GeoPoint;
  segments: GeoPolylineSegment[];
  closed: boolean;
  layer?: string;
};

/** Georeferenced arc */
export type GeoArc = {
  id: string;
  type: 'Arc';
  localCenter: Vec2D;
  geoCenter: GeoPoint;
  radius: number;       // meters
  startAngle: number;
  endAngle: number;
  layer?: string;
};

/** Georeferenced text */
export type GeoTextEntity = {
  id: string;
  type: 'Text';
  localPosition: Vec2D;
  geoPosition: GeoPoint;
  text: string;
  height: number;      // meters
  rotation: number;     // radians
  layer?: string;
};

/** Union of all georeferenced entity types */
export type GeoEntity = GeoLine | GeoPointEntity | GeoPolyline | GeoArc | GeoTextEntity;

// ============================================================
// Pipeline Result
// ============================================================

/** Result of the full georeferencing pipeline */
export type GeorefResult = {
  cadEntities: Entity[];    // original CAD-space entities (normalized)
  localEntities: Entity[];  // entities in local metric space (meters)
  geoEntities: GeoEntity[]; // entities in real-world lat/lon
};

/** Alignment configuration provided by the user */
export type AlignmentConfig = {
  cadA: Point2D;
  cadB: Point2D;
  geoA: GeoPoint;
  geoB: GeoPoint;
};
