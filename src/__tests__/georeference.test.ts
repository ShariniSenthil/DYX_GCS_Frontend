// ============================================================
// CAD Georeferencing Engine — Test Suite
// ============================================================
//
// Tests verify:
//   1. ENU conversion correctness
//   2. 2-point transform math (scale, rotation, translation)
//   3. Full pipeline: 10×10 CAD square → real GPS points
//   4. Distance preservation after transform
//   5. Error handling for edge cases
//
// Run with: npx jest src/__tests__/georeference.test.ts

import {
  latLonToENU,
  enuToLatLon,
  enuDistance,
  EARTH_RADIUS,
} from '../core/geo/enu';
import {
  computeTransform,
  applyTransform,
} from '../core/transform/transformEngine';
import { georeferenceCAD } from '../core/georef/georeferenceService';
import { createMockCADModel } from '../core/parser/dxfParser';
import { importAndAlignSync } from '../application/usecases/importAndAlign';
import {
  Point2D,
  GeoPoint,
  CADModel,
  GeorefResult,
} from '../core/geometry/types';

// ============================================================
// Tolerance for floating-point comparisons
// ============================================================
const EPSILON = 1e-6;       // tight tolerance for exact math
const EPSILON_METERS = 0.01; // 1 cm tolerance for geographic conversions

function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

// ============================================================
// TEST 1: ENU Conversion
// ============================================================

describe('ENU Conversion', () => {
  test('origin maps to (0, 0)', () => {
    const origin: GeoPoint = { lat: 25.0, lon: 55.0 };
    const enu = latLonToENU(origin, origin);
    expect(approxEqual(enu.x, 0)).toBe(true);
    expect(approxEqual(enu.y, 0)).toBe(true);
  });

  test('1 degree latitude ≈ 111 km north', () => {
    const origin: GeoPoint = { lat: 25.0, lon: 55.0 };
    const north: GeoPoint = { lat: 26.0, lon: 55.0 };
    const enu = latLonToENU(origin, north);

    const expectedMeters = (Math.PI / 180) * EARTH_RADIUS;
    expect(approxEqual(enu.y, expectedMeters, 1)).toBe(true);
    expect(approxEqual(enu.x, 0, 1)).toBe(true);
  });

  test('roundtrip: lat/lon → ENU → lat/lon returns original', () => {
    const origin: GeoPoint = { lat: 25.123, lon: 55.456 };
    const point: GeoPoint = { lat: 25.125, lon: 55.458 };

    const enu = latLonToENU(origin, point);
    const back = enuToLatLon(origin, enu);

    // ENU is a local tangent-plane approximation — sub-millimeter accuracy
    expect(approxEqual(back.lat, point.lat, 1e-6)).toBe(true);
    expect(approxEqual(back.lon, point.lon, 1e-6)).toBe(true);
  });

  test('ENU distance between two nearby points is reasonable', () => {
    // Two points ~100m apart
    const origin: GeoPoint = { lat: 25.0, lon: 55.0 };
    const p1: GeoPoint = { lat: 25.0, lon: 55.0 };
    const p2: GeoPoint = { lat: 25.0005, lon: 55.0005 }; // ~55.5m N + ~45.3m E

    const e1 = latLonToENU(origin, p1);
    const e2 = latLonToENU(origin, p2);
    const dist = enuDistance(e1, e2);

    // sqrt(55.5^2 + 45.3^2) ≈ 71.6m
    expect(dist).toBeGreaterThan(65);
    expect(dist).toBeLessThan(80);
  });
});

// ============================================================
// TEST 2: Transform Engine — 2-Point Alignment
// ============================================================

