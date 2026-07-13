// ============================================================
// Georeferencing Service — full CAD → geo pipeline
// ============================================================
//
// This is the top-level orchestrator within /core.
// It chains: normalize → compute transform → apply → convert to lat/lon
//
// Supports all entity types:
//   - Line
//   - Point
//   - Polyline (with Line and Arc segments from bulge)
//   - Arc (standalone)
//   - Text (from TEXT, MTEXT, and DIMENSION entities)
//
// The service is pure functional: no state, no side effects.
// Every call is independent and idempotent.

import {
  CADModel,
  Entity,
  GeoEntity,
  GeoLine,
  GeoPointEntity,
  GeoPolyline,
  GeoPolylineSegment,
  GeoArc,
  GeoTextEntity,
  GeoPoint,
  Point2D,
  Vec2D,
  GeorefResult,
  PolylineSegment,
} from '../geometry/types';
import { latLonToENU, enuToLatLon } from '../geo/enu';
import { computeTransform, applyTransform, TransformMatrix } from '../transform/transformEngine';

// ============================================================
// Coordinate normalization
// ============================================================

/**
 * Find the minimum bounding-box corner of a CAD model.
 * This gives us a "local origin" that keeps all coordinates positive.
 */
function findCADOrigin(entities: Entity[]): Point2D {
  let minX = Infinity;
  let minY = Infinity;

  for (const entity of entities) {
    switch (entity.type) {
      case 'Line': {
        minX = Math.min(minX, entity.start.x, entity.end.x);
        minY = Math.min(minY, entity.start.y, entity.end.y);
        break;
      }
      case 'Point': {
        minX = Math.min(minX, entity.position.x);
        minY = Math.min(minY, entity.position.y);
        break;
      }
      case 'Polyline': {
        minX = Math.min(minX, entity.startPoint.x);
        minY = Math.min(minY, entity.startPoint.y);
        for (const seg of entity.segments) {
          minX = Math.min(minX, seg.to.x);
          minY = Math.min(minY, seg.to.y);
          if (seg.segmentType === 'Arc') {
            minX = Math.min(minX, seg.center.x - seg.radius);
            minY = Math.min(minY, seg.center.y - seg.radius);
          }
        }
        break;
      }
      case 'Arc': {
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        break;
      }
      case 'Text': {
        minX = Math.min(minX, entity.position.x);
        minY = Math.min(minY, entity.position.y);
        break;
      }
    }
  }

  return { x: isFinite(minX) ? minX : 0, y: isFinite(minY) ? minY : 0 };
}

/**
 * Normalize all entities by subtracting a reference origin.
 * This shifts the CAD drawing so its minimum corner is at (0, 0).
 */
function normalizeEntities(entities: Entity[], origin: Point2D): Entity[] {
  return entities.map((entity) => {
    switch (entity.type) {
      case 'Line':
        return {
          ...entity,
          start: { x: entity.start.x - origin.x, y: entity.start.y - origin.y },
          end: { x: entity.end.x - origin.x, y: entity.end.y - origin.y },
        };

      case 'Point':
        return {
          ...entity,
          position: { x: entity.position.x - origin.x, y: entity.position.y - origin.y },
        };

      case 'Polyline': {
        const normStart = {
          x: entity.startPoint.x - origin.x,
          y: entity.startPoint.y - origin.y,
        };
        const normSegments: PolylineSegment[] = entity.segments.map((seg) => {
          const normTo = { x: seg.to.x - origin.x, y: seg.to.y - origin.y };
          if (seg.segmentType === 'Arc') {
            const normCenter = {
              x: seg.center.x - origin.x,
              y: seg.center.y - origin.y,
            };
            return {
              segmentType: 'Arc' as const,
              center: normCenter,
              radius: seg.radius,
              startAngle: seg.startAngle,
              endAngle: seg.endAngle,
              to: normTo,
            };
          }
          return {
            segmentType: 'Line' as const,
            to: normTo,
          };
        });
        return {
          ...entity,
          startPoint: normStart,
          segments: normSegments,
        };
      }

      case 'Arc':
        return {
          ...entity,
          center: { x: entity.center.x - origin.x, y: entity.center.y - origin.y },
        };

      case 'Text':
        return {
          ...entity,
          position: { x: entity.position.x - origin.x, y: entity.position.y - origin.y },
        };
    }
  });
}

