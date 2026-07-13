// ============================================================
// Unified Parser Output Contract
// ============================================================
// All parsers MUST return ParserResult. No exceptions.
// This replaces the divergent PathPlanWaypoint[] / ParsedWaypoint[]
// outputs that previously existed across the codebase.

/** A single parsed coordinate point — the unified internal representation. */
export interface ParsedCoordinate {
  id: number;                    // 1-based sequential
  latitude: number;
  longitude: number;
  elevation: number | null;
  easting: number | null;        // original UTM value if input was UTM
  northing: number | null;       // original UTM value if input was UTM
  label: string | null;          // pile ID, point name if available
  block: string;
  row: string;
  pile: string;
  source_format: string;         // "CSV" | "JSON" | "KML" | "QGC" | "EXCEL"
  raw_row: string;               // original unparsed line for debugging
}

/** The complete result from any parser — metadata + coordinates. */
export interface ParserResult {
  source_file: string;
  format_detected: string;       // "CSV" | "JSON" | "KML" | "QGC" | "EXCEL"
  coordinate_system: "UTM" | "LATLON" | "UNKNOWN";
  utm_zone: string | null;       // e.g. "43N"
  total_rows: number;
  valid_points: number;
  skipped_rows: number;
  warnings: string[];
  coordinates: ParsedCoordinate[];
}

/** File size limits to prevent memory issues. */
export const MAX_FILE_SIZE: Record<string, number> = {
  CSV: 50_000_000,     // 50 MB
  JSON: 50_000_000,
  KML: 10_000_000,     // 10 MB
  EXCEL: 20_000_000,   // 20 MB
  QGC: 5_000_000,      // 5 MB
  WAYPOINTS: 5_000_000,
} as const;

/** Supported file extensions for auto-detection. */
export const SUPPORTED_EXTENSIONS = [
  'csv', 'json', 'kml', 'xlsx', 'waypoint', 'waypoints',
] as const;

export type SupportedFormat = typeof SUPPORTED_EXTENSIONS[number];
