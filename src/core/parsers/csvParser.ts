// ============================================================
// CSV Parser — Unified Replacement
// ============================================================
// Replaces BOTH the inline parseCSV in PathPlanScreen.tsx
// AND the parseCsvFile in missionParser.ts.
//
// Features:
//   - BOM stripping
//   - Auto-delimiter detection (comma, semicolon, tab, pipe)
//   - Column name variants for lat/lon/easting/northing/elevation
//   - UTM Easting/Northing input support (requires zone param)
//   - Graceful handling of empty rows, null values, NaN
//   - Returns ParserResult with warnings and skip counts

import { ParserResult, ParsedCoordinate } from './types';
import {
  stripBOM,
  cleanCell,
  detectDelimiter,
  detectCoordinateColumns,
  buildCoordinate,
  safeFloat,
  utmToLatLon,
  parseUTMZone,
} from './utils';

/**
 * Parse CSV content into a unified ParserResult.
 *
 * @param content - Raw CSV file content as string
 * @param fileName - Original filename for metadata
 * @param utmZone - Optional UTM zone (e.g. "43N") if input is in Easting/Northing
 */
export function parseCSV(
  content: string,
  fileName: string,
  utmZone?: string
): ParserResult {
  const warnings: string[] = [];
  const coordinates: ParsedCoordinate[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  // Clean content
  const cleaned = stripBOM(content);
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    warnings.push('CSV has fewer than 2 non-empty lines (header + data expected)');
    return {
      source_file: fileName,
      format_detected: 'CSV',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  // Detect delimiter from header line
  const delim = detectDelimiter(lines[0]);

  // Parse header
  const headers = lines[0].split(delim).map(cleanCell);
  const cols = detectCoordinateColumns(headers);

  if (cols.latCol === -1 && cols.lonCol === -1 && cols.eastCol === -1 && cols.northCol === -1) {
    warnings.push(`No recognizable coordinate columns found in header: [${headers.join(', ')}]`);
    return {
      source_file: fileName,
      format_detected: 'CSV',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  // Determine coordinate system
  let coordSystem: 'UTM' | 'LATLON' | 'UNKNOWN' = 'UNKNOWN';
  if (cols.latCol !== -1 && cols.lonCol !== -1) {
    coordSystem = 'LATLON';
  } else if (cols.eastCol !== -1 && cols.northCol !== -1) {
    if (utmZone) {
      coordSystem = 'UTM';
    } else {
      warnings.push(
        'Easting/Northing columns detected but no UTM zone provided. ' +
        'Pass utmZone parameter to convert to lat/lon.'
      );
      return {
        source_file: fileName,
        format_detected: 'CSV',
        coordinate_system: 'UNKNOWN',
        utm_zone: utmZone || null,
        total_rows: 0,
        valid_points: 0,
        skipped_rows: 0,
        warnings,
        coordinates: [],
      };
    }
  }

  const hasHeader = true;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  totalRows = dataLines.length;

  let validPoints = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cells = line.split(delim).map(cleanCell);

    // Skip rows that don't have enough columns
    const maxNeeded = Math.max(
      cols.latCol, cols.lonCol, cols.eastCol, cols.northCol,
      cols.elevCol, cols.labelCol, cols.blockCol, cols.rowCol
    );
    if (maxNeeded === -1 || cells.length <= maxNeeded) {
      skippedRows++;
      warnings.push(`Row ${i + 2}: Insufficient columns (expected at least ${maxNeeded + 1}, got ${cells.length})`);
      continue;
    }

    let lat: number | null = null;
    let lon: number | null = null;
    const elev = safeFloat(cells[cols.elevCol]);
    const easting = cols.eastCol !== -1 ? safeFloat(cells[cols.eastCol]) : null;
    const northing = cols.northCol !== -1 ? safeFloat(cells[cols.northCol]) : null;
    const label = cols.labelCol !== -1 && cells[cols.labelCol] ? cells[cols.labelCol] : null;
    const block = cols.blockCol !== -1 && cells[cols.blockCol] ? cells[cols.blockCol] : '';
    const row = cols.rowCol !== -1 && cells[cols.rowCol] ? cells[cols.rowCol] : '';

    if (coordSystem === 'UTM' && easting !== null && northing !== null && utmZone) {
      // Convert UTM to lat/lon
      try {
        const converted = utmToLatLon(easting, northing, utmZone);
        lat = converted.lat;
        lon = converted.lon;
      } catch (err) {
        skippedRows++;
        warnings.push(`Row ${i + 2}: UTM conversion failed for E:${easting}, N:${northing} in zone ${utmZone}`);
        continue;
      }
    } else {
      // Read lat/lon directly
      lat = safeFloat(cols.latCol !== -1 ? cells[cols.latCol] : null);
      lon = safeFloat(cols.lonCol !== -1 ? cells[cols.lonCol] : null);
    }

    const pile = label || '';
    const rawRow = line;
    const id = validPoints + 1;

    const { coord, warnings: buildWarnings } = buildCoordinate({
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
      source_format: 'CSV',
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
    format_detected: 'CSV',
    coordinate_system: coordSystem,
    utm_zone: utmZone || null,
    total_rows: totalRows,
    valid_points: validPoints,
    skipped_rows: skippedRows,
    warnings,
    coordinates,
  };
}