describe('Transform Engine', () => {
  test('identity: same-scale points yield scale ≈ 1', () => {
    // CAD square 10×10 maps to ENU square 10×10
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    // Create geo points that are exactly 10m apart in ENU
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    // Move east by 10 meters
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    expect(approxEqual(matrix.scale, 1.0, 1e-6)).toBe(true);
    expect(approxEqual(matrix.rotation, 0, 1e-6)).toBe(true);
  });

  test('scale: CAD 10 units → 20 meters yields scale = 2', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    // 20 meters east
    const dLon = 20 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    expect(approxEqual(matrix.scale, 2.0, 1e-5)).toBe(true);
  });

  test('rotation: CAD horizontal → ENU vertical yields ≈ 90° rotation', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 }; // horizontal right

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const geoB: GeoPoint = { lat: 25.0001, lon: 55.0 }; // straight north

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    // Expected: 90° (π/2) rotation
    expect(approxEqual(matrix.rotation, Math.PI / 2, 1e-6)).toBe(true);
  });

  test('translation: CAD origin maps to geo origin (ENU)', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    // cadA should map to ENU origin (0, 0) since geoA is the ENU origin
    const transformed = applyTransform(cadA, matrix);
    expect(approxEqual(transformed.x, 0, 1e-6)).toBe(true);
    expect(approxEqual(transformed.y, 0, 1e-6)).toBe(true);
  });

  test('cadB maps to correct ENU position after transform', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);
    const transformedB = applyTransform(cadB, matrix);

    // Should be at (10, 0) in ENU (10 meters east of origin)
    expect(approxEqual(transformedB.x, 10, 0.01)).toBe(true);
    expect(approxEqual(transformedB.y, 0, 0.01)).toBe(true);
  });

  test('throws error for coincident CAD points', () => {
    const cadA: Point2D = { x: 5, y: 5 };
    const cadB: Point2D = { x: 5, y: 5 }; // same point!
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const geoB: GeoPoint = { lat: 25.001, lon: 55.001 };

    expect(() => computeTransform(cadA, cadB, geoA, geoB)).toThrow(
      /coincident/i
    );
  });

  test('throws error for coincident GPS points', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 }; // same point!

    expect(() => computeTransform(cadA, cadB, geoA, geoB)).toThrow(
      /coincident/i
    );
  });
});

// ============================================================
// TEST 3: Full Pipeline — 10×10 CAD Square → GPS
// ============================================================

describe('Full Georeferencing Pipeline', () => {
  // Create a 10×10 square in CAD space
  function createSquareCADModel(): CADModel {
    return {
      units: 'm',
      unitScale: 1.0,
      entities: [
        {
          id: 'sq_bottom',
          type: 'Line',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        {
          id: 'sq_right',
          type: 'Line',
          start: { x: 10, y: 0 },
          end: { x: 10, y: 10 },
        },
        {
          id: 'sq_top',
          type: 'Line',
          start: { x: 10, y: 10 },
          end: { x: 0, y: 10 },
        },
        {
          id: 'sq_left',
          type: 'Line',
          start: { x: 0, y: 10 },
          end: { x: 0, y: 0 },
        },
      ],
    };
  }

  test('10×10 square maps to real GPS with correct distances', () => {
    const cad = createSquareCADModel();

    // User picks bottom-left and bottom-right corners of the square
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    // These map to real GPS coordinates ~10m apart
    const geoA: GeoPoint = { lat: 25.123456, lon: 55.654321 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.123456, lon: 55.654321 + (dLon * 180 / Math.PI) };

    const result = georeferenceCAD(cad, cadA, cadB, geoA, geoB);

    // Verify geo entities were produced
    expect(result.geoEntities.length).toBe(4);

    // Check bottom edge: should be ~10 meters in real world
    const bottomEdge = result.geoEntities.find((e) => e.id === 'sq_bottom')!;
    if (bottomEdge.type !== 'Line') fail('Expected Line entity');

    // Compute distance between geoStart and geoEnd in ENU
    const eStart = latLonToENU(geoA, bottomEdge.geoStart);
    const eEnd = latLonToENU(geoA, bottomEdge.geoEnd);
    const distance = enuDistance(eStart, eEnd);

    expect(approxEqual(distance, 10, 0.1)).toBe(true); // within 10cm
  });

  test('square corners map to correct lat/lon', () => {
    const cad = createSquareCADModel();

    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    // 10m east, 10m north for B (diagonal — tests rotation too)
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const dLat = 10 / EARTH_RADIUS;
    const geoB: GeoPoint = {
      lat: 25.0 + (dLat * 180 / Math.PI),
      lon: 55.0 + (dLon * 180 / Math.PI),
    };

    const result = georeferenceCAD(cad, cadA, cadB, geoA, geoB);

    // Bottom-left corner should be at geoA
    const bottomEdge = result.geoEntities.find((e) => e.id === 'sq_bottom')!;
    if (bottomEdge.type !== 'Line') fail('Expected Line entity');

    expect(approxEqual(bottomEdge.geoStart.lat, geoA.lat, 1e-8)).toBe(true);
    expect(approxEqual(bottomEdge.geoStart.lon, geoA.lon, 1e-8)).toBe(true);

    // Bottom-right corner should be at geoB
    expect(approxEqual(bottomEdge.geoEnd.lat, geoB.lat, 1e-8)).toBe(true);
    expect(approxEqual(bottomEdge.geoEnd.lon, geoB.lon, 1e-8)).toBe(true);
  });

  test('all four sides have ~10m length after transform', () => {
    const cad = createSquareCADModel();

    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const result = georeferenceCAD(cad, cadA, cadB, geoA, geoB);

    for (const entity of result.geoEntities) {
      if (entity.type !== 'Line') continue;

      const e1 = latLonToENU(geoA, entity.geoStart);
      const e2 = latLonToENU(geoA, entity.geoEnd);
      const dist = enuDistance(e1, e2);

      expect(dist).toBeGreaterThan(9.5);
      expect(dist).toBeLessThan(10.5);
    }
  });

  test('local entities are in meters (not CAD units)', () => {
    const cad = createSquareCADModel();

    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 };

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    // Scale = 2 (10 CAD units → 20 meters)
    const dLon = 20 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const result = georeferenceCAD(cad, cadA, cadB, geoA, geoB);

    // First line in local space should span ~20 meters
    const firstLocal = result.localEntities[0];
    if (firstLocal.type !== 'Line') fail('Expected Line entity');

    const localDist = Math.sqrt(
      (firstLocal.end.x - firstLocal.start.x) ** 2 +
      (firstLocal.end.y - firstLocal.start.y) ** 2
    );

    expect(approxEqual(localDist, 20, 0.1)).toBe(true);
  });
});

