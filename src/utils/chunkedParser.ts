/**
 * chunkedParser — Yielding CSV parser for large waypoint imports
 *
 * Uses requestIdleCallback (available in RN 0.75+ New Architecture / Hermes)
 * to process CSV lines in chunks, yielding to the main thread between chunks.
 * This prevents UI freezes during imports of 500+ waypoints.
 *
 * For small files (< CHUNK_THRESHOLD rows), parsing is synchronous to avoid
 * the overhead of scheduling callbacks for trivial work.
 *
 * Usage:
 *   const result = await parseCSVChunked(content, fileName);
 *   // result is PathPlanWaypoint[]
 */

import { PathPlanWaypoint } from '../types/pathplan';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChunkedParseProgress {
  /** 0-100 progress percentage */
  progress: number;
  /** Number of rows parsed so far */
  parsed: number;
  /** Total rows to parse */
  total: number;
}

export interface ChunkedParseOptions {
  /** Called after each chunk with progress info. Use for UI progress bars. */
  onProgress?: (progress: ChunkedParseProgress) => void;
  /** Rows per chunk. Default: 100. Smaller = more responsive, larger = faster. */
  chunkSize?: number;
  /** Max ms to wait before forcing a chunk. Default: 200. */
  idleTimeout?: number;
}

// ── Threshold ────────────────────────────────────────────────────────────────

// Below this row count, parse synchronously (avoids callback scheduling overhead).
// Inline parsing of 400 rows takes ~4ms; requestIdleCallback adds 800ms-1000ms
// of scheduling overhead per chunk and can stall to 20s+ on busy devices.
// Only use chunked parsing for files large enough to actually freeze the JS thread.
const CHUNK_THRESHOLD = 1000;

// ── requestIdleCallback polyfill ─────────────────────────────────────────────

const scheduleIdle: typeof requestIdleCallback =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb, opts) => {
        const timeout = opts?.timeout ?? 200;
        return setTimeout(() => {
          const start = Date.now();
          cb({
            didTimeout: true,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          });
        }, 1) as unknown as number;
      };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip UTF-8 BOM and normalize non-breaking spaces */
function sanitizeContent(raw: string): string {
  let s = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  s = s.replace(/\u00A0/g, ' ');
  return s;
}

/** Split a CSV line respecting RFC 4180 quoted fields ("3,4" stays as one value) */
function splitCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