// ============================================================
// Entity transformation helpers
// ============================================================

/** Transform a Line entity to ENU meters and then to lat/lon */
function transformLine(entity: Entity, matrix: TransformMatrix, geoOrigin: GeoPoint): GeoLine {
  if (entity.type !== 'Line') throw new Error('Expected Line entity');

  const localStart = applyTransform(entity.start, matrix);
  const localEnd = applyTransform(entity.end, matrix);

  return {
    id: entity.id,
    type: 'Line',
    localStart,
    localEnd,
    geoStart: enuToLatLon(geoOrigin, localStart),
    geoEnd: enuToLatLon(geoOrigin, localEnd),
    layer: entity.layer,
  };
}

/** Transform a Point entity to ENU meters and then to lat/lon */
function transformPointEntity(entity: Entity, matrix: TransformMatrix, geoOrigin: GeoPoint): GeoPointEntity {
  if (entity.type !== 'Point') throw new Error('Expected Point entity');

  const localPos = applyTransform(entity.position, matrix);

  return {
    id: entity.id,
    type: 'Point',
    localPosition: localPos,
    geoPosition: enuToLatLon(geoOrigin, localPos),
    layer: entity.layer,
  };
}

/** Transform a Polyline entity to ENU meters and then to lat/lon */
function transformPolyline(entity: Entity, matrix: TransformMatrix, geoOrigin: GeoPoint): GeoPolyline {
  if (entity.type !== 'Polyline') throw new Error('Expected Polyline entity');

  const startLocal = applyTransform(entity.startPoint, matrix);

  const geoSegments: GeoPolylineSegment[] = entity.segments.map((seg) => {
    const toLocal = applyTransform(seg.to, matrix);
    const toGeo = enuToLatLon(geoOrigin, toLocal);

    if (seg.segmentType === 'Arc') {
      const centerLocal = applyTransform(seg.center, matrix);
      // Radius scales uniformly; angles rotate by the transform rotation
      const geoRadius = seg.radius * matrix.scale;

      return {
        segmentType: 'Arc' as const,
        centerLocal,
        centerGeo: enuToLatLon(geoOrigin, centerLocal),
        radius: geoRadius,
        startAngle: seg.startAngle + matrix.rotation,
        endAngle: seg.endAngle + matrix.rotation,
        toLocal,
        toGeo,
      };
    }

    return {
      segmentType: 'Line' as const,
      toLocal,
      toGeo,
    };
  });

  return {
    id: entity.id,
    type: 'Polyline',
    startLocal,
    startGeo: enuToLatLon(geoOrigin, startLocal),
    segments: geoSegments,
    closed: entity.closed,
    layer: entity.layer,
  };
}

/** Transform an Arc entity to ENU meters and then to lat/lon */
function transformArc(entity: Entity, matrix: TransformMatrix, geoOrigin: GeoPoint): GeoArc {
  if (entity.type !== 'Arc') throw new Error('Expected Arc entity');

  const localCenter = applyTransform(entity.center, matrix);
  // Radius scales uniformly (no rotation effect on radius)
  const geoRadius = entity.radius * matrix.scale;

  return {
    id: entity.id,
    type: 'Arc',
    localCenter,
    geoCenter: enuToLatLon(geoOrigin, localCenter),
    radius: geoRadius,
    startAngle: entity.startAngle + matrix.rotation,
    endAngle: entity.endAngle + matrix.rotation,
    layer: entity.layer,
  };
}

/** Transform a Text entity to ENU meters and then to lat/lon */
function transformText(entity: Entity, matrix: TransformMatrix, geoOrigin: GeoPoint): GeoTextEntity {
  if (entity.type !== 'Text') throw new Error('Expected Text entity');

  const localPos = applyTransform(entity.position, matrix);
  const geoHeight = entity.height * matrix.scale;
  const geoRotation = entity.rotation + matrix.rotation;

  return {
    id: entity.id,
    type: 'Text',
    localPosition: localPos,
    geoPosition: enuToLatLon(geoOrigin, localPos),
    text: entity.text,
    height: geoHeight,
    rotation: geoRotation,
    layer: entity.layer,
  };
}

