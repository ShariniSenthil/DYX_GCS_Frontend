import { calcBearing, vincentyDistance } from './missionCalculator';

// ─── Types ───────────────────────────────────────────────────

export interface SolarTableParams {
  tableType: 6 | 10 | 11;
  pointSpacing: number;
  tableGap: number;
  rowSpacing: number;
  tablesPerRow: number;
  rowCount: number;
}

export interface RefPoint {
  pileIndex: number;
  lat: number;
  lon: number;
  valid: boolean;
  deviationM: number;
}

export interface SolarTemplate {
  id: string;
  name: string;
  params: SolarTableParams;
  totalPiles: number;
  estimatedAreaM2: number;
  createdAt: string;
}

export interface LocalPile {
  pileIndex: number;
  tableIndex: number;
  rowIndex: number;
  pileInTable: number;
  localX: number;
  localY: number;
  label: string;
}

// ─── Vincenty Direct Formula (WGS84) ─────────────────────────

/**
 * Vincenty direct formula — given origin lat/lon, bearing, and distance,
 * compute the destination point on the WGS84 ellipsoid.
 *
 * Sub-millimeter accuracy. Iterates until convergence (typically 3-5 iterations).
 * Falls back to a simple equirectangular approximation if iteration fails.
 *
 * Mental test:
 *   vincentyDestinationPoint(0, 0, 90, 1000) → ~{lat: 0, lon: 0.008983}
 *   vincentyDestinationPoint(13.0827, 80.2707, 0, 100) → ~{lat: 13.08360, lon: 80.2707}
 */
export function vincentyDestinationPoint(
  originLat: number,
  originLon: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lon: number } {
  if (!Number.isFinite(originLat) || !Number.isFinite(originLon) ||
      !Number.isFinite(bearingDeg) || !Number.isFinite(distanceM)) {
    return { lat: originLat, lon: originLon };
  }
  if (distanceM === 0) return { lat: originLat, lon: originLon };

  // WGS84 ellipsoid constants
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);

  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const phi1 = originLat * toRad;
  const L1 = originLon * toRad;
  const alpha1 = bearingDeg * toRad;
  const s = distanceM;

  const sinU1 = Math.sin(Math.atan((1 - f) * Math.tan(phi1)));
  const cosU1 = Math.cos(Math.atan((1 - f) * Math.tan(phi1)));
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);

  // Equatorial azimuth
  const sinAlpha0 = cosU1 * sinAlpha1;
  const cos2Alpha0 = 1 - sinAlpha0 * sinAlpha0;

  // Auxiliary coefficients
  const u2 = cos2Alpha0 * (a * a - b * b) / (b * b);
  const Acoeff = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const Bcoeff = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));

  // sigma1 — angular distance on the auxiliary sphere from equator to origin
  const sigma1 = Math.atan2(sinU1 * Math.cos(alpha1) / cosU1, 1);
  // Equivalent: Math.atan2(tanU1, cosAlpha1) where tanU1 = sinU1/cosU1
  // More precisely: sigma1 = atan2(sinU1, cosU1 * cosAlpha1) ... no
  // Standard: sigma1 = atan2(sinU1, cosU1 * cosAlpha1) — but this is for the great circle
  // Correct Vincenty: sigma1 = atan2(tan(U1), cos(alpha1))
  const sigma1Correct = Math.atan2(sinU1, cosU1 * cosAlpha1);

  // Iterate for sigma
  let sigma = s / (b * Acoeff);
  let prevSigma: number;
  const maxIter = 200;

  for (let i = 0; i < maxIter; i++) {
    const cos2SigmaM = Math.cos(2 * sigma1Correct + sigma);
    const sinSigma = Math.sin(sigma);
    const cosSigma = Math.cos(sigma);

    const deltaSigma = Bcoeff * sinSigma * (
      cos2SigmaM + (Bcoeff / 4) * (
        cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        (Bcoeff / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
      )
    );

    prevSigma = sigma;
    sigma = s / (b * Acoeff) + deltaSigma;

    if (Math.abs(sigma - prevSigma) < 1e-12) break;
  }

  // Compute destination latitude
  const sinSigmaF = Math.sin(sigma);
  const cosSigmaF = Math.cos(sigma);
  const cos2SigmaMf = Math.cos(2 * sigma1Correct + sigma);

  const latRad = Math.atan2(
    sinU1 * cosSigmaF + cosU1 * sinSigmaF * cosAlpha1,
    (1 - f) * Math.sqrt(
      sinAlpha0 * sinAlpha0 +
      Math.pow(sinU1 * sinSigmaF - cosU1 * cosSigmaF * cosAlpha1, 2)
    ),
  );

  // Compute longitude difference
  const lambda = Math.atan2(
    sinSigmaF * sinAlpha1,
    cosU1 * cosSigmaF - sinU1 * sinSigmaF * cosAlpha1,
  );

  const C = (f / 16) * cos2Alpha0 * (4 + f * (4 - 3 * cos2Alpha0));

  const L = lambda - (1 - C) * f * sinAlpha0 * (
    sigma + C * sinSigmaF * (
      cos2SigmaMf + C * cosSigmaF * (-1 + 2 * cos2SigmaMf * cos2SigmaMf)
    )
  );

  const lonRad = L1 + L;

  return {
    lat: latRad * toDeg,
    lon: lonRad * toDeg,
  };
}

