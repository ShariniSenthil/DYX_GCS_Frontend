// ============================================================
// CAD Dimension Detection Utilities
// ============================================================
//
// Analyze selected geometry and detect relevant dimensions
// for smart dimension editing system.

import { CADEntity, WorldPoint, angleDeg, distance } from '../core/cad';
import { SelectedPoint } from '../components/cad/types/selection';
import {
  DimensionAnnotation,
  DimensionType,
  DEFAULT_DIMENSION_STYLE,
} from '../components/cad/types/dimension';

/**
 * Calculate distance between two points
 */
function calculateDistance(p1: WorldPoint, p2: WorldPoint): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculate angle between two points (in degrees)
 */
function calculateAngle(p1: WorldPoint, p2: WorldPoint): number {
  return angleDeg(p1, p2);
}

/**
 * Generate unique dimension ID
 */
function generateDimensionId(type: DimensionType, points: WorldPoint[]): string {
  const pointStr = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  return `${type}-${pointStr}`;
}

/**
 * Create dimension annotation for distance between two points
 */
function createLinearDimension(
  point1: SelectedPoint,
  point2: SelectedPoint,
  dimensionType: 'linear' | 'horizontal' | 'vertical'
): DimensionAnnotation {
  const p1 = point1.position;
  const p2 = point2.position;

  let value: number;
  let labelPosition: WorldPoint;
  const unit = 'm';

  if (dimensionType === 'horizontal') {
    value = Math.abs(p2.x - p1.x);
    labelPosition = {
      x: (p1.x + p2.x) / 2,
      y: Math.min(p1.y, p2.y) - DEFAULT_DIMENSION_STYLE.dimensionOffset,
    };
  } else if (dimensionType === 'vertical') {
    value = Math.abs(p2.y - p1.y);
    labelPosition = {
      x: Math.max(p1.x, p2.x) + DEFAULT_DIMENSION_STYLE.dimensionOffset,
      y: (p1.y + p2.y) / 2,
    };
  } else {
    value = calculateDistance(p1, p2);
    labelPosition = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2 - DEFAULT_DIMENSION_STYLE.dimensionOffset,
    };
  }

  return {
    id: generateDimensionId(dimensionType, [p1, p2]),
    type: dimensionType,
    points: [p1, p2],
    value,
    unit,
    label: `${value.toFixed(3)} ${unit}`,
    labelPosition,
    editable: true,
    color: DEFAULT_DIMENSION_STYLE.lineColor,
    strokeWidth: 1.5,
    metadata: {
      entityIds: [point1.entityId, point2.entityId].filter((id, i, arr) => arr.indexOf(id) === i),
      pointIds: [point1.pointId, point2.pointId],
    },
  };
}

/**
 * Detect dimensions for point-pair selection
 */
export function detectPointPairDimensions(
  point1: SelectedPoint,
  point2: SelectedPoint
): DimensionAnnotation[] {
  const dimensions: DimensionAnnotation[] = [];
  const p1 = point1.position;
  const p2 = point2.position;

  // Calculate basic distances
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const diagonal = calculateDistance(p1, p2);

  // Determine if points are primarily horizontal or vertical aligned
  const isHorizontal = dx > dy * 2;
  const isVertical = dy > dx * 2;

  if (isHorizontal) {
    // Show horizontal dimension
    dimensions.push(createLinearDimension(point1, point2, 'horizontal'));
  } else if (isVertical) {
    // Show vertical dimension
    dimensions.push(createLinearDimension(point1, point2, 'vertical'));
  } else {
    // Show diagonal dimension and components
    dimensions.push(createLinearDimension(point1, point2, 'linear'));

    // Also show horizontal and vertical components if significant
    if (dx > 0.01) {
      const hDim = createLinearDimension(point1, point2, 'horizontal');
      hDim.labelPosition = {
        x: (p1.x + p2.x) / 2,
        y: Math.min(p1.y, p2.y) - DEFAULT_DIMENSION_STYLE.dimensionOffset * 1.5,
      };
      dimensions.push(hDim);
    }

    if (dy > 0.01) {
      const vDim = createLinearDimension(point1, point2, 'vertical');
      vDim.labelPosition = {
        x: Math.max(p1.x, p2.x) + DEFAULT_DIMENSION_STYLE.dimensionOffset * 1.5,
        y: (p1.y + p2.y) / 2,
      };
      dimensions.push(vDim);
    }
  }

  return dimensions;
}

/**
 * Detect dimensions for single entity selection
 */
