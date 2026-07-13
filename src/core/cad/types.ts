// ============================================================
// CAD Engine Types — DXF-compatible entity model
// ============================================================
//
// All entities store TRUE geometric definitions in world coordinates
// (metres by default). These types map 1:1 to DXF entity semantics,
// enabling lossless DXF serialization.
//
// This module has ZERO React Native dependencies — pure types only.

import { Point2D } from '../geometry/types';

// Re-export for convenience
export type { Point2D } from '../geometry/types';

/** World point: a position in CAD coordinate space (world units, not pixels) */
export type WorldPoint = Point2D;

/** Screen point: a pixel position on the device display */
export interface ScreenPoint {
  x: number;
  y: number;
}

// ============================================================
// Viewport — maps world coordinates to/from screen pixels
// ============================================================

export interface Viewport {
  /** Pixels per world unit (zoom level) */
  scale: number;
  /** Screen-pixel X offset of world origin (0,0) */
  offsetX: number;
  /** Screen-pixel Y offset of world origin (0,0) */
  offsetY: number;
}

/** Canvas dimensions in screen pixels */
export interface CanvasSize {
  width: number;
  height: number;
}

// ============================================================
// Drawing Units
// ============================================================

export type UnitSystem = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export const UNIT_LABEL: Record<UnitSystem, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
};

export const UNIT_TO_METRES: Record<UnitSystem, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1.0,
  in: 0.0254,
  ft: 0.3048,
};

// ============================================================
// DXF-Compatible Entity Model
// ============================================================

export type CADLayer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
};

export type CADEntity =
  | { type: 'Line'; id: string; layer: string; start: WorldPoint; end: WorldPoint }
  | { type: 'Circle'; id: string; layer: string; center: WorldPoint; radius: number }
  | { type: 'Arc'; id: string; layer: string; center: WorldPoint; radius: number; startAngle: number; endAngle: number }
  | { type: 'Polyline'; id: string; layer: string; vertices: WorldPoint[]; closed: boolean; bulges: number[] }
  | { type: 'Rectangle'; id: string; layer: string; corner1: WorldPoint; corner2: WorldPoint }
  | { type: 'Point'; id: string; layer: string; position: WorldPoint }
  | { type: 'Text'; id: string; layer: string; position: WorldPoint; content: string; height: number; rotation: number }
  | { type: 'Dimension'; id: string; layer: string; p1: WorldPoint; p2: WorldPoint; offset: number; text: string };

/** Entity type discriminator union */
export type EntityType = CADEntity['type'];

// ============================================================
// Tools
// ============================================================

export type CADTool =
  | 'select'
  | 'line'
  | 'polyline'
  | 'circle'
  | 'arc'
  | 'rectangle'
  | 'polygon'
  | 'point'
  | 'text'
  | 'dimension';

/** Sub-methods for tools that have multiple creation modes */
export type CircleMethod = 'center-radius' | 'center-diameter' | '2-point' | '3-point';
export type ArcMethod = '3-point' | 'start-center-end' | 'start-end-radius';

// ============================================================
// Snapping
// ============================================================

/**
 * Object-snap modes (AutoCAD OSNAP subset for 2D drafting).
 * Full AutoCAD also has: Geometric Center, Extension, Insertion,
 * Tangent, Apparent Intersection, Parallel — deferred for mobile CAD.
 */
export type SnapMode =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'intersection'
  | 'quadrant'
  | 'perpendicular'
  | 'nearest'
  | 'node'
  | 'grid';

export interface SnapResult {
  point: WorldPoint;
  mode: SnapMode;
  entityId?: string;
}

// ============================================================
// Drafting Settings
// ============================================================

export interface DraftingSettings {
  grid: {
    enabled: boolean;
    spacing: number;
    majorEveryN: number;
  };
  snap: {
    enabled: boolean;
    aperturePx: number;
    runningSnaps: Set<SnapMode>;
  };
  polar: {
    enabled: boolean;
    angles: number[];
    toleranceDeg: number;
  };
  ortho: {
    enabled: boolean;
  };
  units: UnitSystem;
  dynamicInput: {
    enabled: boolean;
  };
}

export const DEFAULT_DRAFTING_SETTINGS: DraftingSettings = {
  grid: {
    enabled: true,
    spacing: 1,
    majorEveryN: 10,
  },
  snap: {
    enabled: true,
    aperturePx: 12,
    // AutoCAD-like defaults: precise modes on, nearest off (too sticky)
    runningSnaps: new Set<SnapMode>([
      'endpoint', 'midpoint', 'center', 'intersection', 'node', 'quadrant', 'perpendicular',
    ]),
  },
  polar: {
    enabled: true,
    angles: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
    toleranceDeg: 5,
  },
  ortho: {
    enabled: false,
  },
  units: 'm',
  dynamicInput: {
    enabled: true,
  },
};

// ============================================================
// Default Layers
// ============================================================

export const DEFAULT_LAYERS: CADLayer[] = [
  { id: 'layer-0', name: '0', color: '#22C55E', visible: true, locked: false },
  { id: 'layer-mark', name: 'MARK', color: '#3B82F6', visible: true, locked: false },
  { id: 'layer-transit', name: 'TRANSIT', color: '#F59E0B', visible: true, locked: false },
  { id: 'layer-boundary', name: 'BOUNDARY', color: '#EF4444', visible: true, locked: false },
  { id: 'layer-text', name: 'TEXT', color: '#A855F7', visible: true, locked: false },
  { id: 'layer-dim', name: 'DIMENSIONS', color: '#6B7280', visible: true, locked: false },
];
