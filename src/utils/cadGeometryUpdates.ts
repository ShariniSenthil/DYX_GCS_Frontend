// ============================================================
// CAD Geometry Update Utilities
// ============================================================
//
// Update entity geometry based on dimension changes while
// maintaining anchor points and constraints.

import { CADEntity, WorldPoint } from '../core/cad';
import { DimensionAnnotation } from '../components/cad/types/dimension';
import { SelectedPoint } from '../components/cad/types/selection';

const POINT_EPSILON = 1e-4;

type LineEntity = Extract<CADEntity, { type: 'Line' }>;
type CircleEntity = Extract<CADEntity, { type: 'Circle' }>;
type RectangleEntity = Extract<CADEntity, { type: 'Rectangle' }>;
type ArcEntity = Extract<CADEntity, { type: 'Arc' }>;
type PointEntity = Extract<CADEntity, { type: 'Point' }>;
type PolylineEntity = Extract<CADEntity, { type: 'Polyline' }>;

/**
 * Update line geometry based on dimension change
 */
function updateLineByDimension(
  line: LineEntity,
  newValue: number,
  dimensionType: 'linear' | 'horizontal' | 'vertical' | 'angular',
  anchorPointIndex: 0 | 1 = 0
): CADEntity {
  const anchor = anchorPointIndex === 0 ? line.start : line.end;
  const moving = anchorPointIndex === 0 ? line.end : line.start;

  if (dimensionType === 'linear') {
    // Update length while keeping anchor fixed
    const currentLength = Math.hypot(moving.x - anchor.x, moving.y - anchor.y);
    const scale = newValue / currentLength;

    const newMoving: WorldPoint = {
      x: anchor.x + (moving.x - anchor.x) * scale,
      y: anchor.y + (moving.y - anchor.y) * scale,
    };

    return {
      ...line,
      start: anchorPointIndex === 0 ? anchor : newMoving,
      end: anchorPointIndex === 0 ? newMoving : anchor,
    };
  }

  if (dimensionType === 'horizontal') {
    // Update horizontal distance
    const dx = moving.x - anchor.x;
    const newDx = dx >= 0 ? newValue : -newValue;

    return {
      ...line,
      start: anchorPointIndex === 0 ? anchor : { x: anchor.x + newDx, y: moving.y },
      end: anchorPointIndex === 0 ? { x: anchor.x + newDx, y: moving.y } : anchor,
    };
  }

  if (dimensionType === 'vertical') {
    // Update vertical distance
    const dy = moving.y - anchor.y;
    const newDy = dy >= 0 ? newValue : -newValue;

    return {
      ...line,
      start: anchorPointIndex === 0 ? anchor : { x: moving.x, y: anchor.y + newDy },
      end: anchorPointIndex === 0 ? { x: moving.x, y: anchor.y + newDy } : anchor,
    };
  }

  return line;
}

/**
 * Update circle geometry based on dimension change
 */
function updateCircleByDimension(
  circle: CircleEntity,
  newValue: number,
  dimensionType: 'radial' | 'diameter'
): CADEntity {
  const newRadius = dimensionType === 'radial' ? newValue : newValue / 2;

  return {
    ...circle,
    radius: newRadius,
  };
}

/**
 * Update rectangle geometry based on dimension change
 */
