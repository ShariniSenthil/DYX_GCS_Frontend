// ============================================================
// importAndAlign — Application Use Case
// ============================================================
//
// This is the entry point your UI code calls. It orchestrates:
//   1. Parse DXF string → CADModel
//   2. Accept 2 CAD points + 2 GPS points from user
//   3. Run georeferencing pipeline
//   4. Return aligned entities ready for rendering
//
// This module lives in /application — it bridges core math
// with application-level concerns (error handling, logging).

import { GeoPoint, Point2D, GeorefResult } from '../../core/geometry/types';
import { parseDXF, createMockCADModel } from '../../core/parser/dxfParser';
import { georeferenceCAD } from '../../core/georef/georeferenceService';

/** Input for the import-and-align use case */
export type ImportAndAlignInput = {
  /** Raw DXF file content as string. If omitted, a mock model is used. */
  dxfContent?: string;

  /** Two points the user clicked on the CAD drawing */
  cadPoints: [Point2D, Point2D];

  /** Two corresponding GPS locations */
  geoPoints: [GeoPoint, GeoPoint];
};

/**
 * Main use case: import a DXF file and align it to real-world coordinates.
 *
 * @param input - DXF content + reference point pairs
 * @returns GeorefResult with cadEntities, localEntities, geoEntities
 *
 * Example:
 * ```ts
 * const result = await importAndAlign({
 *   dxfContent: fileString,
 *   cadPoints: [{ x: 100, y: 200 }, { x: 500, y: 600 }],
 *   geoPoints: [
 *     { lat: 25.123, lon: 55.456 },
 *     { lat: 25.125, lon: 55.458 }
 *   ]
 * });
 * ```
 */
export async function importAndAlign(input: ImportAndAlignInput): Promise<GeorefResult> {
  const { dxfContent, cadPoints, geoPoints } = input;

  // ── Validate inputs ───────────────────────────────────────
  if (cadPoints.length !== 2) {
    throw new Error('Exactly 2 CAD reference points are required.');
  }
  if (geoPoints.length !== 2) {
    throw new Error('Exactly 2 GPS reference points are required.');
  }

  const [cadA, cadB] = cadPoints;
  const [geoA, geoB] = geoPoints;

  // ── Step 1: Parse DXF (or use mock for testing) ───────────
  const cadModel = dxfContent
    ? parseDXF(dxfContent)
    : createMockCADModel();

  if (cadModel.entities.length === 0) {
    throw new Error('CAD model contains no supported entities.');
  }

  // ── Step 2: Run georeferencing pipeline ───────────────────
  const result = georeferenceCAD(cadModel, cadA, cadB, geoA, geoB);

  return result;
}

/**
 * Synchronous version for testing (no async DXF parsing needed).
 */
export function importAndAlignSync(input: ImportAndAlignInput): GeorefResult {
  const { cadPoints, geoPoints } = input;

  const [cadA, cadB] = cadPoints;
  const [geoA, geoB] = geoPoints;

  const cadModel = createMockCADModel();
  return georeferenceCAD(cadModel, cadA, cadB, geoA, geoB);
}