// ============================================================
// Main pipeline
// ============================================================

/**
 * Full georeferencing pipeline: CAD → ENU meters → lat/lon.
 *
 * @param cad   - Parsed CAD model
 * @param cadA  - First reference point in CAD space (user-selected on drawing)
 * @param cadB  - Second reference point in CAD space (user-selected on drawing)
 * @param geoA  - First reference point in GPS coordinates
 * @param geoB  - Second reference point in GPS coordinates
 * @returns GeorefResult with cadEntities, localEntities (meters), and geoEntities (lat/lon)
 *
 * Pipeline:
 *   1. Find CAD bounding-box origin → normalize all coords to (0,0) minimum
 *   2. Normalize reference points the same way
 *   3. Compute TRS transform from CAD → ENU
 *   4. Apply transform to every entity
 *   5. Convert ENU → lat/lon for geo output
 */
export function georeferenceCAD(
  cad: CADModel,
  cadA: Point2D,
  cadB: Point2D,
  geoA: GeoPoint,
  geoB: GeoPoint
): GeorefResult {
  // ── Step 1: Normalize CAD entities ────────────────────────
  const cadOrigin = findCADOrigin(cad.entities);
  const normalizedCAD = normalizeEntities(cad.entities, cadOrigin);

  // ── Step 2: Normalize reference points the same way ───────
  const normCadA = { x: cadA.x - cadOrigin.x, y: cadA.y - cadOrigin.y };
  const normCadB = { x: cadB.x - cadOrigin.x, y: cadB.y - cadOrigin.y };

  // ── Step 3: Compute transform (CAD → ENU) ─────────────────
  const matrix = computeTransform(normCadA, normCadB, geoA, geoB);

  // ── Step 4: Apply transform to all entities → ENU meters ──
  const geoEntities: GeoEntity[] = [];
  const localEntities: Entity[] = [];

  for (const entity of normalizedCAD) {
    switch (entity.type) {
      case 'Line': {
        const geo = transformLine(entity, matrix, geoA);
        geoEntities.push(geo);
        localEntities.push({
          ...entity,
          start: { x: geo.localStart.x, y: geo.localStart.y },
          end: { x: geo.localEnd.x, y: geo.localEnd.y },
        });
        break;
      }

      case 'Point': {
        const geo = transformPointEntity(entity, matrix, geoA);
        geoEntities.push(geo);
        localEntities.push({
          ...entity,
          position: { x: geo.localPosition.x, y: geo.localPosition.y },
        });
        break;
      }

      case 'Polyline': {
        const geo = transformPolyline(entity, matrix, geoA);
        geoEntities.push(geo);

        // Build local-space version from geo segments
        localEntities.push({
          ...entity,
          startPoint: { x: geo.startLocal.x, y: geo.startLocal.y },
          segments: geo.segments.map((seg) => {
            if (seg.segmentType === 'Arc') {
              return {
                segmentType: 'Arc' as const,
                center: { x: seg.centerLocal.x, y: seg.centerLocal.y },
                radius: seg.radius,
                startAngle: seg.startAngle,
                endAngle: seg.endAngle,
                to: { x: seg.toLocal.x, y: seg.toLocal.y },
              };
            }
            return {
              segmentType: 'Line' as const,
              to: { x: seg.toLocal.x, y: seg.toLocal.y },
            };
          }),
        });
        break;
      }

      case 'Arc': {
        const geo = transformArc(entity, matrix, geoA);
        geoEntities.push(geo);
        localEntities.push({
          ...entity,
          center: { x: geo.localCenter.x, y: geo.localCenter.y },
          radius: geo.radius,
        });
        break;
      }

      case 'Text': {
        const geo = transformText(entity, matrix, geoA);
        geoEntities.push(geo);
        localEntities.push({
          ...entity,
          position: { x: geo.localPosition.x, y: geo.localPosition.y },
          height: geo.height,
          rotation: geo.rotation,
        });
        break;
      }
    }
  }

  // ── Step 5: Return all three representations ──────────────
  return {
    cadEntities: normalizedCAD,   // normalized CAD space (unitless)
    localEntities,                 // metric space (meters from geo origin)
    geoEntities,                   // geographic space (lat/lon)
  };
}