function updateRectangleByDimension(
  rect: RectangleEntity,
  newValue: number,
  dimensionType: 'horizontal' | 'vertical' | 'linear',
  anchorCorner: 'top-left' | 'bottom-right' | 'center' = 'top-left'
): CADEntity {
  if (dimensionType === 'horizontal') {
    // Update width
    const currentWidth = Math.abs(rect.corner2.x - rect.corner1.x);
    const widthChange = newValue - currentWidth;

    if (anchorCorner === 'top-left' || anchorCorner === 'bottom-right') {
      // Keep corner1 fixed, move corner2
      const newCorner2 = {
        x: rect.corner1.x + (rect.corner2.x >= rect.corner1.x ? newValue : -newValue),
        y: rect.corner2.y,
      };
      return { ...rect, corner2: newCorner2 };
    } else {
      // Keep center fixed, expand both sides
      const halfWidth = newValue / 2;
      const centerX = (rect.corner1.x + rect.corner2.x) / 2;
      const newCorner1 = { x: centerX - halfWidth, y: rect.corner1.y };
      const newCorner2 = { x: centerX + halfWidth, y: rect.corner2.y };
      return { ...rect, corner1: newCorner1, corner2: newCorner2 };
    }
  }

  if (dimensionType === 'vertical') {
    // Update height
    const currentHeight = Math.abs(rect.corner2.y - rect.corner1.y);

    if (anchorCorner === 'top-left' || anchorCorner === 'bottom-right') {
      // Keep corner1 fixed, move corner2
      const newCorner2 = {
        x: rect.corner2.x,
        y: rect.corner1.y + (rect.corner2.y >= rect.corner1.y ? newValue : -newValue),
      };
      return { ...rect, corner2: newCorner2 };
    } else {
      // Keep center fixed, expand both sides
      const halfHeight = newValue / 2;
      const centerY = (rect.corner1.y + rect.corner2.y) / 2;
      const newCorner1 = { x: rect.corner1.x, y: centerY - halfHeight };
      const newCorner2 = { x: rect.corner2.x, y: centerY + halfHeight };
      return { ...rect, corner1: newCorner1, corner2: newCorner2 };
    }
  }

  if (dimensionType === 'linear') {
    // Update diagonal distance (maintain aspect ratio)
    const currentDiagonal = Math.hypot(
      rect.corner2.x - rect.corner1.x,
      rect.corner2.y - rect.corner1.y
    );
    const scale = newValue / currentDiagonal;

    if (anchorCorner === 'top-left') {
      // Keep corner1 fixed, scale corner2
      const newCorner2 = {
        x: rect.corner1.x + (rect.corner2.x - rect.corner1.x) * scale,
        y: rect.corner1.y + (rect.corner2.y - rect.corner1.y) * scale,
      };
      return { ...rect, corner2: newCorner2 };
    } else {
      // Keep center fixed, scale both corners
      const centerX = (rect.corner1.x + rect.corner2.x) / 2;
      const centerY = (rect.corner1.y + rect.corner2.y) / 2;
      const halfWidth = (Math.abs(rect.corner2.x - rect.corner1.x) * scale) / 2;
      const halfHeight = (Math.abs(rect.corner2.y - rect.corner1.y) * scale) / 2;

      const newCorner1 = { x: centerX - halfWidth, y: centerY - halfHeight };
      const newCorner2 = { x: centerX + halfWidth, y: centerY + halfHeight };
      return { ...rect, corner1: newCorner1, corner2: newCorner2 };
    }
  }

  return rect;
}

/**
 * Update arc geometry based on dimension change
 */
function updateArcByDimension(
  arc: ArcEntity,
  newValue: number,
  dimensionType: 'radial' | 'arc-length'
): CADEntity {
  if (dimensionType === 'radial') {
    return { ...arc, radius: newValue };
  }

  if (dimensionType === 'arc-length') {
    // Update arc length by changing angle span
    const currentAngleSpan = ((arc.endAngle - arc.startAngle + 2 * Math.PI) % (2 * Math.PI));
    const newAngleSpan = newValue / arc.radius;

    // Keep start angle fixed, update end angle
    return {
      ...arc,
      endAngle: arc.startAngle + newAngleSpan,
    };
  }

  return arc;
}

/**
 * Update point position based on dimension change
 */
function updatePointByDimension(
  point: PointEntity,
  newValue: number,
  axis: 'x' | 'y'
): CADEntity {
  if (axis === 'x') {
    return { ...point, position: { ...point.position, x: newValue } };
  } else {
    return { ...point, position: { ...point.position, y: newValue } };
  }
}

/**
 * Update polyline vertex position based on dimension change
 */
