// ============================================================
// CAD Dimension Types - Smart Dimension Annotations
// ============================================================
//
// Types for dimension detection, annotation, and editing
// in SolidWorks-style smart dimension system.

import { WorldPoint } from '../../../core/cad';

/**
 * Dimension types supported by the CAD system
 */
export type DimensionType =
  | 'linear'        // Distance between 2 points
  | 'horizontal'    // Horizontal distance (X-axis)
  | 'vertical'      // Vertical distance (Y-axis)
  | 'angular'       // Angle between 2 lines
  | 'radial'        // Circle/arc radius
  | 'diameter'      // Circle diameter
  | 'arc-length'    // Length along arc
  | 'coordinate';   // X/Y position of point

/**
 * Dimension annotation shown on canvas
 */
export interface DimensionAnnotation {
  /** Unique identifier for this dimension */
  id: string;

  /** Type of dimension */
  type: DimensionType;

  /** Points defining this dimension */
  points: WorldPoint[];

  /** Current dimension value */
  value: number;

  /** Unit of measurement */
  unit: string;

  /** Display text shown to user */
  label: string;

  /** Position where dimension label should be shown */
  labelPosition: WorldPoint;

  /** Whether this dimension can be edited */
  editable: boolean;

  /** Color for dimension rendering */
  color: string;

  /** Width of dimension lines */
  strokeWidth: number;

  /** Additional data for specific dimension types */
  metadata?: {
    /** For angular dimensions: angle in degrees */
    angle?: number;

    /** For radial dimensions: radius */
    radius?: number;

    /** For coordinate dimensions: axis ('x' or 'y') */
    axis?: 'x' | 'y';

    /** Entity IDs involved in this dimension */
    entityIds?: string[];

    /** Point IDs involved in this dimension */
    pointIds?: string[];
  };
}

/**
 * Dimension rendering style
 */
export interface DimensionStyle {
  /** Dimension line color */
  lineColor: string;

  /** Text color */
  textColor: string;

  /** Background color for text */
  textBackgroundColor: string;

  /** Font size for dimension text */
  fontSize: number;

  /** Arrow size */
  arrowSize: number;

  /** Extension line offset from geometry */
  extensionOffset: number;

  /** Dimension line offset from geometry */
  dimensionOffset: number;
}

/**
 * Default dimension styles
 */
export const DEFAULT_DIMENSION_STYLE: DimensionStyle = {
  lineColor: '#3B82F6',
  textColor: '#E5F1FF',
  textBackgroundColor: 'rgba(7, 17, 27, 0.85)',
  fontSize: 12,
  arrowSize: 8,
  extensionOffset: 15,
  dimensionOffset: 20,
};