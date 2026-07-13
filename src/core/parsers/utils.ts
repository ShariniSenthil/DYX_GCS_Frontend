// ============================================================
// Parser Utilities — Shared helpers for all coordinate parsers
// ============================================================
// Pure functions, no side effects, no I/O.

import { ParsedCoordinate } from './types';

// ============================================================
// Text cleaning
// ============================================================

/** Strip UTF-8 BOM (\uFEFF) from the beginning of a string. */
export function stripBOM(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

/** Remove surrounding quotes from a CSV cell value. */
export function cleanCell(raw: string): string {
  return stripBOM(raw).trim().replace(/^"|"$/g, '');
}

// ============================================================
// Delimiter detection
// ============================================================

const DELIMITERS = [',', ';', '\t', '|'] as const;

/**
 * Auto-detect the most likely delimiter for a line.
 * Counts occurrences of comma, semicolon, tab, and pipe.
 * Falls back to comma if none found.
 */
export function detectDelimiter(line: string): ',' | ';' | '\t' | '|' {
  const counts = DELIMITERS.map((d) => ({
    delim: d,
    count: (line.match(new RegExp(d === '\t' ? '\\t' : d === '|' ? '\\|' : d, 'g')) || [])
      .length,
  }));
  const best = counts.reduce((a, b) => (a.count > b.count ? a : b));
  return best.count > 0 ? best.delim : ',';
}

// ============================================================
// Column name detection
// ============================================================

const LAT_NAMES = ['lat', 'latitude'];
const LON_NAMES = ['lon', 'lng', 'long', 'longitude'];
const ELEV_NAMES = ['alt', 'altitude', 'elevation', 'height', 'agl', 'ellipsoidal height'];
const EAST_NAMES = ['e', 'easting', 'x', 'coord_e', 'east'];
const NORTH_NAMES = ['n', 'northing', 'y', 'coord_n', 'north'];
const LABEL_NAMES = ['label', 'name', 'pile', 'id', 'point', 'point_id', 'pile_id', 'pile_name'];
const BLOCK_NAMES = ['block'];
const ROW_NAMES = ['row'];

export interface ColumnIndices {
  latCol: number;
  lonCol: number;
  elevCol: number;
  eastCol: number;
  northCol: number;
  labelCol: number;
  blockCol: number;
  rowCol: number;
}

/**
 * Scan a header row and return column indices for recognized coordinate fields.
 * Case-insensitive matching. Returns -1 for unrecognized columns.
 */
export function detectCoordinateColumns(headers: string[]): ColumnIndices {
  const lower = headers.map((h) => h.trim().toLowerCase());

  const find = (candidates: string[]): number =>
    lower.findIndex((h) => candidates.some((c) => h === c));

  return {
    latCol: find(LAT_NAMES),
    lonCol: find(LON_NAMES),
    elevCol: find(ELEV_NAMES),
    eastCol: find(EAST_NAMES),
    northCol: find(NORTH_NAMES),
    labelCol: find(LABEL_NAMES),
    blockCol: find(BLOCK_NAMES),
    rowCol: find(ROW_NAMES),
  };
}

// ============================================================
// Coordinate validation
// ============================================================

/** Validate latitude range [-90, 90]. */
export function validateLatLon(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    !isNaN(lat) &&
    typeof lon === 'number' &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Validate UTM coordinate ranges (sanity check, not full UTM validation).
 * Easting: 100,000 – 900,000 m
 * Northing: 0 – 10,000,000 m
 */
export function validateUTMCoordinate(e: number, n: number): boolean {
  return (
    typeof e === 'number' &&
    !isNaN(e) &&
    typeof n === 'number' &&
    !isNaN(n) &&
    e >= 100000 &&
    e <= 900000 &&
    n >= 0 &&
    n <= 10000000
  );
}

// ============================================================
// UTM → Lat/Lon conversion (Helmert / Transverse Mercator)
// ============================================================
// Implements the inverse Transverse Mercator projection for UTM zones.
// WGS-84 ellipsoid parameters.

const WGS84_A = 6378137.0;            // Semi-major axis (meters)
const WGS84_F = 1 / 298.257223563;    // Flattening
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F; // Eccentricity squared
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);      // Second eccentricity squared
const UTM_K0 = 0.9996;                 // Scale factor at central meridian
const UTM_E0 = 500000;                 // False easting
const UTM_N0 = 0;                      // False northing (Northern hemisphere)

/** Parse a UTM zone string like "43N" or "43S" into zone number and hemisphere. */
export function parseUTMZone(zone: string): { zoneNum: number; hemisphere: 'N' | 'S' } {
  const match = zone.match(/^(\d{1,2})\s*([NSns])$/);
  if (!match) {
    // Default to zone 43N (common in UAE / Middle East) — caller should validate
    return { zoneNum: 43, hemisphere: 'N' };
  }
  return {
    zoneNum: parseInt(match[1], 10),
    hemisphere: (match[2].toUpperCase() as 'N' | 'S'),
  };
}

/**
 * Convert UTM Easting/Northing to WGS-84 Lat/Lon.
 *
 * Implements the inverse Transverse Mercator projection using
 * the Snyder (1987) algorithm with iterative footpoint latitude.
 *
 * @param easting - UTM easting in meters
 * @param northing - UTM northing in meters
 * @param zone - UTM zone string, e.g. "43N"
 * @returns { lat, lon } in decimal degrees
 */
export function utmToLatLon(
  easting: number,
  northing: number,
  zone: string
): { lat: number; lon: number } {
  const { zoneNum, hemisphere } = parseUTMZone(zone);

  // Central meridian for this zone
  const lon0 = (zoneNum - 1) * 6 - 180 + 3; // degrees
  const lon0Rad = (lon0 * Math.PI) / 180;

  // Normalize northing for southern hemisphere
  const n = hemisphere === 'S' ? northing - 10000000 : northing;

  // Meridional arc
  const M = n / UTM_K0;

  // Footpoint latitude via iterative method (Snyder Eq. 3-26)
  const mu = M / (WGS84_A * (1 - WGS84_E2 / 4 - (3 * WGS84_E2 * WGS84_E2) / 64 - (5 * WGS84_E2 * WGS84_E2 * WGS84_E2) / 256));

  const e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

  // Radius of curvature terms
  const sinPhi1 = Math.sin(phi1);
  const N1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi1 * sinPhi1);
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = WGS84_EP2 * Math.cos(phi1) * Math.cos(phi1);
  const R1 = (WGS84_A * (1 - WGS84_E2)) / Math.pow(1 - WGS84_E2 * sinPhi1 * sinPhi1, 1.5);
  const D = (easting - UTM_E0) / N1;

  // Latitude (Snyder Eq. 3-24)
  const term1 = (N1 * Math.tan(phi1)) / R1;
  const term2 =
    (D * D) / 2 -
    ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * D * D * D * D) / 24 +
    ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) *
      D * D * D * D * D * D) /
      720;
  const latRad = phi1 - term1 * term2;

  // Longitude (Snyder Eq. 3-25)
  const lonTerm =
    D -
    ((1 + 2 * T1 + C1) * D * D * D) / 6 +
    ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) *
      D * D * D * D * D) /
      120;
  const lonRad = lon0Rad + lonTerm / Math.cos(phi1);

  let latDeg = (latRad * 180) / Math.PI;
  let lonDeg = (lonRad * 180) / Math.PI;

  // Adjust for southern hemisphere
  if (hemisphere === 'S') {
    // Already handled via northing adjustment above
  }

  return { lat: latDeg, lon: lonDeg };
}