function updatePolylineByDimension(
  polyline: PolylineEntity,
  newValue: number,
  vertexIndex: number,
  dimensionType: 'horizontal' | 'vertical'
): CADEntity {
  if (vertexIndex < 0 || vertexIndex >= polyline.vertices.length) {
    return polyline;
  }

  const newVertices = [...polyline.vertices];
  if (dimensionType === 'horizontal') {
    newVertices[vertexIndex] = { ...newVertices[vertexIndex], x: newValue };
  } else {
    newVertices[vertexIndex] = { ...newVertices[vertexIndex], y: newValue };
  }

  return { ...polyline, vertices: newVertices };
}

/**
 * Main function to update entity geometry based on dimension change
 */
export function updateEntityByDimension(
  entity: CADEntity,
  dimension: DimensionAnnotation,
  newValue: number
): CADEntity {
  switch (entity.type) {
    case 'Line':
      if (dimension.type === 'angular') {
        // Update line angle - more complex, for MVP keep length fixed
        return entity; // TODO: Implement angular update
      }
      if (
        dimension.type === 'linear'
        || dimension.type === 'horizontal'
        || dimension.type === 'vertical'
      ) {
        return updateLineByDimension(entity, newValue, dimension.type, 0);
      }
      return entity;

    case 'Circle':
      if (dimension.type === 'radial' || dimension.type === 'diameter') {
        return updateCircleByDimension(entity, newValue, dimension.type);
      }
      return entity;

    case 'Rectangle':
      if (
        dimension.type === 'horizontal'
        || dimension.type === 'vertical'
        || dimension.type === 'linear'
      ) {
        return updateRectangleByDimension(entity, newValue, dimension.type, 'top-left');
      }
      return entity;

    case 'Arc':
      if (dimension.type === 'radial' || dimension.type === 'arc-length') {
        return updateArcByDimension(entity, newValue, dimension.type);
      }
      return entity;

    case 'Point':
      if (dimension.type === 'coordinate') {
        return updatePointByDimension(entity, newValue, dimension.metadata?.axis || 'x');
      }
      return entity;

    case 'Polyline':
      // For polylines, update the relevant vertex
      if (
        (dimension.type === 'horizontal' || dimension.type === 'vertical')
        && dimension.metadata?.pointIds
        && dimension.metadata.pointIds.length > 0
      ) {
        const pointId = dimension.metadata.pointIds[0];
        const vertexMatch = pointId.match(/-vertex-(\d+)$/);
        if (vertexMatch) {
          const vertexIndex = parseInt(vertexMatch[1], 10);
          return updatePolylineByDimension(entity, newValue, vertexIndex, dimension.type);
        }
      }
      return entity;

    default:
      return entity;
  }
}

function pointsEqual(a: WorldPoint, b: WorldPoint, epsilon = POINT_EPSILON): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

function getEntityKeyPoints(entity: CADEntity): WorldPoint[] {
  switch (entity.type) {
    case 'Line':
      return [entity.start, entity.end];
    case 'Circle':
      return [entity.center];
    case 'Rectangle':
      return [entity.corner1, entity.corner2];
    case 'Arc': {
      const start: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
      };
      const end: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
      };
      return [entity.center, start, end];
    }
    case 'Polyline':
      return entity.vertices;
    case 'Point':
      return [entity.position];
    case 'Text':
      return [entity.position];
    default:
      return [];
  }
}

function getPointDeltas(
  before: CADEntity,
  after: CADEntity
): Array<{ old: WorldPoint; new: WorldPoint }> {
  const beforePts = getEntityKeyPoints(before);
  const afterPts = getEntityKeyPoints(after);
  const deltas: Array<{ old: WorldPoint; new: WorldPoint }> = [];

  for (let i = 0; i < beforePts.length && i < afterPts.length; i++) {
    if (!pointsEqual(beforePts[i], afterPts[i])) {
      deltas.push({ old: beforePts[i], new: afterPts[i] });
    }
  }

  return deltas;
}

