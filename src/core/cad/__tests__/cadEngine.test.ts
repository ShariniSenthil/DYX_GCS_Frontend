// CAD Engine Core Tests — viewport, geometry, DXF serializer, snap engine

import {
  worldToScreen,
  screenToWorld,
  zoomAt,
  panBy,
  createDefaultViewport,
  computeFitViewport,
} from '../viewport';
import {
  distance,
  midpoint,
  perpendicularFoot,
  angleDeg,
  entitiesBounds,
  segmentSegmentIntersection,
} from '../geometry';
import {
  resolveSnap,
  resolveGridSnap,
  DEFAULT_RUNNING_SNAPS,
} from '../snapEngine';
import {
  resolvePolarTrack,
  resolveOrtho,
} from '../polarTracking';
import {
  parseCADInput,
  resolveParsedInput,
} from '../commandParser';
import {
  createLine,
  createCircle,
  createArc3Point,
  createRectangle,
} from '../entityFactory';
import {
  entitiesToDXF,
} from '../dxfSerializer';
import {
  CADEntity,
  Viewport,
} from '../types';

const EPS = 1e-6;

describe('CAD Viewport', () => {
  const vp: Viewport = { scale: 100, offsetX: 400, offsetY: 300 };

  test('worldToScreen maps origin to viewport offset', () => {
    const s = worldToScreen({ x: 0, y: 0 }, vp);
    expect(s.x).toBeCloseTo(400, EPS);
    expect(s.y).toBeCloseTo(300, EPS);
  });

  test('worldToScreen maps (1,1) with scale and Y-flip', () => {
    const s = worldToScreen({ x: 1, y: 1 }, vp);
    expect(s.x).toBeCloseTo(500, EPS);
    expect(s.y).toBeCloseTo(200, EPS);
  });

  test('screenToWorld is the inverse of worldToScreen', () => {
    const p = { x: 3.5, y: -2.1 };
    const s = worldToScreen(p, vp);
    const back = screenToWorld(s, vp);
    expect(back.x).toBeCloseTo(p.x, EPS);
    expect(back.y).toBeCloseTo(p.y, EPS);
  });

  test('zoomAt preserves the world point under the pivot', () => {
    const pivot = { x: 400, y: 300 };
    const newVp = zoomAt(pivot, 2, vp);
    const worldBefore = screenToWorld(pivot, vp);
    const worldAfter = screenToWorld(pivot, newVp);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, EPS);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, EPS);
  });

  test('panBy shifts offset', () => {
    const newVp = panBy(10, -20, vp);
    expect(newVp.offsetX).toBe(vp.offsetX + 10);
    expect(newVp.offsetY).toBe(vp.offsetY - 20);
  });

  test('computeFitViewport produces valid scale', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 5 };
    const canvas = { width: 800, height: 600 };
    const fitVp = computeFitViewport(bounds, canvas, 50);
    expect(fitVp.scale).toBeGreaterThan(0);
    // The fit should show the whole bounds
    const tlWorld = screenToWorld({ x: 0, y: 0 }, fitVp);
    const brWorld = screenToWorld({ x: 800, y: 600 }, fitVp);
    expect(tlWorld.x).toBeLessThanOrEqual(bounds.minX + EPS);
    expect(brWorld.x).toBeGreaterThanOrEqual(bounds.maxX - EPS);
  });
});

