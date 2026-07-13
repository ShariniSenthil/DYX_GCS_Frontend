// ============================================================
// CAD Point Extraction Utilities
// ============================================================
//
// Extract selectable points from CAD entities for smart dimension editing.

import { CADEntity, WorldPoint, Viewport, worldToScreen } from '../core/cad';
import { SelectedPoint, PointMarker } from '../components/cad/types/selection';

/**
 * Extract selectable points from an entity
 */
export function extractSelectablePoints(
  entity: CADEntity,
  viewport: Viewport
): Array<{ point: SelectedPoint; marker: PointMarker }> {
  const points: Array<{ point: SelectedPoint; marker: PointMarker }> = [];

  switch (entity.type) {
    case 'Line':
      // Line has: start point, end point, midpoint
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'endpoint',
          position: entity.start,
          pointId: `${entity.id}-endpoint-0`,
        },
        marker: {
          pointId: `${entity.id}-endpoint-0`,
          position: entity.start,
          isSelected: false,
          isHovered: false,
          markerType: 'endpoint',
          size: 12,
          color: '#3B82F6',
        },
      });

      points.push({
        point: {
          entityId: entity.id,
          pointType: 'endpoint',
          position: entity.end,
          pointId: `${entity.id}-endpoint-1`,
        },
        marker: {
          pointId: `${entity.id}-endpoint-1`,
          position: entity.end,
          isSelected: false,
          isHovered: false,
          markerType: 'endpoint',
          size: 12,
          color: '#3B82F6',
        },
      });

      // Midpoint
      const midpoint: WorldPoint = {
        x: (entity.start.x + entity.end.x) / 2,
        y: (entity.start.y + entity.end.y) / 2,
      };
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'midpoint',
          position: midpoint,
          pointId: `${entity.id}-midpoint`,
        },
        marker: {
          pointId: `${entity.id}-midpoint`,
          position: midpoint,
          isSelected: false,
          isHovered: false,
          markerType: 'midpoint',
          size: 10,
          color: '#F59E0B',
        },
      });
      break;

    case 'Circle':
      // Circle has: center point
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'center',
          position: entity.center,
          pointId: `${entity.id}-center`,
        },
        marker: {
          pointId: `${entity.id}-center`,
          position: entity.center,
          isSelected: false,
          isHovered: false,
          markerType: 'center',
          size: 14,
          color: '#EF4444',
        },
      });
      break;

    case 'Rectangle':
      // Rectangle has: 4 corner vertices
      const corners = [
        { x: entity.corner1.x, y: entity.corner1.y }, // corner1
        { x: entity.corner2.x, y: entity.corner1.y }, // top-right
        { x: entity.corner2.x, y: entity.corner2.y }, // corner2
        { x: entity.corner1.x, y: entity.corner2.y }, // bottom-left
      ];

      corners.forEach((corner, index) => {
        points.push({
          point: {
            entityId: entity.id,
            pointType: 'vertex',
            position: corner,
            pointId: `${entity.id}-vertex-${index}`,
            pointIndex: index,
          },
          marker: {
            pointId: `${entity.id}-vertex-${index}`,
            position: corner,
            isSelected: false,
            isHovered: false,
            markerType: 'vertex',
            size: 12,
            color: '#22C55E',
          },
        });
      });
      break;

    case 'Arc':
      // Arc has: center point, start point, end point
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'center',
          position: entity.center,
          pointId: `${entity.id}-center`,
        },
        marker: {
          pointId: `${entity.id}-center`,
          position: entity.center,
          isSelected: false,
          isHovered: false,
          markerType: 'center',
          size: 14,
          color: '#EF4444',
        },
      });

      // Start point
      const startPoint: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
      };
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'endpoint',
          position: startPoint,
          pointId: `${entity.id}-endpoint-0`,
        },
        marker: {
          pointId: `${entity.id}-endpoint-0`,
          position: startPoint,
          isSelected: false,
          isHovered: false,
          markerType: 'endpoint',
          size: 12,
          color: '#3B82F6',
        },
      });

      // End point
      const endPoint: WorldPoint = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
      };
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'endpoint',
          position: endPoint,
          pointId: `${entity.id}-endpoint-1`,
        },
        marker: {
          pointId: `${entity.id}-endpoint-1`,
          position: endPoint,
          isSelected: false,
          isHovered: false,
          markerType: 'endpoint',
          size: 12,
          color: '#3B82F6',
        },
      });
      break;

    case 'Polyline':
      // Polyline has: all vertices
      entity.vertices.forEach((vertex, index) => {
        points.push({
          point: {
            entityId: entity.id,
            pointType: 'vertex',
            position: vertex,
            pointId: `${entity.id}-vertex-${index}`,
            pointIndex: index,
          },
          marker: {
            pointId: `${entity.id}-vertex-${index}`,
            position: vertex,
            isSelected: false,
            isHovered: false,
            markerType: 'vertex',
            size: 12,
            color: '#22C55E',
          },
        });
      });
      break;

    case 'Point':
      // Point entity has: its position
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'custom',
          position: entity.position,
          pointId: `${entity.id}-position`,
        },
        marker: {
          pointId: `${entity.id}-position`,
          position: entity.position,
          isSelected: false,
          isHovered: false,
          markerType: 'vertex',
          size: 14,
          color: '#A855F7',
        },
      });
      break;

    case 'Text':
      // Text has: insertion point
      points.push({
        point: {
          entityId: entity.id,
          pointType: 'custom',
          position: entity.position,
          pointId: `${entity.id}-position`,
        },
        marker: {
          pointId: `${entity.id}-position`,
          position: entity.position,
          isSelected: false,
          isHovered: false,
          markerType: 'vertex',
          size: 12,
          color: '#A855F7',
        },
      });
      break;

    default:
      break;
  }

  return points;
}

/**
 * Find the closest selectable point to a given screen position
 */
export function findClosestSelectablePoint(
  screenPos: { x: number; y: number },
  entities: CADEntity[],
  viewport: Viewport,
  threshold: number = 20
): { point: SelectedPoint; marker: PointMarker } | null {
  let closest: { point: SelectedPoint; marker: PointMarker } | null = null;
  let minDistance = threshold;

  entities.forEach(entity => {
    const points = extractSelectablePoints(entity, viewport);

    points.forEach(({ point, marker }) => {
      const screenPoint = worldToScreen(marker.position, viewport);
      const distance = Math.hypot(screenPoint.x - screenPos.x, screenPoint.y - screenPos.y);

      if (distance < minDistance) {
        minDistance = distance;
        closest = { point, marker };
      }
    });
  });

  return closest;
}

/**
 * Update marker selection state based on current selection
 */
export function updateMarkerSelectionState(
  markers: PointMarker[],
  selectedPoints: SelectedPoint[]
): PointMarker[] {
  const selectedPointIds = new Set(selectedPoints.map(p => p.pointId));

  return markers.map(marker => ({
    ...marker,
    isSelected: selectedPointIds.has(marker.pointId),
  }));
}