/** Auto-detect delimiter — picks whichever of , \t ; produces the most columns */
function detectDelimiter(headerLine: string): string {
  let best = ',';
  let bestCount = 0;
  for (const d of [',', '\t', ';']) {
    const count = headerLine.split(d).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

interface CSVHeaders {
  lat: number;
  lon: number;
  alt: number;
  block: number;
  row: number;
  pile: number;
  delimiter: string;
}

function detectCSVHeaders(headerLine: string): CSVHeaders | string {
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCSVLine(headerLine, delimiter);
  const normalized = headers.map(h => h.trim().toLowerCase());

  const latIndex = normalized.findIndex(h => h === 'latitude' || h === 'lat');
  const lonIndex = normalized.findIndex(h => h === 'longitude' || h === 'lon' || h === 'lng');
  const altIndex = normalized.findIndex(h => h === 'altitude' || h === 'alt' || h === 'elevation' || h === 'ellipsoidal height');
  const blockIndex = normalized.findIndex(h => h === 'block' || h === 'module');
  const rowIndex = normalized.findIndex(h => h === 'row');
  const pileIndex = normalized.findIndex(h => h === 'pile' || h === 'pile_no');

  if (latIndex === -1 || lonIndex === -1) {
    console.warn('[chunkedParser] Header detection FAILED. Columns:', normalized, 'delimiter:', JSON.stringify(delimiter));
    return `CSV must contain "Latitude" and "Longitude" columns.\nDetected columns: ${normalized.join(', ')}`;
  }

  console.log('[chunkedParser] Headers OK — lat:', latIndex, 'lon:', lonIndex, 'alt:', altIndex, 'delim:', JSON.stringify(delimiter));
  return { lat: latIndex, lon: lonIndex, alt: altIndex, block: blockIndex, row: rowIndex, pile: pileIndex, delimiter };
}

function parseRow(
  line: string,
  idx: number,
  headers: CSVHeaders,
): PathPlanWaypoint | string {
  const values = splitCSVLine(line, headers.delimiter);

  if (values.length <= Math.max(headers.lat, headers.lon)) {
    return `Insufficient columns at row ${idx + 2}.`;
  }

  const lat = parseFloat(values[headers.lat]);
  const lon = parseFloat(values[headers.lon]);
  const alt = headers.alt !== -1 ? parseFloat(values[headers.alt]) : 0;

  if (isNaN(lat) || isNaN(lon)) {
    return `Invalid coordinates at row ${idx + 2}: lat=${values[headers.lat]}, lon=${values[headers.lon]}`;
  }

  return {
    id: idx + 1,
    lat,
    lon,
    alt: isNaN(alt) ? 0 : alt,
    distance: 0,
    block: headers.block !== -1 && values[headers.block] ? values[headers.block] : '',
    row: headers.row !== -1 && values[headers.row] ? values[headers.row] : '',
    pile: headers.pile !== -1 && values[headers.pile] ? values[headers.pile] : String(idx + 1),
  };
}

// ── Synchronous parser (small files) ──────────────────────────────────────────

export function parseCSVSynchronous(content: string): PathPlanWaypoint[] {
  const clean = sanitizeContent(content);
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV file must contain headers and at least one data row.');
  }

  const headerResult = detectCSVHeaders(lines[0]);
  if (typeof headerResult === 'string') {
    throw new Error(headerResult);
  }

  const headers = headerResult;
  const dataLines = lines.slice(1);
  const waypoints: PathPlanWaypoint[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const result = parseRow(dataLines[i], i, headers);
    if (typeof result === 'string') {
      throw new Error(result);
    }
    waypoints.push(result);
  }

  return waypoints;
}

// ── Chunked parser (large files) ──────────────────────────────────────────────

/**
 * Parse a CSV file in chunks using requestIdleCallback.
 *
 * Yields to the main thread between chunks so the UI remains responsive
 * during large imports (500+ waypoints). Uses deadline.timeRemaining()
 * to process multiple chunks within a single idle period if time permits.
 *
 * For files under CHUNK_THRESHOLD rows, falls back to synchronous parsing.
 */
export function parseCSVChunked(
  content: string,
  fileName: string,
  options?: ChunkedParseOptions,
): Promise<PathPlanWaypoint[]> {
  const { onProgress, chunkSize = 100, idleTimeout = 200 } = options ?? {};

  const clean = sanitizeContent(content);
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    return Promise.reject(new Error('CSV file must contain headers and at least one data row.'));
  }

  // Parse headers synchronously (fast, no need to chunk)
  const headerResult = detectCSVHeaders(lines[0]);
  if (typeof headerResult === 'string') {
    return Promise.reject(new Error(headerResult));
  }

  const headers = headerResult;
  const dataLines = lines.slice(1);

  // Small file — parse synchronously to avoid scheduling overhead
  if (dataLines.length < CHUNK_THRESHOLD) {
    const result = parseCSVSynchronous(content);
    onProgress?.({ progress: 100, parsed: result.length, total: result.length });
    return Promise.resolve(result);
  }

  // Large file — parse in chunks
  return new Promise((resolve, reject) => {
    const waypoints: PathPlanWaypoint[] = [];
    let lineIndex = 0;
    let firstError: string | null = null;

    function processChunk(deadline: IdleDeadline | { didTimeout: boolean; timeRemaining: () => number }) {
      // If we've already hit an error, stop
      if (firstError) {
        reject(new Error(firstError));
        return;
      }

      // Process rows until we run out of time or finish the chunk
      const chunkEnd = Math.min(lineIndex + chunkSize, dataLines.length);

      for (let i = lineIndex; i < chunkEnd; i++) {
        const result = parseRow(dataLines[i], i, headers);
        if (typeof result === 'string') {
          firstError = result;
          break;
        }
        waypoints.push(result);
      }

      lineIndex = chunkEnd;

      const progress = Math.round((lineIndex / dataLines.length) * 100);
      onProgress?.({ progress, parsed: lineIndex, total: dataLines.length });

      // Check if we're done or hit an error
      if (firstError) {
        reject(new Error(firstError));
        return;
      }

      if (lineIndex >= dataLines.length) {
        resolve(waypoints);
        return;
      }

      // If there's still idle time, process another chunk immediately
      // Otherwise, schedule the next chunk for the next idle period
      const remaining = deadline.timeRemaining?.() ?? 0;
      if (remaining > 5) {
        // Still idle — keep processing
        processChunk(deadline);
      } else {
        // No idle time left — schedule next chunk
        scheduleIdle(processChunk, { timeout: idleTimeout });
      }
    }

    // Start the first chunk
    scheduleIdle(processChunk, { timeout: idleTimeout });
  });
}

export default parseCSVChunked;