describe('CAD Geometry', () => {
  test('distance computes correctly', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, EPS);
  });

  test('midpoint computes correctly', () => {
    const m = midpoint({ x: 0, y: 0 }, { x: 10, y: 20 });
    expect(m.x).toBe(5);
    expect(m.y).toBe(10);
  });

  test('angleDeg: 0 degrees is East', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, EPS);
  });

  test('angleDeg: 90 degrees is North', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, EPS);
  });

  test('perpendicularFoot projects onto segment', () => {
    const foot = perpendicularFoot({ x: 0.5, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(foot!.x).toBeCloseTo(0.5, EPS);
    expect(foot!.y).toBeCloseTo(0, EPS);
  });

  test('perpendicularFoot clamps to segment endpoints', () => {
    const foot = perpendicularFoot({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(foot!.x).toBeCloseTo(1, EPS);
    expect(foot!.y).toBeCloseTo(0, EPS);
  });

  test('entitiesBounds computes combined bounding box', () => {
    const ents: CADEntity[] = [
      createLine({ x: -5, y: 0 }, { x: 3, y: 0 }),
      createCircle({ x: 2, y: 2 }, 4),
    ];
    const b = entitiesBounds(ents);
    expect(b.minX).toBeLessThanOrEqual(-5);
    expect(b.maxX).toBeGreaterThanOrEqual(6);
    expect(b.maxY).toBeGreaterThanOrEqual(6);
  });
});

describe('CAD Snap Engine', () => {
  const vp: Viewport = { scale: 100, offsetX: 400, offsetY: 300 };

  test('snaps to line endpoint within aperture', () => {
    const line = createLine({ x: 0, y: 0 }, { x: 5, y: 0 });
    // Cursor near (5, 0) endpoint — 0.05 world units = 5px at scale 100
    const snap = resolveSnap({ x: 4.96, y: 0.03 }, [line], new Set(['endpoint']), 12, vp);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(5, EPS);
    expect(snap!.point.y).toBeCloseTo(0, EPS);
    expect(snap!.mode).toBe('endpoint');
  });

  test('snaps to line midpoint', () => {
    const line = createLine({ x: 0, y: 0 }, { x: 10, y: 0 });
    const snap = resolveSnap({ x: 4.98, y: 0.02 }, [line], new Set(['midpoint']), 12, vp);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(5, EPS);
    expect(snap!.mode).toBe('midpoint');
  });

  test('snaps to circle center', () => {
    const circle = createCircle({ x: 3, y: 2 }, 5);
    const snap = resolveSnap({ x: 3.05, y: 2.05 }, [circle], new Set(['center']), 12, vp);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(3, EPS);
    expect(snap!.point.y).toBeCloseTo(2, EPS);
    expect(snap!.mode).toBe('center');
  });

  test('does not snap when too far', () => {
    const line = createLine({ x: 0, y: 0 }, { x: 5, y: 0 });
    const snap = resolveSnap({ x: 20, y: 20 }, [line], new Set(['endpoint']), 12, vp);
    expect(snap).toBeNull();
  });

  test('endpoint beats nearest when both in aperture', () => {
    const line = createLine({ x: 0, y: 0 }, { x: 10, y: 0 });
    // Cursor near endpoint but also on the segment (nearest would also hit)
    const snap = resolveSnap(
      { x: 9.95, y: 0.02 },
      [line],
      new Set(['endpoint', 'nearest']),
      12,
      vp,
    );
    expect(snap).not.toBeNull();
    expect(snap!.mode).toBe('endpoint');
    expect(snap!.point.x).toBeCloseTo(10, EPS);
  });

  test('snaps to true segment intersection', () => {
    const a = createLine({ x: 0, y: 0 }, { x: 10, y: 10 });
    const b = createLine({ x: 0, y: 10 }, { x: 10, y: 0 });
    const snap = resolveSnap(
      { x: 5.02, y: 4.98 },
      [a, b],
      new Set(['intersection']),
      12,
      vp,
    );
    expect(snap).not.toBeNull();
    expect(snap!.mode).toBe('intersection');
    expect(snap!.point.x).toBeCloseTo(5, EPS);
    expect(snap!.point.y).toBeCloseTo(5, EPS);
  });

  test('grid snap locks to spacing within aperture', () => {
    const snap = resolveGridSnap({ x: 1.02, y: 2.98 }, 1, 12, vp);
    expect(snap).not.toBeNull();
    expect(snap!.mode).toBe('grid');
    expect(snap!.point.x).toBeCloseTo(1, EPS);
    expect(snap!.point.y).toBeCloseTo(3, EPS);
  });

  test('default running snaps exclude nearest', () => {
    expect(DEFAULT_RUNNING_SNAPS.has('nearest')).toBe(false);
    expect(DEFAULT_RUNNING_SNAPS.has('endpoint')).toBe(true);
    expect(DEFAULT_RUNNING_SNAPS.has('intersection')).toBe(true);
  });
});

describe('CAD Segment Intersection', () => {
  test('crossing segments intersect', () => {
    const hit = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    );
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(5, EPS);
    expect(hit!.y).toBeCloseTo(5, EPS);
  });

  test('non-overlapping segments do not intersect', () => {
    const hit = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 2, y: 0 }, { x: 3, y: 0 },
    );
    expect(hit).toBeNull();
  });
});

