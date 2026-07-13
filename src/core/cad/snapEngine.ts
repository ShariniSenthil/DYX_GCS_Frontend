// ============================================================
// Snap Engine — AutoCAD-style object snaps (OSNAP subset)
// ============================================================
//
// Given a cursor world position and active snap modes, finds the
// best snap point across all entities. Aperture is in screen pixels
// so feel stays consistent at any zoom.
//
// Priority mirrors AutoCAD practice: precise modes (endpoint, node,
// midpoint, center, intersection…) beat sticky modes (nearest).
// Object snap wins over ORTHO/POLAR when a candidate is in aperture
// (caller responsibility — see resolvePick in the canvas).

import { WorldPoint, CADEntity, SnapMode, SnapResult, Viewport } from './types';
import {
  distance,
  midpoint,
  perpendicularFoot,
  quadrantPoints,
  closestPointOnSegment,
  segmentSegmentIntersection,
  entitySegments,
} from './geometry';
import { screenToWorldLength } from './viewport';

/**
 * Lower number = higher priority (AutoCAD-like).
 * Nearest is last-resort so it does not steal endpoint/midpoint.
 */
export const SNAP_PRIORITY: Record<SnapMode, number> = {
  endpoint: 0,
  node: 0,
  midpoint: 1,
  center: 1,
  intersection: 2,
  quadrant: 2,
  perpendicular: 3,
  grid: 4,
  nearest: 9,
};

/** Default running object snaps for 2D field drafting */
export const DEFAULT_RUNNING_SNAPS: ReadonlySet<SnapMode> = new Set([
  'endpoint',
  'midpoint',
  'center',
  'intersection',
  'node',
  'quadrant',
  'perpendicular',
]);

/**
 * Resolve the best snap point near the cursor.
 */
export function resolveSnap(
  cursor: WorldPoint,
  entities: CADEntity[],
  modes: Set<SnapMode>,
  aperturePx: number,
  viewport: Viewport,
): SnapResult | null {
  const apertureWorld = screenToWorldLength(aperturePx, viewport);
  const candidates: SnapResult[] = [];

  for (const entity of entities) {
    collectEntityCandidates(candidates, entity, cursor, modes, apertureWorld);
  }

  if (modes.has('intersection') && entities.length >= 2) {
    collectIntersectionCandidates(candidates, entities, cursor, apertureWorld);
  }

  return pickBestCandidate(candidates, cursor);
}

/**
 * Grid snap fallback (AutoCAD SNAPMODE-style, only when within aperture).
 * Used when object snap misses and GRID is on.
 */
export function resolveGridSnap(
  cursor: WorldPoint,
  spacing: number,
  aperturePx: number,
  viewport: Viewport,
): SnapResult | null {
  if (spacing <= 0) return null;
  const apertureWorld = screenToWorldLength(aperturePx, viewport);
  const point = {
    x: Math.round(cursor.x / spacing) * spacing,
    y: Math.round(cursor.y / spacing) * spacing,
  };
  if (distance(cursor, point) > apertureWorld) return null;
  return { point, mode: 'grid' };
}

function pickBestCandidate(candidates: SnapResult[], cursor: WorldPoint): SnapResult | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestPri = SNAP_PRIORITY[best.mode] ?? 99;
  let bestDist = distance(cursor, best.point);

  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const pri = SNAP_PRIORITY[c.mode] ?? 99;
    const d = distance(cursor, c.point);
    if (pri < bestPri || (pri === bestPri && d < bestDist)) {
      best = c;
      bestPri = pri;
      bestDist = d;
    }
  }
  return best;
}

