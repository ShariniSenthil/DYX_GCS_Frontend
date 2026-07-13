// ============================================================
// JSON Parser — Enhanced
// ============================================================
// Features:
//   - try/catch around JSON.parse with user-friendly errors
//   - Array of objects: [{lat, lon}, ...]
//   - GeoJSON FeatureCollection with Point geometries
//   - Nested: {waypoints: [...]} or {coordinates: [...]} or {piles: [...]}
//   - Detects and extracts easting/northing if present
//   - Validates each point, skips invalid, counts in skipped_rows

import { ParserResult, ParsedCoordinate } from './types';
import {
  buildCoordinate,
  safeFloat,
  detectCoordinateColumns,
} from './utils';

/** Known keys that may hold waypoint arrays in nested JSON. */
const NESTED_KEYS = ['waypoints', 'coordinates', 'piles', 'points', 'data', 'features', 'items'];

/** Known field name variants for lat/lon/easting/northing/elevation. */
const LAT_KEYS = ['lat', 'latitude', 'Lat', 'LAT', 'LATITUDE'];
const LON_KEYS = ['lon', 'lng', 'longitude', 'Long', 'LON', 'LNG', 'LONGITUDE'];
const ELEV_KEYS = ['alt', 'altitude', 'elevation', 'height', 'alt_m', 'Alt', 'ALT'];
const EAST_KEYS = ['easting', 'e', 'E', 'X', 'x', 'east', 'coord_e'];
const NORTH_KEYS = ['northing', 'n', 'N', 'Y', 'y', 'north', 'coord_n'];
const LABEL_KEYS = ['label', 'name', 'pile', 'id', 'point', 'point_id', 'pile_id', 'pile_name', 'title'];
const BLOCK_KEYS = ['block', 'Block', 'BLOCK'];
const ROW_KEYS = ['row', 'Row', 'ROW'];

function extractField(obj: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]);
    }
  }
  return null;
}

function extractFloat(obj: Record<string, unknown>, candidates: string[]): number | null {
  const val = extractField(obj, candidates);
  return val !== null ? safeFloat(val) : null;
}

/** Parse a single waypoint object into a ParsedCoordinate or null. */
function parseWaypointObject(
  obj: Record<string, unknown>,
  id: number,
  format: string,
  rawRow: string
): { coord: ParsedCoordinate | null; warnings: string[] } {
  const lat = extractFloat(obj, LAT_KEYS);
  const lon = extractFloat(obj, LON_KEYS);
  const elev = extractFloat(obj, ELEV_KEYS);
  const easting = extractFloat(obj, EAST_KEYS);
  const northing = extractFloat(obj, NORTH_KEYS);
  const label = extractField(obj, LABEL_KEYS);
  const block = extractField(obj, BLOCK_KEYS) || '';
  const row = extractField(obj, ROW_KEYS) || '';
  const pile = extractField(obj, ['pile', 'Pile', 'PILE']) || label || String(id);

  return buildCoordinate({
    id,
    lat,
    lon,
    elev,
    easting,
    northing,
    label,
    block,
    row,
    pile,
    source_format: format,
    raw_row: rawRow,
  });
}

/**
 * Try to extract an array of waypoint objects from a potentially nested structure.
 * Handles:
 *   - Direct array
 *   - {waypoints: [...]}
 *   - {data: [...]}
 *   - GeoJSON FeatureCollection
 */
function extractWaypointArray(data: unknown): { items: Record<string, unknown>[]; isGeoJSON: boolean } {
  // Direct array
  if (Array.isArray(data)) {
    return { items: data as Record<string, unknown>[], isGeoJSON: false };
  }

  if (typeof data !== 'object' || data === null) {
    return { items: [], isGeoJSON: false };
  }

  const obj = data as Record<string, unknown>;

  // GeoJSON FeatureCollection
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    // Convert GeoJSON features to simple objects
    const items = obj.features.map((f: any) => {
      const geom = f.geometry || {};
      const coords = geom.coordinates || [];
      const props = f.properties || {};

      // GeoJSON: [lon, lat, alt] or [lon, lat]
      const converted: Record<string, unknown> = { ...props };
      if (coords.length >= 2) {
        converted['lon'] = coords[0];
        converted['lat'] = coords[1];
        if (coords.length >= 3) converted['alt'] = coords[2];
      }
      if (f.id !== undefined) converted['id'] = f.id;
      if (!converted['name'] && f.properties?.name) converted['name'] = f.properties.name;
      return converted;
    });
    return { items, isGeoJSON: true };
  }

  // GeoJSON Feature (single)
  if (obj.type === 'Feature' && obj.geometry) {
    const geom = obj.geometry as Record<string, unknown>;
    const coords = (geom.coordinates as unknown[]) || [];
    const converted: Record<string, unknown> = { ...(obj.properties as Record<string, unknown>) || {} };
    if (Array.isArray(coords) && coords.length >= 2) {
      converted['lon'] = coords[0];
      converted['lat'] = coords[1];
      if (coords.length >= 3) converted['alt'] = coords[2];
    }
    return { items: [converted], isGeoJSON: true };
  }

  // Nested object with known key names
  for (const key of NESTED_KEYS) {
    if (Array.isArray(obj[key])) {
      return { items: obj[key] as Record<string, unknown>[], isGeoJSON: key === 'features' };
    }
  }

  // Fallback: check if any value is an array
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      return { items: obj[key] as Record<string, unknown>[], isGeoJSON: false };
    }
  }

  return { items: [], isGeoJSON: false };
}

/**
 * Parse JSON content into a unified ParserResult.
 *
 * @param content - Raw JSON file content as string
 * @param fileName - Original filename for metadata
 */
export function parseJSON(
  content: string,
  fileName: string
): ParserResult {
  const warnings: string[] = [];
  const coordinates: ParsedCoordinate[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  // Parse JSON with error handling
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err: any) {
    warnings.push(`Invalid JSON: ${err?.message || String(err)}. Check for syntax errors like trailing commas or unquoted keys.`);
    return {
      source_file: fileName,
      format_detected: 'JSON',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  const { items, isGeoJSON } = extractWaypointArray(data);

  if (items.length === 0) {
    warnings.push('No waypoint array found in JSON. Expected an array of objects, a nested object with "waypoints"/"coordinates"/"piles" key, or a GeoJSON FeatureCollection.');
    return {
      source_file: fileName,
      format_detected: 'JSON',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates,
    };
  }

  totalRows = items.length;
  let validPoints = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      skippedRows++;
      warnings.push(`Item ${i + 1}: Not a JSON object, skipping`);
      continue;
    }

    const rawRow = JSON.stringify(item);
    const id = validPoints + 1;

    const { coord, warnings: buildWarnings } = parseWaypointObject(
      item as Record<string, unknown>,
      id,
      'JSON',
      rawRow
    );

    if (coord) {
      coordinates.push(coord);
      validPoints++;
    } else {
      skippedRows++;
    }
    warnings.push(...buildWarnings);
  }

  // Determine coordinate system
  const hasEasting = coordinates.some((c) => c.easting !== null);
  const coordSystem: 'UTM' | 'LATLON' | 'UNKNOWN' =
    hasEasting ? 'UTM' : validPoints > 0 ? 'LATLON' : 'UNKNOWN';

  return {
    source_file: fileName,
    format_detected: 'JSON',
    coordinate_system: coordSystem,
    utm_zone: hasEasting ? null : null,
    total_rows: totalRows,
    valid_points: validPoints,
    skipped_rows: skippedRows,
    warnings,
    coordinates,
  };
}