describe('CAD Polar Tracking', () => {
  test('tracks to 90 degrees', () => {
    const result = resolvePolarTrack(
      { x: 0, y: 0 },
      { x: 0.1, y: 5 },
      [0, 30, 45, 60, 90],
      5,
    );
    expect(result).not.toBeNull();
    expect(result!.angle).toBeCloseTo(90, EPS);
    expect(result!.snappedPoint.x).toBeCloseTo(0, EPS);
  });

  test('returns null when not near any tracking angle', () => {
    const result = resolvePolarTrack(
      { x: 0, y: 0 },
      { x: 3, y: 7 },
      [0, 90],
      5,
    );
    expect(result).toBeNull();
  });

  test('ortho constrains to horizontal', () => {
    const result = resolveOrtho({ x: 0, y: 0 }, { x: 5, y: 2 });
    expect(result.x).toBe(5);
    expect(result.y).toBe(0);
  });

  test('ortho constrains to vertical', () => {
    const result = resolveOrtho({ x: 0, y: 0 }, { x: 2, y: 5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(5);
  });
});

describe('CAD Command Parser', () => {
  test('parses absolute coordinate', () => {
    const result = parseCADInput('50,30', null);
    expect(result.kind).toBe('absolute');
    if (result.kind === 'absolute') {
      expect(result.point.x).toBe(50);
      expect(result.point.y).toBe(30);
    }
  });

  test('parses relative cartesian', () => {
    const result = parseCADInput('@12,5', { x: 10, y: 10 });
    expect(result.kind).toBe('relative');
    if (result.kind === 'relative') {
      expect(result.delta.x).toBe(12);
      expect(result.delta.y).toBe(5);
    }
  });

  test('parses relative polar', () => {
    const result = parseCADInput('@50<30', { x: 0, y: 0 });
    expect(result.kind).toBe('polar');
    if (result.kind === 'polar') {
      expect(result.distance).toBe(50);
      expect(result.angle).toBe(30);
    }
  });

  test('parses distance only', () => {
    const result = parseCADInput('25', null);
    expect(result.kind).toBe('distance');
    if (result.kind === 'distance') {
      expect(result.value).toBe(25);
    }
  });

  test('parses close command', () => {
    expect(parseCADInput('c', null)).toEqual({ kind: 'command', name: 'close' });
    expect(parseCADInput('close', null)).toEqual({ kind: 'command', name: 'close' });
  });

  test('parses undo command', () => {
    expect(parseCADInput('u', null)).toEqual({ kind: 'command', name: 'undo' });
  });

  test('resolveParsedInput handles absolute', () => {
    const input = parseCADInput('5,3', null);
    const result = resolveParsedInput(input, null, null);
    expect(result).toEqual({ x: 5, y: 3 });
  });

  test('resolveParsedInput handles relative', () => {
    const input = parseCADInput('@2,1', { x: 10, y: 20 });
    const result = resolveParsedInput(input, { x: 10, y: 20 }, null);
    expect(result).toEqual({ x: 12, y: 21 });
  });
});

describe('CAD DXF Serializer', () => {
  test('serializes a LINE entity to DXF', () => {
    const ents: CADEntity[] = [
      createLine({ x: 0, y: 0 }, { x: 5, y: 3 }),
    ];
    const dxf = entitiesToDXF(ents, [], 'm');
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('ENDSEC');
    expect(dxf).toContain('EOF');
  });

  test('serializes a CIRCLE entity', () => {
    const ents: CADEntity[] = [
      createCircle({ x: 2, y: 2 }, 5),
    ];
    const dxf = entitiesToDXF(ents);
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('2');     // center X/Y
    expect(dxf).toContain('5');     // radius
  });

  test('serializes multiple entities', () => {
    const ents: CADEntity[] = [
      createLine({ x: 0, y: 0 }, { x: 1, y: 1 }),
      createCircle({ x: 5, y: 5 }, 2),
      createRectangle({ x: 0, y: 0 }, { x: 10, y: 10 }),
    ];
    const dxf = entitiesToDXF(ents);
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('LWPOLYLINE');
  });

  test('serializes an ARC entity', () => {
    const ents: CADEntity[] = [
      createArc3Point({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }),
    ];
    const dxf = entitiesToDXF(ents);
    expect(dxf).toContain('ARC');
    expect(dxf).toContain('50'); // start angle group code
    expect(dxf).toContain('51'); // end angle group code
  });

  test('includes layer table', () => {
    const ents: CADEntity[] = [createLine({ x: 0, y: 0 }, { x: 1, y: 0 }, 'MARK')];
    const dxf = entitiesToDXF(ents, [
      { id: 'l1', name: 'MARK', color: '#3B82F6', visible: true, locked: false },
    ]);
    expect(dxf).toContain('LAYER');
    expect(dxf).toContain('MARK');
  });
});

describe('CAD Entity Factory', () => {
  test('createLine stores start and end', () => {
    const e = createLine({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(e.type).toBe('Line');
    if (e.type === 'Line') {
      expect(e.start).toEqual({ x: 1, y: 2 });
      expect(e.end).toEqual({ x: 3, y: 4 });
    }
  });

  test('createCircle stores center and radius', () => {
    const e = createCircle({ x: 5, y: 5 }, 3);
    expect(e.type).toBe('Circle');
    if (e.type === 'Circle') {
      expect(e.center).toEqual({ x: 5, y: 5 });
      expect(e.radius).toBe(3);
    }
  });

  test('createArc3Point computes valid center and radius', () => {
    const e = createArc3Point({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 });
    expect(e.type).toBe('Arc');
    if (e.type === 'Arc') {
      // The three points are on a circle of radius 2 centered at (2, 0)
      expect(e.center.x).toBeCloseTo(2, EPS);
      expect(e.center.y).toBeCloseTo(0, EPS);
      expect(e.radius).toBeCloseTo(2, EPS);
    }
  });

  test('createRectangle stores corners', () => {
    const e = createRectangle({ x: 0, y: 0 }, { x: 5, y: 3 });
    expect(e.type).toBe('Rectangle');
    if (e.type === 'Rectangle') {
      expect(e.corner1).toEqual({ x: 0, y: 0 });
      expect(e.corner2).toEqual({ x: 5, y: 3 });
    }
  });
});
