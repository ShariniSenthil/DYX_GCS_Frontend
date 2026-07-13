// ============================================================
// Entity Factory — create CADEntities from tool + point sequences
// ============================================================

import { CADEntity, WorldPoint, ArcMethod } from './types';
import { angleRad } from './geometry';

let idCounter = 0;
export function generateId(prefix: string = 'e'): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

export function createLine(start: WorldPoint, end: WorldPoint, layer: string = '0'): CADEntity {
  return { type: 'Line', id: generateId('line'), layer, start, end };
}

export function createCircle(center: WorldPoint, radius: number, layer: string = '0'): CADEntity {
  return { type: 'Circle', id: generateId('circle'), layer, center, radius: Math.max(0.001, radius) };
}

export function createArc3Point(start: WorldPoint, mid: WorldPoint, end: WorldPoint, layer: string = '0'): CADEntity {
  // Compute arc center + radius from 3 points on the circumference
  const ax = start.x, ay = start.y;
  const bx = mid.x, by = mid.y;
  const cx = end.x, cy = end.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) {
    // Points are collinear — degenerate to a line
    return createLine(start, end, layer);
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

  const center = { x: ux, y: uy };
  const radius = Math.hypot(ax - ux, ay - uy);
  const startAngle = angleRad(center, start);
  const endAngle = angleRad(center, end);

  return { type: 'Arc', id: generateId('arc'), layer, center, radius, startAngle, endAngle };
}

export function createArcStartCenterEnd(start: WorldPoint, center: WorldPoint, end: WorldPoint, layer: string = '0'): CADEntity {
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const startAngle = angleRad(center, start);
  const endAngle = angleRad(center, end);
  return { type: 'Arc', id: generateId('arc'), layer, center, radius, startAngle, endAngle };
}

export function createRectangle(corner1: WorldPoint, corner2: WorldPoint, layer: string = '0'): CADEntity {
  return { type: 'Rectangle', id: generateId('rect'), layer, corner1, corner2 };
}

export function createPolyline(vertices: WorldPoint[], closed: boolean = false, layer: string = '0'): CADEntity {
  return {
    type: 'Polyline',
    id: generateId('pline'),
    layer,
    vertices,
    closed,
    bulges: new Array(vertices.length).fill(0),
  };
}

export function createPoint(position: WorldPoint, layer: string = '0'): CADEntity {
  return { type: 'Point', id: generateId('pt'), layer, position };
}

export function createText(position: WorldPoint, content: string, height: number = 1, rotation: number = 0, layer: string = '0'): CADEntity {
  return { type: 'Text', id: generateId('txt'), layer, position, content, height, rotation };
}

export function createDimension(p1: WorldPoint, p2: WorldPoint, offset: number, text: string, layer: string = '0'): CADEntity {
  return { type: 'Dimension', id: generateId('dim'), layer, p1, p2, offset, text };
}

/** Compute arc from start point, end point, and radius (AutoCAD Start-End-Radius) */
export function createArcStartEndRadius(
  start: WorldPoint, end: WorldPoint, radius: number,
  ccw: boolean = true, layer: string = '0',
): CADEntity {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (chord < 1e-10 || radius * 2 < chord) {
    return createLine(start, end, layer);
  }

  // Midpoint of the chord
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;

  // Distance from chord midpoint to arc center
  const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));

  // Perpendicular direction to the chord
  const dx = (end.x - start.x) / chord;
  const dy = (end.y - start.y) / chord;
  const perpX = -dy;
  const perpY = dx;

  // Center is on the perpendicular bisector; sign depends on CCW/CW
  const sign = ccw ? 1 : -1;
  const center = { x: mx + sign * perpX * h, y: my + sign * perpY * h };

  const startAngle = angleRad(center, start);
  const endAngle = angleRad(center, end);

  return { type: 'Arc', id: generateId('arc'), layer, center, radius, startAngle, endAngle };
}
