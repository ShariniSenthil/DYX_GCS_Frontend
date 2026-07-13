// ============================================================
// KML Parser — Rewritten with fast-xml-parser
// ============================================================
// Features:
//   - Uses fast-xml-parser (pure JS, React Native compatible)
//   - Handles namespace prefixes (kml:coordinates, kml:Placemark)
//   - Extracts ONLY Placemark > Point coordinates
//   - Skips LineString, Polygon, Camera, GroundOverlay coordinates
//   - Handles lon,lat,alt and lon,lat (2-value) formats
//   - Altitude defaults to null (not 0), with warning

import { XMLParser } from 'fast-xml-parser';
import { ParserResult, ParsedCoordinate } from './types';
import { buildCoordinate, safeFloat } from './utils';

// ============================================================
// fast-xml-parser configuration
// ============================================================

const KML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
  numberParseOptions: { leadingZeros: false, hex: false },
  // Preserve tag order for geometry type detection
  alwaysCreateTextNode: false,
  isArray: (name: string) => name === 'Placemark' || name === 'kml:Placemark',
};

// ============================================================
// KML-specific parsing
// ============================================================

/**
 * Parse a KML coordinates string into [lon, lat, alt?].
 * KML format: "longitude,latitude,altitude" or "longitude,latitude"
 */
function parseKMLCoords(coordText: string): { lon: number; lat: number; alt: number | null } | null {
  const parts = coordText.trim().split(/\s*,\s*/);
  if (parts.length < 2) return null;

  const lon = safeFloat(parts[0]);
  const lat = safeFloat(parts[1]);
  const alt = parts.length >= 3 ? safeFloat(parts[2]) : null;

  if (lon === null || lat === null) return null;

  return { lon, lat, alt };
}

/**
 * Recursively find all Placemark objects in the parsed XML tree.
 * Handles both 'Placemark' and 'kml:Placemark' tag names.
 */
function findPlacemarks(obj: any): any[] {
  if (!obj || typeof obj !== 'object') return [];

  const results: any[] = [];

  // Direct Placemark children
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'placemark' || lowerKey.endsWith(':placemark')) {
      const val = obj[key];
      if (Array.isArray(val)) {
        results.push(...val);
      } else if (val && typeof val === 'object') {
        results.push(val);
      }
    } else {
      const childVal = obj[key];
      if (childVal && typeof childVal === 'object') {
        results.push(...findPlacemarks(childVal));
      }
    }
  }

  return results;
}

/**
 * Extract text content from a deeply nested property.
 * fast-xml-parser may represent text as:
 *   - A string directly
 *   - { "#text": "..." }
 *   - { "coordinates": "55.0,25.0,10" }
 */
function extractText(node: any): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node !== 'object') return null;

  // Check for #text node
  if (node['#text'] !== undefined) return String(node['#text']).trim() || null;

  // Check if the object has a single key that might be the text content
  const keys = Object.keys(node);
  if (keys.length === 1) {
    return extractText(node[keys[0]]);
  }

  // Try common text node names
  for (const key of ['coordinates', 'name', 'description']) {
    if (node[key] !== undefined) return extractText(node[key]);
  }

  return null;
}

/**
 * Find a property by tag name (case-insensitive, namespace-aware).
 * Returns the first matching property value.
 */
function findProp(obj: any, tagName: string): any {
  if (!obj || typeof obj !== 'object') return undefined;

  const lower = tagName.toLowerCase();

  // Check direct children
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === lower || key.toLowerCase().endsWith(':' + lower)) {
      return obj[key];
    }
  }

  // Search deeper (one level is usually enough for KML)
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const subKey of Object.keys(val)) {
        if (subKey.toLowerCase() === lower || subKey.toLowerCase().endsWith(':' + lower)) {
          return val[subKey];
        }
      }
    }
  }

  return undefined;
}

/**
 * Parse KML content into a unified ParserResult.
 *
 * @param content - Raw KML file content as string
 * @param fileName - Original filename for metadata
 */
export function parseKML(
  content: string,
  fileName: string
): ParserResult {
  const warnings: string[] = [];
  const coordinates: ParsedCoordinate[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  // Parse XML with fast-xml-parser
  let parsed: any;
  try {
    const parser = new XMLParser(KML_PARSER_OPTIONS);
    parsed = parser.parse(content);
  } catch (err: any) {
    warnings.push(`Failed to parse KML XML: ${err?.message || String(err)}`);
    return {
      source_file: fileName,
      format_detected: 'KML',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  // Find all Placemarks
  const placemarks = findPlacemarks(parsed);

  if (placemarks.length === 0) {
    warnings.push('No Placemark elements found in KML file');
    return {
      source_file: fileName,
      format_detected: 'KML',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  let validPoints = 0;

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    totalRows++;

    // Check geometry type — only process Point
    const pointGeom = findProp(placemark, 'Point');
    if (!pointGeom) {
      // Check if this placemark has non-Point geometry types
      const hasOtherGeom = ['LineString', 'Polygon', 'LinearRing', 'Camera', 'GroundOverlay', 'PhotoOverlay', 'Model'].some(
        (tag) => findProp(placemark, tag) !== undefined
      );
      if (hasOtherGeom) {
        skippedRows++;
        continue; // Silently skip non-point geometries — expected in KML
      }
      skippedRows++;
      continue;
    }

    // Extract coordinates from <coordinates> tag inside Point
    const coordsNode = findProp(pointGeom, 'coordinates');
    const coordsText = extractText(coordsNode);

    if (!coordsText) {
      skippedRows++;
      warnings.push(`Placemark ${i + 1}: Point element has no coordinates`);
      continue;
    }

    const parsedCoords = parseKMLCoords(coordsText);
    if (!parsedCoords) {
      skippedRows++;
      warnings.push(`Placemark ${i + 1}: Failed to parse coordinates "${coordsText}"`);
      continue;
    }

    // Extract name/label if available
    const nameNode = findProp(placemark, 'name');
    const name = extractText(nameNode);

    // Warn about missing altitude
    if (parsedCoords.alt === null) {
      warnings.push(`Placemark ${i + 1} (${name || `#${i + 1}`}): No altitude provided, set to null`);
    }

    const id = validPoints + 1;
    const rawRow = coordsText.trim();

    const { coord, warnings: buildWarnings } = buildCoordinate({
      id,
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
      elev: parsedCoords.alt,
      label: name,
      pile: name || String(id),
      source_format: 'KML',
      raw_row: rawRow,
    });

    if (coord) {
      coordinates.push(coord);
      validPoints++;
    } else {
      skippedRows++;
    }
    warnings.push(...buildWarnings);
  }

  return {
    source_file: fileName,
    format_detected: 'KML',
    coordinate_system: validPoints > 0 ? 'LATLON' : 'UNKNOWN',
    utm_zone: null,
    total_rows: totalRows,
    valid_points: validPoints,
    skipped_rows: skippedRows,
    warnings,
    coordinates,
  };
}
