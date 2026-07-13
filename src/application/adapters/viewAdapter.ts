// ============================================================
// View Adapter — converts core entities → screen coordinates
// ============================================================
//
// This module lives in /application (NOT /core) because it
// bridges the pure math layer with UI rendering concerns.
//
// It computes:
//   - Bounding box of entities
//   - Scale-to-fit for a given viewport
//   - Screen-space entity coordinates
//
// Supports: Line, Point, Polyline (with Line/Arc segments), Arc

import {
  Entity,
  GeoEntity,
  PolylineSegment,
  Vec2D,
} from '../../core/geometry/types';

/** Viewport specification for screen rendering */
export type Viewport = {
  width: number;   // screen pixels
  height: number;  // screen pixels
  padding?: number; // padding in pixels (default: 20)
};

/** Screen-space entity ready for canvas rendering */
export type ScreenEntity = {
  id: string;
  type: string;
  screenPoints: Vec2D[];    // screen pixel coordinates
  screenArcParams?: {       // for Arc segments/standalone arcs
    cx: number;
    cy: number;
    r: number;
    startAngle: number;
    endAngle: number;
  };
  layer?: string;
};

/**
 * Compute the bounding box of a set of CAD entities.
 */
function computeBoundingBox(entities: Entity[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const entity of entities) {
    switch (entity.type) {
      case 'Line': {
        minX = Math.min(minX, entity.start.x, entity.end.x);
        minY = Math.min(minY, entity.start.y, entity.end.y);
        maxX = Math.max(maxX, entity.start.x, entity.end.x);
        maxY = Math.max(maxY, entity.start.y, entity.end.y);
        break;
      }
      case 'Point': {
        minX = Math.min(minX, entity.position.x);
        minY = Math.min(minY, entity.position.y);
        maxX = Math.max(maxX, entity.position.x);
        maxY = Math.max(maxY, entity.position.y);
        break;
      }
      case 'Polyline': {
        minX = Math.min(minX, entity.startPoint.x);
        minY = Math.min(minY, entity.startPoint.y);
        maxX = Math.max(maxX, entity.startPoint.x);
        maxY = Math.max(maxY, entity.startPoint.y);
        for (const seg of entity.segments) {
          minX = Math.min(minX, seg.to.x);
          minY = Math.min(minY, seg.to.y);
          maxX = Math.max(maxX, seg.to.x);
          maxY = Math.max(maxY, seg.to.y);
          if (seg.segmentType === 'Arc') {
            minX = Math.min(minX, seg.center.x - seg.radius);
            minY = Math.min(minY, seg.center.y - seg.radius);
            maxX = Math.max(maxX, seg.center.x + seg.radius);
            maxY = Math.max(maxY, seg.center.y + seg.radius);
          }
        }
        break;
      }
      case 'Arc': {
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        maxX = Math.max(maxX, entity.center.x + entity.radius);
        maxY = Math.max(maxY, entity.center.y + entity.radius);
        break;
      }
    }
  }

  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 0,
    maxY: isFinite(maxY) ? maxY : 0,
  };
}

/**
 * Convert CAD/local entities to screen-space coordinates.
 *
 * Math:
 *   1. Compute bounding box of all entities
 *   2. Compute scale to fit within viewport (with padding)
 *   3. Center the drawing in the viewport
 *   4. Flip Y axis (CAD Y-up → screen Y-down)
 *
 * @param entities - Entities in any metric space (CAD units or meters)
 * @param viewport - Target screen dimensions
 * @returns Array of screen-space entities ready for canvas rendering
 */