export function detectEntityDimensions(entity: CADEntity): DimensionAnnotation[] {
  const dimensions: DimensionAnnotation[] = [];

  switch (entity.type) {
    case 'Line': {
      // Line dimensions: length and angle
      const length = calculateDistance(entity.start, entity.end);
      const midX = (entity.start.x + entity.end.x) / 2;
      const midY = (entity.start.y + entity.end.y) / 2;

      // Length dimension
      dimensions.push({
        id: generateDimensionId('linear', [entity.start, entity.end]),
        type: 'linear',
        points: [entity.start, entity.end],
        value: length,
        unit: 'm',
        label: `${length.toFixed(3)} m`,
        labelPosition: {
          x: midX,
          y: midY - DEFAULT_DIMENSION_STYLE.dimensionOffset,
        },
        editable: true,
        color: DEFAULT_DIMENSION_STYLE.lineColor,
        strokeWidth: 1.5,
        metadata: { entityIds: [entity.id] },
      });

      // Angle dimension
      const angle = calculateAngle(entity.start, entity.end);
      dimensions.push({
        id: generateDimensionId('angular', [entity.start, entity.end]),
        type: 'angular',
        points: [entity.start, entity.end],
        value: angle,
        unit: 'deg',
        label: `${angle.toFixed(1)}°`,
        labelPosition: {
          x: midX + DEFAULT_DIMENSION_STYLE.dimensionOffset,
          y: midY + DEFAULT_DIMENSION_STYLE.dimensionOffset,
        },
        editable: true,
        color: '#F59E0B',
        strokeWidth: 1.5,
        metadata: {
          angle,
          entityIds: [entity.id],
        },
      });
      break;
    }

    case 'Circle': {
      // Circle dimensions: radius and diameter
      const labelPos = {
        x: entity.center.x + entity.radius * 0.7,
        y: entity.center.y - entity.radius * 0.7,
      };

      // Radius dimension
      dimensions.push({
        id: generateDimensionId('radial', [entity.center]),
        type: 'radial',
        points: [entity.center],
        value: entity.radius,
        unit: 'm',
        label: `R: ${entity.radius.toFixed(3)} m`,
        labelPosition: labelPos,
        editable: true,
        color: '#EF4444',
        strokeWidth: 1.5,
        metadata: {
          radius: entity.radius,
          entityIds: [entity.id],
        },
      });

      // Diameter dimension
      const diamLabelPos = {
        x: entity.center.x,
        y: entity.center.y + entity.radius + DEFAULT_DIMENSION_STYLE.dimensionOffset,
      };
      dimensions.push({
        id: generateDimensionId('diameter', [entity.center]),
        type: 'diameter',
        points: [entity.center],
        value: entity.radius * 2,
        unit: 'm',
        label: `Ø: ${(entity.radius * 2).toFixed(3)} m`,
        labelPosition: diamLabelPos,
        editable: true,
        color: '#EF4444',
        strokeWidth: 1.5,
        metadata: {
          radius: entity.radius,
          entityIds: [entity.id],
        },
      });
      break;
    }

    case 'Rectangle': {
      // Rectangle dimensions: width, height, diagonal
      const width = Math.abs(entity.corner2.x - entity.corner1.x);
      const height = Math.abs(entity.corner2.y - entity.corner1.y);
      const centerX = (entity.corner1.x + entity.corner2.x) / 2;
      const centerY = (entity.corner1.y + entity.corner2.y) / 2;

      // Width dimension
      dimensions.push({
        id: generateDimensionId('horizontal', [entity.corner1, entity.corner2]),
        type: 'horizontal',
        points: [entity.corner1, entity.corner2],
        value: width,
        unit: 'm',
        label: `${width.toFixed(3)} m`,
        labelPosition: {
          x: centerX,
          y: Math.min(entity.corner1.y, entity.corner2.y) - DEFAULT_DIMENSION_STYLE.dimensionOffset,
        },
        editable: true,
        color: '#22C55E',
        strokeWidth: 1.5,
        metadata: { entityIds: [entity.id] },
      });

      // Height dimension
      dimensions.push({
        id: generateDimensionId('vertical', [entity.corner1, entity.corner2]),
        type: 'vertical',
        points: [entity.corner1, entity.corner2],
        value: height,
        unit: 'm',
        label: `${height.toFixed(3)} m`,
        labelPosition: {
          x: Math.max(entity.corner1.x, entity.corner2.x) + DEFAULT_DIMENSION_STYLE.dimensionOffset,
          y: centerY,
        },
        editable: true,
        color: '#22C55E',
        strokeWidth: 1.5,
        metadata: { entityIds: [entity.id] },
      });

      // Diagonal dimension
      const diagonal = calculateDistance(entity.corner1, entity.corner2);
      dimensions.push({
        id: generateDimensionId('linear', [entity.corner1, entity.corner2]),
        type: 'linear',
        points: [entity.corner1, entity.corner2],
        value: diagonal,
        unit: 'm',
        label: `${diagonal.toFixed(3)} m`,
        labelPosition: {
          x: centerX,
          y: centerY,
        },
        editable: true,
        color: '#A855F7',
        strokeWidth: 1.5,
        metadata: { entityIds: [entity.id] },
      });
      break;
    }

    case 'Arc': {
      // Arc dimensions: radius, start angle, end angle
      const startPt = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
      };
      const endPt = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
      };

      // Radius dimension
      dimensions.push({
        id: generateDimensionId('radial', [entity.center]),
        type: 'radial',
        points: [entity.center],
        value: entity.radius,
        unit: 'm',
        label: `R: ${entity.radius.toFixed(3)} m`,
        labelPosition: {
          x: entity.center.x + entity.radius * 0.7,
          y: entity.center.y - entity.radius * 0.7,
        },
        editable: true,
        color: '#EF4444',
        strokeWidth: 1.5,
        metadata: {
          radius: entity.radius,
          entityIds: [entity.id],
        },
      });

      // Arc length dimension (optional, could be calculated)
      const angleSpan = ((entity.endAngle - entity.startAngle + 2 * Math.PI) % (2 * Math.PI));
      const arcLength = entity.radius * angleSpan;

      dimensions.push({
        id: generateDimensionId('arc-length', [startPt, endPt]),
        type: 'arc-length',
        points: [startPt, endPt],
        value: arcLength,
        unit: 'm',
        label: `Arc: ${arcLength.toFixed(3)} m`,
        labelPosition: {
          x: entity.center.x,
          y: entity.center.y - entity.radius - DEFAULT_DIMENSION_STYLE.dimensionOffset,
        },
        editable: true,
        color: '#F59E0B',
        strokeWidth: 1.5,
        metadata: { entityIds: [entity.id] },
      });
      break;
    }

    case 'Polyline': {
      // Polyline dimensions: total length, individual segments
      let totalLength = 0;
      for (let i = 0; i < entity.vertices.length - 1; i++) {
        totalLength += calculateDistance(entity.vertices[i], entity.vertices[i + 1]);
      }

      if (entity.vertices.length > 1) {
        const start = entity.vertices[0];
        const end = entity.vertices[entity.vertices.length - 1];
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        // Total length dimension
        dimensions.push({
          id: generateDimensionId('linear', entity.vertices),
          type: 'linear',
          points: entity.vertices,
          value: totalLength,
          unit: 'm',
          label: `Length: ${totalLength.toFixed(3)} m`,
          labelPosition: {
            x: midX,
            y: midY - DEFAULT_DIMENSION_STYLE.dimensionOffset,
          },
          editable: true,
          color: '#22C55E',
          strokeWidth: 1.5,
          metadata: { entityIds: [entity.id] },
        });
      }
      break;
    }

    case 'Point': {
      // Point dimensions: coordinates
      dimensions.push({
        id: generateDimensionId('coordinate', [entity.position]),
        type: 'coordinate',
        points: [entity.position],
        value: entity.position.x,
        unit: 'm',
        label: `X: ${entity.position.x.toFixed(3)} m`,
        labelPosition: {
          x: entity.position.x,
          y: entity.position.y - DEFAULT_DIMENSION_STYLE.dimensionOffset,
        },
        editable: true,
        color: '#A855F7',
        strokeWidth: 1.5,
        metadata: {
          axis: 'x',
          entityIds: [entity.id],
        },
      });

      dimensions.push({
        id: generateDimensionId('coordinate', [entity.position]),
        type: 'coordinate',
        points: [entity.position],
        value: entity.position.y,
        unit: 'm',
        label: `Y: ${entity.position.y.toFixed(3)} m`,
        labelPosition: {
          x: entity.position.x + DEFAULT_DIMENSION_STYLE.dimensionOffset * 2,
          y: entity.position.y,
        },
        editable: true,
        color: '#A855F7',
        strokeWidth: 1.5,
        metadata: {
          axis: 'y',
          entityIds: [entity.id],
        },
      });
      break;
    }

    default:
      break;
  }

  return dimensions;
}

/**
 * Detect dimensions for current selection state
 */
export function detectDimensionsForSelection(
  selectedPoints: SelectedPoint[],
  selectedEntityIds: Set<string>,
  entities: CADEntity[]
): DimensionAnnotation[] {
  const dimensions: DimensionAnnotation[] = [];

  // Point-pair selection: show dimensions between the 2 points
  if (selectedPoints.length === 2) {
    const pointPairDims = detectPointPairDimensions(selectedPoints[0], selectedPoints[1]);
    dimensions.push(...pointPairDims);
  }

  // Entity selection: show dimensions for each selected entity
  selectedEntityIds.forEach(entityId => {
    const entity = entities.find(e => e.id === entityId);
    if (entity) {
      const entityDims = detectEntityDimensions(entity);
      dimensions.push(...entityDims);
    }
  });

  return dimensions;
}