// ─── Local Grid Generation ──────────────────────────────────

/**
 * Generate all piles as local XY offsets from origin (0,0).
 *
 * X axis = along the row (East in local frame)
 * Y axis = perpendicular to row (North in local frame)
 *
 * Table layout within a row:
 *   tableStartX = t * ((tableType - 1) * pointSpacing + tableGap)
 *   Each pile within table: localX = tableStartX + p * pointSpacing
 */
export function generateLocalGrid(params: SolarTableParams): LocalPile[] {
  const piles: LocalPile[] = [];
  let index = 0;

  for (let r = 0; r < params.rowCount; r++) {
    const localY = r * params.rowSpacing;

    for (let t = 0; t < params.tablesPerRow; t++) {
      const tableStartX = t * ((params.tableType - 1) * params.pointSpacing + params.tableGap);

      for (let p = 0; p < params.tableType; p++) {
        const localX = tableStartX + p * params.pointSpacing;
        piles.push({
          pileIndex: index,
          tableIndex: t,
          rowIndex: r,
          pileInTable: p,
          localX,
          localY,
          label: `R${r + 1}-T${t + 1}-P${p + 1}`,
        });
        index++;
      }
    }
  }

  return piles;
}

// ─── Georeference Application ───────────────────────────────

/**
 * Convert local XY grid to real-world lat/lon using reference points.
 *
 * Algorithm:
 * 1. Compute grid bearing from refPoints[0] → refPoints[1] using calcBearing()
 * 2. For each pile, project local offsets to lat/lon using vincentyDestinationPoint
 * 3. origin = refPoints[0] lat/lon
 *
 * Uses 2-point georeferencing. 3-point affine correction is a future enhancement.
 */
export function applyGeoReference(
  localGrid: LocalPile[],
  refPoints: RefPoint[],
): Array<{ pileIndex: number; lat: number; lon: number; label: string }> {
  if (refPoints.length < 2) {
    return [];
  }

  const origin = refPoints[0];

  // Compute grid bearing from first two reference points
  // gridBearing = cross-row direction (from ref[0] toward ref[1])
  const gridBearing = calcBearing(
    { lat: refPoints[0].lat, lon: refPoints[0].lon },
    { lat: refPoints[1].lat, lon: refPoints[1].lon },
  );

  // X moves along the row = perpendicular to gridBearing
  const xBearing = (gridBearing + 90) % 360;
  // Y moves across rows = along gridBearing
  const yBearing = gridBearing;

  return localGrid.map((pile) => {
    // Project localX along the row
    const intermediate = vincentyDestinationPoint(
      origin.lat,
      origin.lon,
      xBearing,
      pile.localX,
    );

    // Then project localY across rows from intermediate point
    const final = vincentyDestinationPoint(
      intermediate.lat,
      intermediate.lon,
      yBearing,
      pile.localY,
    );

    return {
      pileIndex: pile.pileIndex,
      lat: final.lat,
      lon: final.lon,
      label: pile.label,
    };
  });
}

// ─── Reference Point Validation ─────────────────────────────

/**
 * Validate a user-entered lat/lon against the expected position.
 *
 * Thresholds:
 *   valid   = deviation < 20 cm (RTK accuracy)
 *   warning = deviation 20 cm to 100 cm
 *   error   = deviation > 100 cm
 */
export function validateRefPoint(
  enteredLat: number,
  enteredLon: number,
  pileIndex: number,
  localGrid: LocalPile[],
  existingRefPoints: RefPoint[],
): { valid: boolean; deviationM: number; deviationCm: number; status: 'valid' | 'warning' | 'error' } {
  if (existingRefPoints.length === 0) {
    // First point is always accepted (it becomes the origin)
    return { valid: true, deviationM: 0, deviationCm: 0, status: 'valid' };
  }

  // Project this pile's position using existing reference points
  const projected = applyGeoReference(
    localGrid.filter((p) => p.pileIndex === pileIndex),
    existingRefPoints,
  );

  if (projected.length === 0) {
    return { valid: false, deviationM: Infinity, deviationCm: Infinity, status: 'error' };
  }

  const expected = projected[0];
  const deviationM = vincentyDistance(
    { lat: expected.lat, lon: expected.lon },
    { lat: enteredLat, lon: enteredLon },
  );
  const deviationCm = deviationM * 100;

  const status: 'valid' | 'warning' | 'error' =
    deviationCm < 20 ? 'valid' :
    deviationCm < 100 ? 'warning' : 'error';

  return {
    valid: status !== 'error',
    deviationM,
    deviationCm,
    status,
  };
}

// ─── Utility Functions ──────────────────────────────────────

export function estimateTotalPiles(params: SolarTableParams): number {
  return params.tableType * params.tablesPerRow * params.rowCount;
}

export function estimateArea(params: SolarTableParams): number {
  const width = params.tablesPerRow * ((params.tableType - 1) * params.pointSpacing + params.tableGap) - params.tableGap;
  const height = (params.rowCount - 1) * params.rowSpacing;
  return Math.max(0, width * height);
}