function collectEntityCandidates(
  results: SnapResult[],
  entity: CADEntity,
  cursor: WorldPoint,
  modes: Set<SnapMode>,
  aperture: number,
): void {
  switch (entity.type) {
    case 'Line': {
      if (modes.has('endpoint')) {
        tryAdd(results, cursor, entity.start, 'endpoint', entity.id, aperture);
        tryAdd(results, cursor, entity.end, 'endpoint', entity.id, aperture);
      }
      if (modes.has('midpoint')) {
        tryAdd(results, cursor, midpoint(entity.start, entity.end), 'midpoint', entity.id, aperture);
      }
      if (modes.has('nearest')) {
        const np = closestPointOnSegment(cursor, entity.start, entity.end);
        tryAdd(results, cursor, np, 'nearest', entity.id, aperture);
      }
      if (modes.has('perpendicular')) {
        const foot = perpendicularFoot(cursor, entity.start, entity.end);
        if (foot) tryAdd(results, cursor, foot, 'perpendicular', entity.id, aperture);
      }
      break;
    }

    case 'Circle': {
      if (modes.has('center')) {
        tryAdd(results, cursor, entity.center, 'center', entity.id, aperture);
      }
      if (modes.has('quadrant')) {
        for (const q of quadrantPoints(entity.center, entity.radius)) {
          tryAdd(results, cursor, q, 'quadrant', entity.id, aperture);
        }
      }
      if (modes.has('nearest')) {
        const ang = Math.atan2(cursor.y - entity.center.y, cursor.x - entity.center.x);
        const np = {
          x: entity.center.x + entity.radius * Math.cos(ang),
          y: entity.center.y + entity.radius * Math.sin(ang),
        };
        tryAdd(results, cursor, np, 'nearest', entity.id, aperture);
      }
      break;
    }

    case 'Arc': {
      if (modes.has('center')) {
        tryAdd(results, cursor, entity.center, 'center', entity.id, aperture);
      }
      if (modes.has('endpoint')) {
        const sp = {
          x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
          y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
        };
        const ep = {
          x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
          y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
        };
        tryAdd(results, cursor, sp, 'endpoint', entity.id, aperture);
        tryAdd(results, cursor, ep, 'endpoint', entity.id, aperture);
      }
      if (modes.has('nearest')) {
        const ang = Math.atan2(cursor.y - entity.center.y, cursor.x - entity.center.x);
        const np = {
          x: entity.center.x + entity.radius * Math.cos(ang),
          y: entity.center.y + entity.radius * Math.sin(ang),
        };
        tryAdd(results, cursor, np, 'nearest', entity.id, aperture);
      }
      break;
    }

    case 'Polyline': {
      if (modes.has('endpoint') || modes.has('node')) {
        const n = entity.vertices.length;
        const mode: SnapMode = modes.has('endpoint') ? 'endpoint' : 'node';
        tryAdd(results, cursor, entity.vertices[0], mode, entity.id, aperture);
        if (!entity.closed) {
          tryAdd(results, cursor, entity.vertices[n - 1], mode, entity.id, aperture);
        }
        // Intermediate vertices as nodes
        if (modes.has('node')) {
          for (let i = 1; i < n - (entity.closed ? 0 : 1); i++) {
            tryAdd(results, cursor, entity.vertices[i], 'node', entity.id, aperture);
          }
        }
      }
      if (modes.has('midpoint')) {
        for (let i = 0; i < entity.vertices.length - 1; i++) {
          tryAdd(results, cursor, midpoint(entity.vertices[i], entity.vertices[i + 1]), 'midpoint', entity.id, aperture);
        }
        if (entity.closed && entity.vertices.length >= 2) {
          const n = entity.vertices.length;
          tryAdd(results, cursor, midpoint(entity.vertices[n - 1], entity.vertices[0]), 'midpoint', entity.id, aperture);
        }
      }
      if (modes.has('nearest')) {
        for (let i = 0; i < entity.vertices.length - 1; i++) {
          const np = closestPointOnSegment(cursor, entity.vertices[i], entity.vertices[i + 1]);
          tryAdd(results, cursor, np, 'nearest', entity.id, aperture);
        }
      }
      break;
    }

    case 'Rectangle': {
      const corners = [
        entity.corner1,
        { x: entity.corner2.x, y: entity.corner1.y },
        entity.corner2,
        { x: entity.corner1.x, y: entity.corner2.y },
      ];
      if (modes.has('endpoint') || modes.has('node')) {
        const mode: SnapMode = modes.has('endpoint') ? 'endpoint' : 'node';
        for (const c of corners) {
          tryAdd(results, cursor, c, mode, entity.id, aperture);
        }
      }
      if (modes.has('midpoint')) {
        for (let i = 0; i < 4; i++) {
          tryAdd(results, cursor, midpoint(corners[i], corners[(i + 1) % 4]), 'midpoint', entity.id, aperture);
        }
      }
      if (modes.has('nearest')) {
        for (let i = 0; i < 4; i++) {
          const np = closestPointOnSegment(cursor, corners[i], corners[(i + 1) % 4]);
          tryAdd(results, cursor, np, 'nearest', entity.id, aperture);
        }
      }
      break;
    }

    case 'Point': {
      if (modes.has('node')) {
        tryAdd(results, cursor, entity.position, 'node', entity.id, aperture);
      }
      break;
    }

    case 'Text': {
      if (modes.has('node')) {
        tryAdd(results, cursor, entity.position, 'node', entity.id, aperture);
      }
      break;
    }

    case 'Dimension': {
      if (modes.has('endpoint')) {
        tryAdd(results, cursor, entity.p1, 'endpoint', entity.id, aperture);
        tryAdd(results, cursor, entity.p2, 'endpoint', entity.id, aperture);
      }
      break;
    }
  }
}

/** True intersections between linear segments of different entities */
function collectIntersectionCandidates(
  results: SnapResult[],
  entities: CADEntity[],
  cursor: WorldPoint,
  aperture: number,
): void {
  const segs: Array<{ a: WorldPoint; b: WorldPoint; id: string }> = [];
  for (const e of entities) {
    for (const [a, b] of entitySegments(e)) {
      segs.push({ a, b, id: e.id });
    }
  }

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].id === segs[j].id) continue; // skip self-intersections within one entity
      const hit = segmentSegmentIntersection(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (hit) tryAdd(results, cursor, hit, 'intersection', segs[i].id, aperture);
    }
  }
}

function tryAdd(
  results: SnapResult[],
  cursor: WorldPoint,
  point: WorldPoint,
  mode: SnapMode,
  entityId: string,
  aperture: number,
): void {
  const d = distance(cursor, point);
  if (d <= aperture) {
    results.push({ point, mode, entityId });
  }
}
