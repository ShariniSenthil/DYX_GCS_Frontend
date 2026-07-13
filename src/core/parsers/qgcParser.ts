// ============================================================
// QGC WPL 110 Parser — Adapted to unified schema
// ============================================================
// Adapts the existing QGC WPL 110 parser to return ParserResult
// instead of the old PathPlanWaypoint[] format.

import { ParserResult, ParsedCoordinate } from './types';
import { buildCoordinate, safeFloat } from './utils';

/**
 * Parse QGC WPL 110 content into a unified ParserResult.
 *
 * QGC WPL 110 format:
 *   Header: "QGC WPL 110"
 *   Data rows (tab-separated):
 *     0: seq_num  1: current  2: frame  3: command
 *     4: param1   5: param2   6: param3  7: param4
 *     8: lat      9: lon      10: alt    11: autocontinue
 *
 * @param content - Raw QGC WPL file content as string
 * @param fileName - Original filename for metadata
 */
export function parseQGC(
  content: string,
  fileName: string
): ParserResult {
  const warnings: string[] = [];
  const coordinates: ParsedCoordinate[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    warnings.push('QGC file is empty');
    return {
      source_file: fileName,
      format_detected: 'QGC',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  if (!lines[0].startsWith('QGC WPL')) {
    warnings.push(
      `Invalid QGC waypoint format. First line: "${lines[0].slice(0, 50)}". Expected "QGC WPL 110".`
    );
    return {
      source_file: fileName,
      format_detected: 'QGC',
      coordinate_system: 'UNKNOWN',
      utm_zone: null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  const dataLines = lines.slice(1);
  totalRows = dataLines.length;
  let validPoints = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const parts = line.split(/\t/);

    if (parts.length < 11) {
      skippedRows++;
      warnings.push(`Line ${i + 2}: Expected at least 11 tab-separated fields, got ${parts.length}`);
      continue;
    }

    // Index 0 is sequence number — skip header lines (seq 0 = home position)
    const seqNum = parseInt(parts[0], 10);
    if (isNaN(seqNum)) {
      skippedRows++;
      warnings.push(`Line ${i + 2}: Invalid sequence number "${parts[0]}"`);
      continue;
    }

    const lat = safeFloat(parts[8]);
    const lon = safeFloat(parts[9]);
    const alt = safeFloat(parts[10]);

    if (lat === null || lon === null) {
      skippedRows++;
      warnings.push(`Line ${i + 2}: Missing or invalid lat/lon`);
      continue;
    }

    if (lat < -90 || lat > 90) {
      skippedRows++;
      warnings.push(`Line ${i + 2}: Latitude ${lat} out of range [-90, 90]`);
      continue;
    }

    if (lon < -180 || lon > 180) {
      skippedRows++;
      warnings.push(`Line ${i + 2}: Longitude ${lon} out of range [-180, 180]`);
      continue;
    }

    const id = validPoints + 1;
    const pile = String(seqNum > 0 ? seqNum : id);
    const rawRow = line;

    const { coord, warnings: buildWarnings } = buildCoordinate({
      id,
      lat,
      lon,
      elev: alt,
      pile,
      source_format: 'QGC',
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
    format_detected: 'QGC',
    coordinate_system: 'LATLON',
    utm_zone: null,
    total_rows: totalRows,
    valid_points: validPoints,
    skipped_rows: skippedRows,
    warnings,
    coordinates,
  };
}