export function toScreenEntities(entities: Entity[], viewport: Viewport): ScreenEntity[] {
  const padding = viewport.padding ?? 20;
  const bbox = computeBoundingBox(entities);

  const bboxWidth = bbox.maxX - bbox.minX;
  const bboxHeight = bbox.maxY - bbox.minY;

  // Guard against zero-size
  if (bboxWidth < 1e-10 || bboxHeight < 1e-10) {
    // Single point or degenerate — center it
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;

    return entities.map((entity) => {
      const result: ScreenEntity = { id: entity.id, type: entity.type, screenPoints: [], layer: entity.layer };

      switch (entity.type) {
        case 'Line':
          result.screenPoints = [{ x: cx, y: cy }, { x: cx, y: cy }];
          break;
        case 'Point':
          result.screenPoints = [{ x: cx, y: cy }];
          break;
        case 'Polyline':
          result.screenPoints = entity.segments.map(() => ({ x: cx, y: cy }));
          break;
        case 'Arc':
          result.screenPoints = [{ x: cx, y: cy }];
          result.screenArcParams = { cx, cy, r: 5, startAngle: 0, endAngle: 2 * Math.PI };
          break;
      }
      return result;
    });
  }

  // Scale to fit: preserve aspect ratio
  const scaleX = (viewport.width - 2 * padding) / bboxWidth;
  const scaleY = (viewport.height - 2 * padding) / bboxHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center offset
  const scaledWidth = bboxWidth * scale;
  const scaledHeight = bboxHeight * scale;
  const offsetX = (viewport.width - scaledWidth) / 2;
  const offsetY = (viewport.height - scaledHeight) / 2;

  /** Convert a single point from entity space → screen pixels */
  function toScreen(p: { x: number; y: number }): Vec2D {
    return {
      x: (p.x - bbox.minX) * scale + offsetX,
      // Flip Y: entity Y-up → screen Y-down
      y: viewport.height - ((p.y - bbox.minY) * scale + offsetY),
    };
  }

  /** Convert a radius from entity space → screen pixels (same scale factor) */
  function toScreenRadius(r: number): number {
    return r * scale;
  }

  return entities.map((entity) => {
    const result: ScreenEntity = { id: entity.id, type: entity.type, screenPoints: [], layer: entity.layer };

    switch (entity.type) {
      case 'Line':
        result.screenPoints = [toScreen(entity.start), toScreen(entity.end)];
        break;

      case 'Point':
        result.screenPoints = [toScreen(entity.position)];
        break;

      case 'Polyline': {
        const allPoints: Vec2D[] = [toScreen(entity.startPoint)];
        for (const seg of entity.segments) {
          allPoints.push(toScreen(seg.to));
          if (seg.segmentType === 'Arc') {
            // Add arc center as a special point for the renderer
            // We store arc params in the last point's metadata
            result.screenArcParams = {
              cx: toScreen(seg.center).x,
              cy: toScreen(seg.center).y,
              r: toScreenRadius(seg.radius),
              startAngle: seg.startAngle,
              endAngle: seg.endAngle,
            };
          }
        }
        result.screenPoints = allPoints;
        break;
      }

      case 'Arc': {
        const centerScreen = toScreen(entity.center);
        result.screenPoints = [centerScreen];
        result.screenArcParams = {
          cx: centerScreen.x,
          cy: centerScreen.y,
          r: toScreenRadius(entity.radius),
          startAngle: entity.startAngle,
          endAngle: entity.endAngle,
        };
        break;
      }
    }

    return result;
  });
}

/**
 * Convert georeferenced entities to screen coordinates for map overlay.
 * Uses lat/lon as X/Y for bounding box computation.
 */
export function geoEntitiesToScreen(geoEntities: GeoEntity[], viewport: Viewport): ScreenEntity[] {
  // Convert geo entities to a flat list of "local" points using lat/lon as X/Y
  const asEntities: Entity[] = geoEntities.map((geo) => {
    switch (geo.type) {
      case 'Line':
        return {
          id: geo.id,
          type: 'Line',
          start: { x: geo.geoStart.lon, y: geo.geoStart.lat },
          end: { x: geo.geoEnd.lon, y: geo.geoEnd.lat },
          layer: geo.layer,
        };
      case 'Point':
        return {
          id: geo.id,
          type: 'Point',
          position: { x: geo.geoPosition.lon, y: geo.geoPosition.lat },
          layer: geo.layer,
        };
      case 'Polyline': {
        return {
          id: geo.id,
          type: 'Polyline',
          startPoint: { x: geo.startGeo.lon, y: geo.startGeo.lat },
          segments: geo.segments.map((seg) => {
            if (seg.segmentType === 'Arc') {
              return {
                segmentType: 'Arc' as const,
                center: { x: seg.centerGeo.lon, y: seg.centerGeo.lat },
                radius: seg.radius * 1e-7, // rough conversion for bounding box
                startAngle: seg.startAngle,
                endAngle: seg.endAngle,
                to: { x: seg.toGeo.lon, y: seg.toGeo.lat },
              };
            }
            return {
              segmentType: 'Line' as const,
              to: { x: seg.toGeo.lon, y: seg.toGeo.lat },
            };
          }),
          closed: geo.closed,
          layer: geo.layer,
        };
      }
      case 'Arc':
        return {
          id: geo.id,
          type: 'Arc',
          center: { x: geo.geoCenter.lon, y: geo.geoCenter.lat },
          radius: geo.radius * 1e-7,
          startAngle: geo.startAngle,
          endAngle: geo.endAngle,
          layer: geo.layer,
        };
      case 'Text':
        return {
          id: geo.id,
          type: 'Text',
          position: { x: geo.geoPosition.lon, y: geo.geoPosition.lat },
          text: geo.text,
          height: geo.height,
          rotation: geo.rotation,
          layer: geo.layer,
        };
    }
  });

  return toScreenEntities(asEntities, viewport);
}