/**
 * Move a coincident point on any entity (shared-point / coincident constraint).
 */
function applyPointMoveToEntity(
  entity: CADEntity,
  oldPosition: WorldPoint,
  newPosition: WorldPoint
): CADEntity {
  switch (entity.type) {
    case 'Line':
      if (pointsEqual(entity.start, oldPosition)) {
        return { ...entity, start: newPosition };
      }
      if (pointsEqual(entity.end, oldPosition)) {
        return { ...entity, end: newPosition };
      }
      return entity;

    case 'Circle':
      if (pointsEqual(entity.center, oldPosition)) {
        return { ...entity, center: newPosition };
      }
      return entity;

    case 'Rectangle':
      if (pointsEqual(entity.corner1, oldPosition)) {
        return { ...entity, corner1: newPosition };
      }
      if (pointsEqual(entity.corner2, oldPosition)) {
        return { ...entity, corner2: newPosition };
      }
      return entity;

    case 'Arc': {
      if (pointsEqual(entity.center, oldPosition)) {
        return { ...entity, center: newPosition };
      }
      const start: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
      };
      const end: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
      };
      if (pointsEqual(start, oldPosition)) {
        return {
          ...entity,
          startAngle: Math.atan2(newPosition.y - entity.center.y, newPosition.x - entity.center.x),
        };
      }
      if (pointsEqual(end, oldPosition)) {
        return {
          ...entity,
          endAngle: Math.atan2(newPosition.y - entity.center.y, newPosition.x - entity.center.x),
        };
      }
      return entity;
    }

    case 'Point':
      if (pointsEqual(entity.position, oldPosition)) {
        return { ...entity, position: newPosition };
      }
      return entity;

    case 'Text':
      if (pointsEqual(entity.position, oldPosition)) {
        return { ...entity, position: newPosition };
      }
      return entity;

    case 'Polyline': {
      const vertexIndex = entity.vertices.findIndex(v => pointsEqual(v, oldPosition));
      if (vertexIndex !== -1) {
        const newVertices = [...entity.vertices];
        newVertices[vertexIndex] = newPosition;
        return { ...entity, vertices: newVertices };
      }
      return entity;
    }

    default:
      return entity;
  }
}

/**
 * Propagate moved points to all entities sharing coincident geometry.
 */
export function propagateSharedPointConstraints(
  entities: CADEntity[],
  primaryEntityId: string,
  beforeEntity: CADEntity,
  afterEntity: CADEntity
): CADEntity[] {
  const deltas = getPointDeltas(beforeEntity, afterEntity);
  if (deltas.length === 0) {
    return entities.map(e => (e.id === primaryEntityId ? afterEntity : e));
  }

  let result = entities.map(e => (e.id === primaryEntityId ? afterEntity : e));

  for (const { old, new: newPos } of deltas) {
    result = result.map(entity => {
      if (entity.id === primaryEntityId) {
        return entity;
      }
      return applyPointMoveToEntity(entity, old, newPos);
    });
  }

  return result;
}

/**
 * Update point-pair distance (cross-entity update)
 */
export function updatePointPairDistance(
  entity1: CADEntity,
  point1: WorldPoint,
  entity2: CADEntity,
  point2: WorldPoint,
  newDistance: number,
  anchorEntity: 1 | 2 = 1
): [CADEntity, CADEntity] {
  const currentDistance = Math.hypot(point2.x - point1.x, point2.y - point1.y);
  const scale = newDistance / currentDistance;

  if (anchorEntity === 1) {
    // Keep point1 fixed, move point2
    const newPoint2 = {
      x: point1.x + (point2.x - point1.x) * scale,
      y: point1.y + (point2.y - point1.y) * scale,
    };

    // Update entity2 to reflect new point position
    const updatedEntity2 = applyPointMoveToEntity(entity2, point2, newPoint2);

    return [entity1, updatedEntity2];
  } else {
    // Keep point2 fixed, move point1
    const newPoint1 = {
      x: point2.x + (point1.x - point2.x) * scale,
      y: point2.y + (point1.y - point2.y) * scale,
    };

    // Update entity1 to reflect new point position
    const updatedEntity1 = applyPointMoveToEntity(entity1, point1, newPoint1);

    return [updatedEntity1, entity2];
  }
}

