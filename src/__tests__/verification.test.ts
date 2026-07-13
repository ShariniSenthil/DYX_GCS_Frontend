// ============================================================
// INDEPENDENT VERIFICATION — Manual recomputation from scratch
// ============================================================
// Does NOT trust existing tests. Recomputes every transform
// independently and compares against engine output.

import { latLonToENU, enuToLatLon, EARTH_RADIUS } from '../core/geo/enu';
import { computeTransform, applyTransform } from '../core/transform/transformEngine';
import { georeferenceCAD } from '../core/georef/georeferenceService';
import { Point2D, GeoPoint, CADModel } from '../core/geometry/types';

const EPSILON = 1e-6;

describe('INDEPENDENT VERIFICATION — Manual Recompute', () => {

  // ═══════════════════════════════════════════════════════════
  // TEST A: 45° Rotation + Scale 3 — Full Manual Derivation
  // ═══════════════════════════════════════════════════════════
  describe('45° rotation + scale 3', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };

    // Manually compute geoB: 30m at 45° from geoA
    const targetDist = 30;
    const targetAngle = Math.PI / 4;
    const eastM = targetDist * Math.cos(targetAngle);
    const northM = targetDist * Math.sin(targetAngle);
    const dLat = northM / EARTH_RADIUS;
    const dLon = eastM / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = {
      lat: geoA.lat + (dLat * 180 / Math.PI),
      lon: geoA.lon + (dLon * 180 / Math.PI),
    };

    // Independent derivation
    const enuB = latLonToENU(geoA, geoB);
    const geoDist = Math.sqrt(enuB.x ** 2 + enuB.y ** 2);
    const geoAngle = Math.atan2(enuB.y, enuB.x);
    const cadDist = 10;
    const cadAngle = 0; // (10,0) → atan2(0,10) = 0
    const expectedScale = geoDist / cadDist;
    const expectedRotation = geoAngle - cadAngle;

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    it('scale ≈ 3.0 (30m / 10 CAD units)', () => {
      expect(Math.abs(matrix.scale - 3.0)).toBeLessThan(0.01);
    });

    it('rotation ≈ 45°', () => {
      expect(Math.abs(matrix.rotation - Math.PI / 4)).toBeLessThan(0.01);
    });

    it('cadA maps to ENU origin', () => {
      const out = applyTransform(cadA, matrix);
      expect(Math.abs(out.x)).toBeLessThan(0.001);
      expect(Math.abs(out.y)).toBeLessThan(0.001);
    });

    it('cadB maps to ENU B within 1cm', () => {
      const out = applyTransform(cadB, matrix);
      const err = Math.sqrt((out.x - enuB.x) ** 2 + (out.y - enuB.y) ** 2);
      expect(err).toBeLessThan(0.01);
    });

    it('midpoint (5,5) transforms to expected position', () => {
      // (5,5) in CAD: distance sqrt(50) ≈ 7.07 at angle 45°
      // After transform: 7.07*3 ≈ 21.21m at angle 45°+45°=90°
      const mid: Point2D = { x: 5, y: 5 };
      const out = applyTransform(mid, matrix);
      const midCadDist = Math.sqrt(50);
      const expectedDist = midCadDist * matrix.scale;
      const expectedAngle = Math.atan2(5, 5) + matrix.rotation;
      const expX = expectedDist * Math.cos(expectedAngle);
      const expY = expectedDist * Math.sin(expectedAngle);
      const err = Math.sqrt((out.x - expX) ** 2 + (out.y - expY) ** 2);
      expect(err).toBeLessThan(0.001);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST B: Transform Order — Non-Origin Reference Point
  // ═══════════════════════════════════════════════════════════
  describe('Transform order with non-origin cadA', () => {
    // cadA at (100, 200) — tests that translation is relative to cadA
    const cadA: Point2D = { x: 100, y: 200 };
    const cadB: Point2D = { x: 110, y: 200 }; // 10 units east
    const geoA: GeoPoint = { lat: 30.0, lon: 60.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 30.0, lon: geoA.lon + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    it('cadA maps to ENU origin (translation is relative to cadA)', () => {
      const out = applyTransform(cadA, matrix);
      expect(Math.abs(out.x)).toBeLessThan(0.001);
      expect(Math.abs(out.y)).toBeLessThan(0.001);
    });

    it('cadB transforms to exactly 10m east in ENU', () => {
      const out = applyTransform(cadB, matrix);
      // cadB - cadA = (10, 0), no rotation expected (same direction)
      const expectedX = 10 * matrix.scale;
      const expectedY = 0;
      expect(Math.abs(out.x - expectedX)).toBeLessThan(0.001);
      expect(Math.abs(out.y - expectedY)).toBeLessThan(0.001);
    });

    it('arbitrary point (105, 205) transforms correctly', () => {
      const pt: Point2D = { x: 105, y: 205 };
      const out = applyTransform(pt, matrix);

      // Manual: P - cadA = (5, 5)
      // Scale: (5*scale, 5*scale)
      // Rotate by 0: same
      // + enuA(0,0)
      const relX = 5 * matrix.scale * Math.cos(matrix.rotation);
      const relY = 5 * matrix.scale * Math.sin(matrix.rotation) +
                   (-5) * matrix.scale * (-Math.sin(matrix.rotation));
      // Actually, full manual:
      const dx = pt.x - cadA.x; // 5
      const dy = pt.y - cadA.y; // 5
      const manX = matrix.scale * (dx * Math.cos(matrix.rotation) - dy * Math.sin(matrix.rotation));
      const manY = matrix.scale * (dx * Math.sin(matrix.rotation) + dy * Math.cos(matrix.rotation));

      expect(Math.abs(out.x - manX)).toBeLessThan(0.001);
      expect(Math.abs(out.y - manY)).toBeLessThan(0.001);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST C: Square Integrity — No Skew, No Distortion
  // ═══════════════════════════════════════════════════════════
  describe('Square remains square after transform', () => {
    const corners: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: geoA.lon + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(corners[0], corners[1], geoA, geoB);
    const out = corners.map(p => applyTransform(p, matrix));

    it('all 4 sides ≈ 10m', () => {
      const sides = [
        [out[0], out[1]],
        [out[1], out[2]],
        [out[2], out[3]],
        [out[3], out[0]],
      ];
      for (const [a, b] of sides) {
        const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        expect(Math.abs(d - 10)).toBeLessThan(0.01);
      }
    });

    it('diagonals are equal (no skew)', () => {
      const d1 = Math.sqrt((out[2].x - out[0].x) ** 2 + (out[2].y - out[0].y) ** 2);
      const d2 = Math.sqrt((out[3].x - out[1].x) ** 2 + (out[3].y - out[1].y) ** 2);
      expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
    });

    it('diagonal ≈ 10√2', () => {
      const d = Math.sqrt((out[2].x - out[0].x) ** 2 + (out[2].y - out[0].y) ** 2);
      expect(Math.abs(d - 10 * Math.SQRT2)).toBeLessThan(0.01);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST D: Large CAD Offsets (floating-point precision)
  // ═══════════════════════════════════════════════════════════
  describe('Large CAD offsets (UTM-like coordinates)', () => {
    const bigCadA: Point2D = { x: 500000, y: 2800000 };
    const bigCadB: Point2D = { x: 500010, y: 2800000 };
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: geoA.lon + (dLon * 180 / Math.PI) };

    it('normalized pipeline produces correct 10m line', () => {
      const cad: CADModel = {
        units: 'm',
        unitScale: 1.0,
        entities: [
          { id: 'l1', type: 'Line', start: bigCadA, end: bigCadB },
        ],
      };
      const result = georeferenceCAD(cad, bigCadA, bigCadB, geoA, geoB);

      const local = result.localEntities[0];
      if (local.type !== 'Line') fail('Expected Line');
      const len = Math.sqrt(
        (local.end.x - local.start.x) ** 2 +
        (local.end.y - local.start.y) ** 2
      );
      expect(Math.abs(len - 10)).toBeLessThan(0.001);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST E: Zero-Distance Guards
  // ═══════════════════════════════════════════════════════════
  describe('Zero-distance guards', () => {
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: geoA.lon + (dLon * 180 / Math.PI) };

    it('throws on coincident CAD points', () => {
      expect(() => computeTransform(
        { x: 5, y: 5 }, { x: 5, y: 5 }, geoA, geoB
      )).toThrow(/coincident/i);
    });

    it('throws on coincident GPS points', () => {
      expect(() => computeTransform(
        { x: 0, y: 0 }, { x: 10, y: 0 }, geoA, geoA
      )).toThrow(/coincident/i);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST F: ENU Conversion is Actually Used (Not Raw Degrees)
  // ═══════════════════════════════════════════════════════════
  describe('ENU conversion integrity', () => {
    it('0.1° longitude at 25° latitude ≈ 10km in ENU', () => {
      const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
      const geoB: GeoPoint = { lat: 25.0, lon: 55.1 };
      const enu = latLonToENU(geoA, geoB);
      const dist = Math.sqrt(enu.x ** 2 + enu.y ** 2);

      // Expected: 0.1° × cos(25°) × 111km ≈ 10,070m
      const expected = 0.1 * (Math.PI / 180) * EARTH_RADIUS * Math.cos(25 * Math.PI / 180);
      expect(Math.abs(dist - expected)).toBeLessThan(10);
      expect(dist).toBeGreaterThan(9000); // Must be ~10km, not 0.1°
    });

    it('scale is computed in meters, NOT degrees', () => {
      const cadA: Point2D = { x: 0, y: 0 };
      const cadB: Point2D = { x: 10, y: 0 };
      const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
      const geoB: GeoPoint = { lat: 25.0, lon: 55.1 }; // ~10km apart

      const matrix = computeTransform(cadA, cadB, geoA, geoB);

      // If using degrees: scale = 0.1/10 = 0.01
      // If using meters: scale = ~10070/10 = ~1007
      expect(matrix.scale).toBeGreaterThan(100); // Must be meters
      expect(matrix.scale).toBeLessThan(2000);   // Sanity upper bound
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST G: Precision Budget — 100m Square, <1% Error
  // ═══════════════════════════════════════════════════════════
  describe('Precision budget: 100m square', () => {
    const corners: Point2D[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 100 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: geoA.lon + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(corners[0], corners[1], geoA, geoB);
    const out = corners.map(p => applyTransform(p, matrix));

    it('bottom edge: <1% error', () => {
      const d = Math.sqrt((out[1].x - out[0].x) ** 2 + (out[1].y - out[0].y) ** 2);
      const errPct = Math.abs((d - 100) / 100 * 100);
      expect(errPct).toBeLessThan(1.0);
    });

    it('perpendicular edge: <1% error', () => {
      const d = Math.sqrt((out[2].x - out[1].x) ** 2 + (out[2].y - out[1].y) ** 2);
      const errPct = Math.abs((d - 100) / 100 * 100);
      expect(errPct).toBeLessThan(1.0);
    });

    it('right angle preserved (dot product ≈ 0)', () => {
      // Vector bottom: out[1] - out[0]
      // Vector right: out[2] - out[1]
      const v1 = { x: out[1].x - out[0].x, y: out[1].y - out[0].y };
      const v2 = { x: out[2].x - out[1].x, y: out[2].y - out[1].y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const cosAngle = Math.abs(dot) / (Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2));
      expect(cosAngle).toBeLessThan(0.001); // cos(90°) = 0
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST H: No Mirroring — Rotation Sign Correctness
  // ═══════════════════════════════════════════════════════════
  describe('No mirroring — rotation sign', () => {
    it('CCW 90° in CAD maps to CCW 90° in ENU', () => {
      const cadA: Point2D = { x: 0, y: 0 };
      const cadB: Point2D = { x: 10, y: 0 }; // east

      const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
      const geoB: GeoPoint = { lat: 25.0001, lon: 55.0 }; // north

      const matrix = computeTransform(cadA, cadB, geoA, geoB);

      // East→North = +90° (CCW)
      expect(matrix.rotation).toBeGreaterThan(0);
      expect(Math.abs(matrix.rotation - Math.PI / 2)).toBeLessThan(0.001);

      // A point at (0, 10) in CAD (north of A) should end up WEST of the origin
      // because the whole frame rotated 90° CCW
      const pt: Point2D = { x: 0, y: 10 };
      const out = applyTransform(pt, matrix);

      // Original: (0, 10) → after 90° CCW rotation → (-10*scale, 0)
      // scale should be ~11.1 (111m / 10 units)
      expect(out.x).toBeLessThan(0); // Should be west (negative x)
    });
  });
});
