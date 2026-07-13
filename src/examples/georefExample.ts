// ============================================================
// Example Usage — CAD Georeferencing Engine
// ============================================================
//
// This file demonstrates how to use the engine in your GCS app.
// It is NOT production code — it's a runnable example.
//
// Run with: npx ts-node src/examples/georefExample.ts
// Or adapt for your React UI as needed.

import { importAndAlign, toScreenEntities } from '../application';
import {
  latLonToENU,
  enuToLatLon,
  enuDistance,
  EARTH_RADIUS,
} from '../core/geo/enu';
import { GeoPoint, Point2D } from '../core/geometry/types';

// ============================================================
// Scenario: You have a site-plan DXF of a 100m × 50m building.
// You know two corners map to specific GPS coordinates.
// ============================================================

async function runExample() {
  console.log('=== CAD Georeferencing Engine — Example ===\n');

  // ── Step 1: Simulate DXF content (in production, read from file) ──
  // For this example, we use the mock model (a 10×10 square).
  // In production: const dxfContent = await readFile('site_plan.dxf', 'utf-8');
  const dxfContent: string | undefined = undefined; // use mock

  // ── Step 2: User clicks 2 points on the CAD drawing ──
  // In your UI, these come from canvas tap events
  const cadPointA: Point2D = { x: 0, y: 0 };     // bottom-left corner
  const cadPointB: Point2D = { x: 10, y: 0 };    // bottom-right corner

  // ── Step 3: User provides GPS for those 2 points ──
  // In your UI, these come from map pins or GPS device
  const geoPointA: GeoPoint = { lat: 25.197191, lon: 55.274376 }; // Dubai, building corner
  const geoPointB: GeoPoint = { lat: 25.197281, lon: 55.274486 }; // ~15m away

  // ── Step 4: Run the pipeline ──
  console.log('📐 CAD Reference Points:');
  console.log(`   A: (${cadPointA.x}, ${cadPointA.y})`);
  console.log(`   B: (${cadPointB.x}, ${cadPointB.y})`);
  console.log('\n🌍 GPS Reference Points:');
  console.log(`   A: (${geoPointA.lat}, ${geoPointA.lon})`);
  console.log(`   B: (${geoPointB.lat}, ${geoPointB.lon})`);

  const result = await importAndAlign({
    dxfContent,
    cadPoints: [cadPointA, cadPointB],
    geoPoints: [geoPointA, geoPointB],
  });

  // ── Step 5: Inspect results ──
  console.log('\n📊 Results:');
  console.log(`   CAD entities:   ${result.cadEntities.length}`);
  console.log(`   Local (meters): ${result.localEntities.length}`);
  console.log(`   Geo (lat/lon):  ${result.geoEntities.length}`);

  // ── Step 6: Verify distances ──
  console.log('\n📏 Distance Verification:');
  for (const entity of result.geoEntities) {
    if (entity.type !== 'Line') continue;

    const e1 = latLonToENU(geoPointA, entity.geoStart);
    const e2 = latLonToENU(geoPointA, entity.geoEnd);
    const dist = enuDistance(e1, e2);

    console.log(`   ${entity.id}: ${dist.toFixed(2)} meters`);
  }

  // ── Step 7: Convert to screen coordinates for rendering ──
  const screenEntities = toScreenEntities(result.cadEntities, {
    width: 800,
    height: 600,
    padding: 40,
  });

  console.log('\n🖥️  Screen Entities (for canvas rendering):');
  for (const se of screenEntities) {
    if (se.screenPoints.length >= 2) {
      console.log(
        `   ${se.id}: (${se.screenPoints[0].x.toFixed(0)}, ${se.screenPoints[0].y.toFixed(0)}) → (${se.screenPoints[1].x.toFixed(0)}, ${se.screenPoints[1].y.toFixed(0)})`
      );
    }
  }

  // ── Step 8: Show first geo entity coordinates ──
  console.log('\n🗺️  First Geo Entity (lat/lon):');
  const firstGeo = result.geoEntities[0];
  if (firstGeo.type === 'Line') {
    console.log(`   Start: (${firstGeo.geoStart.lat.toFixed(6)}, ${firstGeo.geoStart.lon.toFixed(6)})`);
    console.log(`   End:   (${firstGeo.geoEnd.lat.toFixed(6)}, ${firstGeo.geoEnd.lon.toFixed(6)})`);
  }

  console.log('\n✅ Example complete. Integrate into your GCS UI as needed.');
}

// Run if executed directly
runExample().catch((err) => {
  console.error('❌ Example failed:', err);
  process.exit(1);
});