function updatePointPairByDimension(
  entity1: CADEntity,
  point1: WorldPoint,
  entity2: CADEntity,
  point2: WorldPoint,
  newValue: number,
  dimensionType: 'linear' | 'horizontal' | 'vertical',
  anchorEntity: 1 | 2 = 1
): [CADEntity, CADEntity] {
  if (dimensionType === 'linear') {
    return updatePointPairDistance(entity1, point1, entity2, point2, newValue, anchorEntity);
  }

  const anchor = anchorEntity === 1 ? point1 : point2;
  const moving = anchorEntity === 1 ? point2 : point1;
  const movingEntity = anchorEntity === 1 ? entity2 : entity1;
  const anchorEntityObj = anchorEntity === 1 ? entity1 : entity2;

  let newMoving: WorldPoint;
  if (dimensionType === 'horizontal') {
    const dx = moving.x - anchor.x;
    const newDx = dx >= 0 ? newValue : -newValue;
    newMoving = { x: anchor.x + newDx, y: moving.y };
  } else {
    const dy = moving.y - anchor.y;
    const newDy = dy >= 0 ? newValue : -newValue;
    newMoving = { x: moving.x, y: anchor.y + newDy };
  }

  const updatedMoving = applyPointMoveToEntity(movingEntity, moving, newMoving);
  return anchorEntity === 1
    ? [anchorEntityObj, updatedMoving]
    : [updatedMoving, anchorEntityObj];
}

function applyEntityDimensionWithConstraints(
  entities: CADEntity[],
  entityId: string,
  dimension: DimensionAnnotation,
  newValue: number
): CADEntity[] {
  const entity = entities.find(e => e.id === entityId);
  if (!entity) {
    return entities;
  }

  const before = entity;
  const after = updateEntityByDimension(entity, dimension, newValue);
  if (after === before) {
    return entities;
  }

  return propagateSharedPointConstraints(entities, entityId, before, after);
}

/**
 * Apply a dimension edit with SolidWorks-style constraint propagation.
 */
export function applyDimensionChange(
  entities: CADEntity[],
  dimension: DimensionAnnotation,
  newValue: number,
  selectedPoints: SelectedPoint[]
): CADEntity[] {
  const pointIds = dimension.metadata?.pointIds;

  if (
    pointIds
    && pointIds.length >= 2
    && (dimension.type === 'linear' || dimension.type === 'horizontal' || dimension.type === 'vertical')
  ) {
    const sp1 = selectedPoints.find(p => p.pointId === pointIds[0]);
    const sp2 = selectedPoints.find(p => p.pointId === pointIds[1]);
    if (sp1 && sp2) {
      const e1 = entities.find(e => e.id === sp1.entityId);
      const e2 = entities.find(e => e.id === sp2.entityId);
      if (e1 && e2) {
        const before1 = e1;
        const before2 = e2;
        const [after1, after2] = updatePointPairByDimension(
          e1,
          sp1.position,
          e2,
          sp2.position,
          newValue,
          dimension.type,
          1
        );

        let result = entities.map(e => {
          if (e.id === after1.id) return after1;
          if (e.id === after2.id) return after2;
          return e;
        });

        result = propagateSharedPointConstraints(result, after1.id, before1, after1);
        if (before2.id !== before1.id) {
          const after2Current = result.find(e => e.id === after2.id)!;
          result = propagateSharedPointConstraints(result, after2.id, before2, after2Current);
        }

        return result;
      }
    }
  }

  const entityIds = dimension.metadata?.entityIds ?? [];
  let result = entities;
  for (const entityId of entityIds) {
    result = applyEntityDimensionWithConstraints(result, entityId, dimension, newValue);
  }
  return result;
}