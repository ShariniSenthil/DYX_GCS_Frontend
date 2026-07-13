import { DxfMapEntity, PathPlanWaypoint } from '../../types/pathplan';
import { Entity, CADModel, GeoPoint, Point2D } from '../../core/geometry/types';
import { parseDXF } from '../../core/parser/dxfParser';
import { enuToLatLon } from '../../core/geo/enu';

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export type PreparedDXFImport = {
  fileName: string;
  model: CADModel;
  bounds: BBox;
};

const DEFAULT_ORIGIN: GeoPoint = { lat: 0, lon: 0 };
const DEFAULT_OFFSET_METERS = 1;
const FULL_CIRCLE_SWEEP = Math.PI * 2;
const MAP_CIRCLE_STEPS = 256;
const MAP_ARC_STEPS = 256;

export function prepareDXFImport(content: string, fileName: string): PreparedDXFImport {
  const model = parseDXF(content);
  if (model.entities.length === 0) {
    throw new Error('No supported entities found in DXF file.');
  }

  return {
    fileName,
    model,
    bounds: computeBounds(model.entities),
  };
}

export function importDXFAsWaypoints(
  prepared: PreparedDXFImport,
  roverPosition?: GeoPoint | null,
): PathPlanWaypoint[] {
  const origin = getPlacementOrigin(roverPosition);
  const toGeo = createPlacementTransform(prepared.bounds, origin);
  const waypoints: PathPlanWaypoint[] = [];
  let id = 1;

  for (const entity of prepared.model.entities) {
    for (const point of entityToCADPoints(entity)) {
      const geo = toGeo(point);
      waypoints.push({
        id: id++,
        lat: geo.lat,
        lon: geo.lon,
        alt: 0,
        distance: 0,
        block: '',
        row: entity.layer ?? '',
        pile: String(id - 1),
        mark: false,
      });
    }
  }

  return waypoints;
}

export function importDXFAsEntities(
  prepared: PreparedDXFImport,
  roverPosition?: GeoPoint | null,
): DxfMapEntity[] {
  const origin = getPlacementOrigin(roverPosition);
  const toGeo = createPlacementTransform(prepared.bounds, origin);
  const result: DxfMapEntity[] = [];

  for (const entity of prepared.model.entities) {
    switch (entity.type) {
      case 'Line':
        result.push({
          id: entity.id,
          kind: 'line',
          layer: entity.layer,
          coordinates: [toGeo(entity.start), toGeo(entity.end)],
        });
        break;

      case 'Point':
        result.push({
          id: entity.id,
          kind: 'point',
          layer: entity.layer,
          coordinates: [toGeo(entity.position)],
        });
        break;

      case 'Polyline':
        const polylinePoints = polylineToCADPoints(entity);
        result.push({
          id: entity.id,
          kind: 'line',
          layer: entity.layer,
          closedRing: entity.closed || isClosedCADRing(polylinePoints),
          coordinates: polylinePoints.map(toGeo),
        });
        break;

      case 'Arc':
        const arcPoints = arcToCADPoints(entity.center, entity.radius, entity.startAngle, entity.endAngle);
        result.push({
          id: entity.id,
          kind: 'line',
          layer: entity.layer,
          closedRing: isFullCircleSweep(entity.startAngle, entity.endAngle),
          coordinates: arcPoints.map(toGeo),
        });
        break;

      case 'Text':
        result.push({
          id: entity.id,
          kind: 'text',
          layer: entity.layer,
          label: entity.text,
          coordinates: [toGeo(entity.position)],
        });
        break;
    }
  }

  return result.filter(entity => entity.coordinates.length > 0);
}

function getPlacementOrigin(roverPosition?: GeoPoint | null): GeoPoint {
  if (
    roverPosition &&
    Number.isFinite(roverPosition.lat) &&
    Number.isFinite(roverPosition.lon) &&
    (roverPosition.lat !== 0 || roverPosition.lon !== 0)
  ) {
    return roverPosition;
  }
  return DEFAULT_ORIGIN;
}

function createPlacementTransform(bounds: BBox, origin: GeoPoint) {
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  return (point: Point2D) => {
    const enu = {
      x: point.x - center.x + DEFAULT_OFFSET_METERS,
      y: point.y - center.y,
    };
    const geo = enuToLatLon(origin, enu);
    return { lat: geo.lat, lon: geo.lon };
  };
}

function computeBounds(entities: Entity[]): BBox {
  const points = entities.flatMap(entityToCADPoints);
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function entityToCADPoints(entity: Entity): Point2D[] {
  switch (entity.type) {
    case 'Line':
      return [entity.start, entity.end];
    case 'Point':
      return [entity.position];
    case 'Polyline':
      return polylineToCADPoints(entity);
    case 'Arc':
      return arcToCADPoints(entity.center, entity.radius, entity.startAngle, entity.endAngle);
    case 'Text':
      return [entity.position];
  }
}

function polylineToCADPoints(entity: Extract<Entity, { type: 'Polyline' }>): Point2D[] {
  const points: Point2D[] = [entity.startPoint];

  for (const segment of entity.segments) {
    if (segment.segmentType === 'Arc') {
      const arcPoints = arcToCADPoints(segment.center, segment.radius, segment.startAngle, segment.endAngle);
      points.push(...arcPoints.slice(1));
    } else {
      points.push(segment.to);
    }
  }

  if (entity.closed && points.length > 0 && !isSamePoint(points[0], points[points.length - 1])) {
    points.push(points[0]);
  }

  return points;
}

function arcToCADPoints(center: Point2D, radius: number, startAngle: number, endAngle: number): Point2D[] {
  const sweep = normalizeSweep(startAngle, endAngle);
  const isFullCircle = sweep >= FULL_CIRCLE_SWEEP - 1e-6;
  const steps = isFullCircle
    ? MAP_CIRCLE_STEPS
    : Math.max(12, Math.ceil((sweep / FULL_CIRCLE_SWEEP) * MAP_ARC_STEPS));
  const points: Point2D[] = [];

  for (let i = 0; i <= steps; i++) {
    if (isFullCircle && i === steps) {
      points.push(points[0]);
      break;
    }

    const angle = startAngle + (sweep * i) / steps;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }

  return points;
}

function normalizeSweep(startAngle: number, endAngle: number): number {
  if (endAngle >= startAngle) return endAngle - startAngle;
  return endAngle + FULL_CIRCLE_SWEEP - startAngle;
}

function isFullCircleSweep(startAngle: number, endAngle: number): boolean {
  return normalizeSweep(startAngle, endAngle) >= FULL_CIRCLE_SWEEP - 1e-6;
}

function isClosedCADRing(points: Point2D[]): boolean {
  if (points.length < 4) return false;
  return isSamePoint(points[0], points[points.length - 1]);
}

function isSamePoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
