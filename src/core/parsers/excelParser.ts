// ============================================================
// Excel Parser — New (SheetJS / xlsx backend)
// ============================================================
// Features:
//   - Uses SheetJS (xlsx) — pure JS, React Native compatible
//   - Reads all sheets, tags labels with sheet name
//   - Auto-detects header row (searches first 10 rows)
//   - Same column name variants as CSV parser
//   - Notes .xls unsupported in warnings
//
// The index.ts entry point handles SheetJS import and data
// extraction, then calls this function with the extracted data.

import { ParserResult, ParsedCoordinate } from './types';
import {
  detectCoordinateColumns,
  buildCoordinate,
  safeFloat,
  utmToLatLon,
} from './utils';

/**
 * Parse Excel (.xlsx) content into a unified ParserResult.
 *
 * This function is designed to work with the exceljs library.
 * In React Native environments, exceljs may not work natively due
 * to its dependency on Node.js streams. If runtime issues occur,
 * users should export to CSV as a workaround.
 *
 * @param workbookData - Array of sheet objects from exceljs
 * @param fileName - Original filename for metadata
 * @param utmZone - Optional UTM zone for Easting/Northing conversion
 *
 * NOTE: This parser expects pre-processed workbook data rather than
 * raw file bytes, because exceljs requires async loading. The index.ts
 * entry point handles the exceljs import and data extraction, then
 * calls this function with the extracted data.
 */
export interface SheetRow {
  sheetName: string;
  cells: (string | number | null | undefined)[];
}

export function parseExcelData(
  rows: SheetRow[],
  fileName: string,
  utmZone?: string
): ParserResult {
  const warnings: string[] = [];
  const coordinates: ParsedCoordinate[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  if (fileName.toLowerCase().endsWith('.xls') && !fileName.toLowerCase().endsWith('.xlsx')) {
    warnings.push('.xls (legacy Excel 97-2003) format is not supported. Please save as .xlsx and re-upload.');
  }

  if (rows.length === 0) {
    warnings.push('No sheet data found in workbook');
    return {
      source_file: fileName,
      format_detected: 'EXCEL',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings,
      coordinates: [],
    };
  }

  // Group rows by sheet
  const sheets = new Map<string, (string | number | null | undefined)[][]>();
  for (const row of rows) {
    if (!sheets.has(row.sheetName)) {
      sheets.set(row.sheetName, []);
    }
    sheets.get(row.sheetName)!.push(row.cells);
  }

  const sheetNames = Array.from(sheets.keys());
  if (sheetNames.length > 1) {
    warnings.push(`Multiple sheets detected (${sheetNames.length}). Parsing all sheets: ${sheetNames.join(', ')}`);
  }

  let validPoints = 0;

  for (const [sheetName, sheetRows] of sheets) {
    if (sheetRows.length === 0) continue;

    // Auto-detect header row in first 10 rows
    const headerSearchLimit = Math.min(10, sheetRows.length);
    let headerRowIdx = -1;
    let bestColCount = 0;

    for (let i = 0; i < headerSearchLimit; i++) {
      const row = sheetRows[i];
      const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
      if (nonEmpty > bestColCount) {
        bestColCount = nonEmpty;
        headerRowIdx = i;
      }
    }

    if (headerRowIdx === -1) {
      skippedRows += sheetRows.length;
      warnings.push(`Sheet "${sheetName}": Could not detect a header row in first 10 rows`);
      continue;
    }

    // Parse header
    const headerRow = sheetRows[headerRowIdx].map((c) => String(c ?? '').trim());
    const cols = detectCoordinateColumns(headerRow);

    if (cols.latCol === -1 && cols.lonCol === -1 && cols.eastCol === -1 && cols.northCol === -1) {
      skippedRows += sheetRows.length - headerRowIdx - 1;
      warnings.push(`Sheet "${sheetName}": No recognizable coordinate columns in header: [${headerRow.join(', ')}]`);
      continue;
    }

    // Determine coordinate system
    let coordSystem: 'UTM' | 'LATLON' = 'LATLON';
    if (cols.eastCol !== -1 && cols.northCol !== -1 && cols.latCol === -1 && cols.lonCol === -1) {
      if (utmZone) {
        coordSystem = 'UTM';
      } else {
        skippedRows += sheetRows.length - headerRowIdx - 1;
        warnings.push(`Sheet "${sheetName}": Easting/Northing columns detected but no UTM zone provided`);
        continue;
      }
    }

    // Parse data rows
    const dataStartIdx = headerRowIdx + 1;

    for (let i = dataStartIdx; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      totalRows++;

      // Skip completely empty rows
      const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
      if (nonEmpty === 0) {
        skippedRows++;
        continue;
      }

      const maxNeeded = Math.max(
        cols.latCol, cols.lonCol, cols.eastCol, cols.northCol,
        cols.elevCol, cols.labelCol, cols.blockCol, cols.rowCol
      );
      if (row.length <= maxNeeded) {
        skippedRows++;
        continue;
      }

      let lat: number | null = null;
      let lon: number | null = null;

      const elevVal = cols.elevCol !== -1 ? row[cols.elevCol] : null;
      const elev = safeFloat(elevVal);
      const eastVal = cols.eastCol !== -1 ? row[cols.eastCol] : null;
      const easting = eastVal !== null ? safeFloat(eastVal) : null;
      const northVal = cols.northCol !== -1 ? row[cols.northCol] : null;
      const northing = northVal !== null ? safeFloat(northVal) : null;
      const label = cols.labelCol !== -1 && row[cols.labelCol] != null ? String(row[cols.labelCol]).trim() : null;
      const block = cols.blockCol !== -1 && row[cols.blockCol] != null ? String(row[cols.blockCol]).trim() : '';
      const rowVal = cols.rowCol !== -1 && row[cols.rowCol] != null ? String(row[cols.rowCol]).trim() : '';

      if (coordSystem === 'UTM' && easting !== null && northing !== null && utmZone) {
        try {
          const converted = utmToLatLon(easting, northing, utmZone);
          lat = converted.lat;
          lon = converted.lon;
        } catch {
          skippedRows++;
          continue;
        }
      } else {
        lat = safeFloat(cols.latCol !== -1 ? row[cols.latCol] : null);
        lon = safeFloat(cols.lonCol !== -1 ? row[cols.lonCol] : null);
      }

      const pilePrefix = sheetNames.length > 1 ? `${sheetName}:` : '';
      const pile = label ? `${pilePrefix}${label}` : `${pilePrefix}${validPoints + 1}`;
      const rawRow = row.map((c) => String(c ?? '')).join(',');
      const id = validPoints + 1;

      const { coord, warnings: buildWarnings } = buildCoordinate({
        id,
        lat,
        lon,
        elev,
        easting,
        northing,
        label: label ? `${pilePrefix}${label}` : null,
        block,
        row: rowVal,
        pile,
        source_format: 'EXCEL',
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
  }

  return {
    source_file: fileName,
    format_detected: 'EXCEL',
    coordinate_system: validPoints > 0 ? (coordinates.some((c) => c.easting !== null) ? 'UTM' : 'LATLON') : 'UNKNOWN',
    utm_zone: utmZone || null,
    total_rows: totalRows,
    valid_points: validPoints,
    skipped_rows: skippedRows,
    warnings,
    coordinates,
  };
}