// ============================================================
// Coordinate builder — safe number parsing
// ============================================================

/** Safely parse a string to float, returning null if invalid. */
export function safeFloat(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const parsed = parseFloat(String(value).trim());
  return isNaN(parsed) ? null : parsed;
}

/** Build a ParsedCoordinate from parsed values. */
export function buildCoordinate(params: {
  id: number;
  lat: number | null;
  lon: number | null;
  elev?: number | null;
  easting?: number | null;
  northing?: number | null;
  label?: string | null;
  block?: string;
  row?: string;
  pile?: string;
  source_format: string;
  raw_row: string;
  warnings?: string[];
}): { coord: ParsedCoordinate | null; warnings: string[] } {
  const warnings: string[] = params.warnings || [];
  const lat = params.lat;
  const lon = params.lon;
  const elev = params.elev ?? null;
  const easting = params.easting ?? null;
  const northing = params.northing ?? null;
  const label = params.label ?? null;
  const block = params.block ?? '';
  const row = params.row ?? '';
  const pile = params.pile ?? String(params.id);

  // If lat/lon are missing but easting/northing are present, conversion must be done externally
  // (caller must supply UTM zone and call utmToLatLon before this function)
  if (lat === null || lon === null) {
    warnings.push(`Row ${params.id}: Missing lat/lon — skipping`);
    return { coord: null, warnings };
  }

  if (!validateLatLon(lat, lon)) {
    warnings.push(`Row ${params.id}: Invalid lat/lon (${lat}, ${lon}) — skipping`);
    return { coord: null, warnings };
  }

  if (easting !== null && northing !== null && !validateUTMCoordinate(easting, northing)) {
    warnings.push(`Row ${params.id}: UTM coords out of expected range (E:${easting}, N:${northing})`);
  }

  return {
    coord: {
      id: params.id,
      latitude: lat,
      longitude: lon,
      elevation: elev,
      easting,
      northing,
      label,
      block,
      row,
      pile,
      source_format: params.source_format,
      raw_row: params.raw_row,
    },
    warnings,
  };
}

// ============================================================
// Format detection from file extension
// ============================================================

/** Map a file extension to the internal format string. */
export function extensionToFormat(ext: string): string | null {
  const e = ext.toLowerCase();
  switch (e) {
    case 'csv':
      return 'CSV';
    case 'json':
      return 'JSON';
    case 'kml':
      return 'KML';
    case 'xlsx':
      return 'EXCEL';
    case 'waypoint':
    case 'waypoints':
      return 'QGC';
    default:
      return null;
  }
}