// ============================================================
// TEST 4: Application Use Case
// ============================================================

describe('importAndAlign (Application Use Case)', () => {
  test('sync version returns valid georeferenced result', () => {
    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    const dLon = 10 / (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));
    const geoB: GeoPoint = { lat: 25.0, lon: 55.0 + (dLon * 180 / Math.PI) };

    const result = importAndAlignSync({
      cadPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      geoPoints: [geoA, geoB],
    });

    expect(result.geoEntities.length).toBeGreaterThan(0);
    expect(result.cadEntities.length).toBeGreaterThan(0);
    expect(result.localEntities.length).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 5: Rotation + Scale Combined
// ============================================================

describe('Combined Rotation + Scale', () => {
  test('CAD square rotated 45° with scale 3 maps correctly', () => {
    const cadA: Point2D = { x: 0, y: 0 };
    const cadB: Point2D = { x: 10, y: 0 }; // horizontal

    const geoA: GeoPoint = { lat: 25.0, lon: 55.0 };
    // 30 meters at 45° (NE direction)
    const distMeters = 30;
    const angle45 = Math.PI / 4;
    const dLat = (distMeters * Math.sin(angle45)) / EARTH_RADIUS;
    const dLon = (distMeters * Math.cos(angle45)) /
      (EARTH_RADIUS * Math.cos(geoA.lat * Math.PI / 180));

    const geoB: GeoPoint = {
      lat: 25.0 + (dLat * 180 / Math.PI),
      lon: 55.0 + (dLon * 180 / Math.PI),
    };

    const matrix = computeTransform(cadA, cadB, geoA, geoB);

    // Scale should be 3 (30m / 10 CAD units)
    expect(approxEqual(matrix.scale, 3.0, 0.01)).toBe(true);
    // Rotation should be ~45° (π/4)
    expect(approxEqual(matrix.rotation, Math.PI / 4, 0.01)).toBe(true);

    // Verify cadB maps to the correct ENU position
    const transformedB = applyTransform(cadB, matrix);
    const expectedENU = latLonToENU(geoA, geoB);

    expect(approxEqual(transformedB.x, expectedENU.x, 0.1)).toBe(true);
    expect(approxEqual(transformedB.y, expectedENU.y, 0.1)).toBe(true);
  });
});

console.log('✅ All georeferencing tests defined. Run with: npx jest');
