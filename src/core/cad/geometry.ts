// ============================================================
// CAD Geometry — pure math utilities for entity math
// ============================================================
//
// All functions operate in world coordinates. No React Native deps.

import { WorldPoint, CADEntity } from './types';

/** Euclidean distance between two points */
export function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint of two points */
export function midpoint(a: WorldPoint, b: WorldPoint): WorldPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Angle between two points in radians, measured CCW from +X axis (math convention) */
export function angleRad(from: WorldPoint, to: WorldPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Angle between two points in degrees, 0-360 CCW from +X */
export function angleDeg(from: WorldPoint, to: WorldPoint): number {
  return (angleRad(from, to) * 180 / Math.PI + 360) % 360;
}

/** Perpendicular foot from point P onto line segment A-B */
export function perpendicularFoot(p: WorldPoint, a: WorldPoint, b: WorldPoint): WorldPoint | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return null;

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const tc = Math.max(0, Math.min(1, t));
  return { x: a.x + tc * dx, y: a.y + tc * dy };
}

/** Closest point on a line segment A-B to point P */
export function closestPointOnSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): WorldPoint {
  return perpendicularFoot(p, a, b) ?? a;
}

/** Line-line intersection (infinite lines through A1-A2 and B1-B2) */
export function lineLineIntersection(
  a1: WorldPoint, a2: WorldPoint,
  b1: WorldPoint, b2: WorldPoint,
): WorldPoint | null {
  const denom = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(denom) < 1e-12) return null;

  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / denom;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** Segment-segment intersection (both parameters must lie on [0, 1]) */
export function segmentSegmentIntersection(
  a1: WorldPoint, a2: WorldPoint,
  b1: WorldPoint, b2: WorldPoint,
): WorldPoint | null {
  const denom = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(denom) < 1e-12) return null;

  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / denom;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** Extract linear segments from an entity for intersection tests */
export function entitySegments(e: CADEntity): Array<[WorldPoint, WorldPoint]> {
  switch (e.type) {
    case 'Line':
      return [[e.start, e.end]];
    case 'Rectangle': {
      const c1 = e.corner1, c2 = e.corner2;
      const p0 = { x: c1.x, y: c1.y };
      const p1 = { x: c2.x, y: c1.y };
      const p2 = { x: c2.x, y: c2.y };
      const p3 = { x: c1.x, y: c2.y };
      return [[p0, p1], [p1, p2], [p2, p3], [p3, p0]];
    }
    case 'Polyline': {
      const segs: Array<[WorldPoint, WorldPoint]> = [];
      for (let i = 0; i < e.vertices.length - 1; i++) {
        segs.push([e.vertices[i], e.vertices[i + 1]]);
      }
      if (e.closed && e.vertices.length >= 2) {
        segs.push([e.vertices[e.vertices.length - 1], e.vertices[0]]);
      }
      return segs;
    }
    case 'Dimension':
      return [[e.p1, e.p2]];
    default:
      return [];
  }
}

/** Quadrant points of a circle (0, 90, 180, 270 degrees) */
export function quadrantPoints(center: WorldPoint, radius: number): WorldPoint[] {
  return [
    { x: center.x + radius, y: center.y },
    { x: center.x, y: center.y + radius },
    { x: center.x - radius, y: center.y },
    { x: center.x, y: center.y - radius },
  ];
}

/** Bounding box of a single entity */
export function entityBounds(e: CADEntity): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const absorb = (p: WorldPoint) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  };
  switch (e.type) {
    case 'Line': absorb(e.start); absorb(e.end); break;
    case 'Point': absorb(e.position); break;
    case 'Circle':
      absorb({ x: e.center.x - e.radius, y: e.center.y - e.radius });
      absorb({ x: e.center.x + e.radius, y: e.center.y + e.radius });
      break;
    case 'Arc':
      absorb({ x: e.center.x - e.radius, y: e.center.y - e.radius });
      absorb({ x: e.center.x + e.radius, y: e.center.y + e.radius });
      break;
    case 'Polyline':
      for (const v of e.vertices) absorb(v);
      break;
    case 'Rectangle': absorb(e.corner1); absorb(e.corner2); break;
    case 'Text': absorb(e.position); break;
    case 'Dimension': absorb(e.p1); absorb(e.p2); break;
  }
  return { minX, minY, maxX, maxY };
}

/** Bounding box of all entities (or origin if empty) */
export function entitiesBounds(entities: CADEntity[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (entities.length === 0) {
    return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    const b = entityBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}
