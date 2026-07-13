// ============================================================
// Coordinate Parser — Unified Entry Point
// ============================================================
// Auto-detects file format from extension, validates file size,
// routes to the correct parser, and returns a unified ParserResult.
//
// Usage:
//   import { parseCoordinates } from '@/core/parsers';
//   const result = await parseCoordinates(content, fileName, { utmZone: '43N' });
//
// This module replaces ALL previous parser entry points:
//   - PathPlanScreen.tsx inline parsers
//   - missionParser.ts
//   - waypoint_parser.ts
//
// DXF is NOT handled here — it uses a separate CAD georeferencing
// pipeline (useCADAlignment hook).

import { ParserResult, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from './types';
import { extensionToFormat, stripBOM } from './utils';
import { parseCSV } from './csvParser';
import { parseJSON } from './jsonParser';
import { parseKML } from './kmlParser';
import { parseQGC } from './qgcParser';

// Excel parser requires async loading of exceljs
// We export it separately — see parseExcel below
export type { SheetRow } from './excelParser';

/** Options for coordinate parsing. */
export interface ParseOptions {
  /** UTM zone for Easting/Northing input, e.g. "43N". */
  utmZone?: string;
}

/**
 * Auto-detect format and parse coordinate data.
 *
 * @param content - Raw file content as string
 * @param fileName - Original filename (for extension detection)
 * @param options - Optional parsing configuration
 * @returns ParserResult with coordinates, warnings, and metadata
 */
export async function parseCoordinates(
  content: string,
  fileName: string,
  options?: ParseOptions
): Promise<ParserResult> {
  const utmZone = options?.utmZone;

  // Validate input
  if (!content || content.length === 0) {
    return {
      source_file: fileName,
      format_detected: 'UNKNOWN',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings: ['File content is empty'],
      coordinates: [],
    };
  }

  // Extract extension
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const format = extensionToFormat(ext);

  if (!format) {
    return {
      source_file: fileName,
      format_detected: 'UNKNOWN',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings: [
        `Unsupported file extension: ".${ext}". ` +
        `Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      ],
      coordinates: [],
    };
  }

  // File size guard
  const maxSize = MAX_FILE_SIZE[format];
  if (maxSize && content.length > maxSize) {
    const sizeMB = (content.length / (1024 * 1024)).toFixed(1);
    const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
    return {
      source_file: fileName,
      format_detected: format,
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings: [
        `File too large: ${sizeMB} MB exceeds ${maxMB} MB limit for ${format} files.`,
      ],
      coordinates: [],
    };
  }

  // Route to correct parser
  try {
    switch (format) {
      case 'CSV':
        return parseCSV(content, fileName, utmZone);

      case 'JSON':
        return parseJSON(content, fileName);

      case 'KML':
        return parseKML(content, fileName);

      case 'QGC':
        return parseQGC(content, fileName);

      case 'EXCEL':
        return parseExcel(content, fileName, utmZone);

      default:
        return {
          source_file: fileName,
          format_detected: format,
          coordinate_system: 'UNKNOWN',
          utm_zone: utmZone || null,
          total_rows: 0,
          valid_points: 0,
          skipped_rows: 0,
          warnings: [`Format "${format}" is recognized but not yet implemented`],
          coordinates: [],
        };
    }
  } catch (err: any) {
    return {
      source_file: fileName,
      format_detected: format,
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings: [
        `Parser error: ${err?.message || String(err)}`,
      ],
      coordinates: [],
    };
  }
}

/**
 * Parse Excel (.xlsx) files using SheetJS (xlsx).
 *
 * SheetJS community edition is pure JS with no Node.js Buffer dependency,
 * making it compatible with React Native / Expo environments.
 */
async function parseExcel(
  content: string,
  fileName: string,
  utmZone?: string
): Promise<ParserResult> {
  try {
    // Dynamic import to avoid bundling if never used
    const XLSX = await import('xlsx');

    // Parse workbook from string content
    const workbook = XLSX.read(content, { type: 'string', cellDates: true });

    // Flatten workbook into SheetRow[]
    const rows: Array<{ sheetName: string; cells: (string | number | null | undefined)[] }> = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      // Convert to array of arrays (aoa). raw: true keeps numbers as numbers.
      const aoa = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null, raw: true });

      for (const rowData of aoa) {
        if (!Array.isArray(rowData)) continue;
        const cells: (string | number | null | undefined)[] = rowData.map((cell: any) => {
          if (cell === null || cell === undefined) return null;
          if (cell instanceof Date) return cell.toISOString();
          // raw: true gives numbers as numbers, strings as strings — perfect
          return cell;
        });
        rows.push({ sheetName, cells });
      }
    }

    const { parseExcelData } = await import('./excelParser');
    return parseExcelData(rows, fileName, utmZone);
  } catch (err: any) {
    const msg = err?.message || String(err);

    return {
      source_file: fileName,
      format_detected: 'EXCEL',
      coordinate_system: 'UNKNOWN',
      utm_zone: utmZone || null,
      total_rows: 0,
      valid_points: 0,
      skipped_rows: 0,
      warnings: [
        `Excel parsing failed: ${msg}`,
        'Please ensure the file is a valid .xlsx spreadsheet. If issues persist, export as CSV and re-upload.',
      ],
      coordinates: [],
    };
  }
}

// ============================================================
// Re-export everything for convenience
// ============================================================
export { ParserResult, ParsedCoordinate } from './types';
export { parseCSV } from './csvParser';
export { parseJSON } from './jsonParser';
export { parseKML } from './kmlParser';
export { parseQGC } from './qgcParser';
export { parseExcelData } from './excelParser';
export {
  stripBOM,
  detectDelimiter,
  detectCoordinateColumns,
  validateUTMCoordinate,
  validateLatLon,
  utmToLatLon,
  parseUTMZone,
  safeFloat,
  buildCoordinate,
  extensionToFormat,
} from './utils';
