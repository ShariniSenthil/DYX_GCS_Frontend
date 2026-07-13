// ============================================================
// CAD Selection Types - Smart Dimension Editing
// ============================================================
//
// Types for enhanced selection system supporting point-pair
// selection and cross-entity dimension editing.

import { WorldPoint } from '../../../core/cad';

/**
 * Point selection context - where a selected point comes from
 */
export interface SelectedPoint {
  /** Entity this point belongs to */
  entityId: string;

  /** Type of point being selected */
  pointType:
    | 'vertex'      // Polyline/rectangle vertex
    | 'center'      // Circle/arc center
    | 'endpoint'    // Line start/end
    | 'midpoint'    // Line/edge midpoint
    | 'custom';     // User-defined point

  /** World position of the point */
  position: WorldPoint;

  /** Index for ordered points (polyline vertices) */
  pointIndex?: number;

  /** Unique identifier for this point */
  pointId: string;
}

/**
 * Selection modes supported by the CAD system
 */
export type SelectionMode =
  | 'entity'        // Select entire entities (current behavior)
  | 'point'         // Select individual points/vertices
  | 'point-pair'    // Select 2 points to measure/edit distance
  | 'multi-entity'; // Select multiple entities simultaneously

/**
 * Complete selection state for the CAD canvas
 */
export interface SelectionState {
  /** Current selection mode */
  mode: SelectionMode;

  /** Selected entity IDs */
  selectedEntities: Set<string>;

  /** Selected points with their context */
  selectedPoints: SelectedPoint[];

  /** Maximum points allowed in current selection (2 for point-pair mode) */
  maxPoints?: number;

  /** Whether selection is complete (ready for dimension detection) */
  isComplete: boolean;
}

/**
 * Visual feedback for point selection
 */
export interface PointMarker {
  pointId: string;
  position: WorldPoint;
  isSelected: boolean;
  isHovered: boolean;
  markerType: 'vertex' | 'center' | 'endpoint' | 'midpoint';
  size: number;
  color: string;
}