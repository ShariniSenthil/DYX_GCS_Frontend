// ============================================================
// DXF → ParsedPointSet adapter
// ============================================================
//
// Parses DXF text DIRECTLY (lightweight raw parser) to extract
// LWPOLYLINE, LINE, CIRCLE, and ARC entities from the ENTITIES
// section, preserving the CIRCLE/ARC distinction that the
// existing parseDXF function loses (both become Arc internally).
//
// Requirements: 1.4, 2.1–2.5, 3.1–3.4, 4.1–4.2, 5.1–5.4,
//               6.1–6.5, 7.1–7.4
// ============================================================

import {
  ParsedPoint,
  ParsedPointSet,
  LwPolylineSource,
  LineSource,
  CircleSource,
  ArcSource,
} from '../geometry/parsedPoint';

// ── Raw entity types (internal to this module) ───────────────

interface RawLwPolyline {
  type: 'LWPOLYLINE';
  layer: string;
  vertices: { x: number; y: number }[];
  closed: boolean;
}

interface RawLine {
  type: 'LINE';
  layer: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface RawCircle {
  type: 'CIRCLE';
  layer: string;
  cx: number;
  cy: number;
  r: number;
}

interface RawArc {
  type: 'ARC';
  layer: string;
  cx: number;
  cy: number;
  r: number;
  startAngleDeg: number;
  endAngleDeg: number;
}

type RawEntity = RawLwPolyline | RawLine | RawCircle | RawArc;

// ── Raw DXF text parser ──────────────────────────────────────

/**
 * Parse the ENTITIES section of a DXF text string into raw entity objects.
 * Returns null if no ENTITIES section is found.
 *
 * Algorithm:
 * 1. Find the ENTITIES section (between `0\nSECTION\n2\nENTITIES` and `0\nENDSEC`)
 * 2. Split into entity blocks (each starting with `0\n<TYPE>`)
 * 3. For each entity block, parse group codes (alternating lines: code, value)
 * 4. Extract only LWPOLYLINE, LINE, CIRCLE, ARC entities
 * 5. Skip malformed entities (NaN coordinates, missing required fields)
 */
function parseRawEntities(text: string): RawEntity[] | null {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Find the ENTITIES section
  const entitiesStart = normalized.indexOf('0\nSECTION\n2\nENTITIES');
  if (entitiesStart === -1) {
    return null;
  }

  // Find the end of the ENTITIES section (next 0\nENDSEC after the start)
  const sectionBodyStart = entitiesStart + '0\nSECTION\n2\nENTITIES'.length;
  const endSecIdx = normalized.indexOf('0\nENDSEC', sectionBodyStart);
  const sectionBody =
    endSecIdx === -1
      ? normalized.slice(sectionBodyStart)
      : normalized.slice(sectionBodyStart, endSecIdx);

  // Split into entity blocks. Each block starts with a line "0" followed by the entity type.
  // We split on occurrences of "\n0\n" (or the start of the body if it begins with "0\n").
  const rawEntities: RawEntity[] = [];

  // Collect all entity blocks by finding lines where group code is "0"
  const lines = sectionBody.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '0') {
      // Start of a new entity block
      if (currentBlock !== null && currentBlock.length >= 2) {
        blocks.push(currentBlock);
      }
      currentBlock = ['0'];
    } else if (currentBlock !== null) {
      currentBlock.push(line);
    }
  }
  // Push the last block
  if (currentBlock !== null && currentBlock.length >= 2) {
    blocks.push(currentBlock);
  }

  // Process each block
  for (const block of blocks) {
    // block[0] === '0', block[1] === entity type
    const entityType = block[1]?.toUpperCase();
    if (
      entityType !== 'LWPOLYLINE' &&
      entityType !== 'LINE' &&
      entityType !== 'CIRCLE' &&
      entityType !== 'ARC'
    ) {
      continue; // skip unsupported entity types
    }

    // Parse group codes from the block (pairs of lines: code, value)
    // Starting from index 2 (after '0' and entity type)
    const entity = parseEntityBlock(entityType, block.slice(2));
    if (entity !== null) {
      rawEntities.push(entity);
    }
  }

  return rawEntities;
}

/**
 * Parse a single entity block's group codes into a RawEntity.
 * Returns null if the entity is malformed or has NaN coordinates.
 *
 * Group codes:
 *   8  = layer name
 *   10 = X coordinate (start X for LINE, center X for CIRCLE/ARC, vertex X for LWPOLYLINE)
 *   20 = Y coordinate (start Y for LINE, center Y for CIRCLE/ARC, vertex Y for LWPOLYLINE)
 *   11 = end X for LINE
 *   21 = end Y for LINE
 *   40 = radius for CIRCLE/ARC
 *   50 = start angle (degrees) for ARC
 *   51 = end angle (degrees) for ARC
 *   70 = flags for LWPOLYLINE (bit 1 = closed)
 *   90 = vertex count for LWPOLYLINE (informational; we collect vertices dynamically)
 */
function parseEntityBlock(
  entityType: string,
  codeValueLines: string[]
): RawEntity | null {
  // Parse all group code/value pairs
  const codes: Map<number, string[]> = new Map();

  for (let i = 0; i + 1 < codeValueLines.length; i += 2) {
    const codeStr = codeValueLines[i].trim();
    const value = codeValueLines[i + 1].trim();
    const code = parseInt(codeStr, 10);
    if (isNaN(code)) continue;

    if (!codes.has(code)) {
      codes.set(code, []);
    }
    codes.get(code)!.push(value);
  }

  const layer = codes.get(8)?.[0] ?? '0';

  switch (entityType) {
    case 'LWPOLYLINE': {
      return parseLwPolyline(layer, codes);
    }
    case 'LINE': {
      return parseLine(layer, codes);
    }
    case 'CIRCLE': {
      return parseCircle(layer, codes);
    }
    case 'ARC': {
      return parseArc(layer, codes);
    }
    default:
      return null;
  }
}

function parseLwPolyline(
  layer: string,
  codes: Map<number, string[]>
): RawLwPolyline | null {
  // Vertices are stored as repeated group codes 10/20 pairs
  const xValues = codes.get(10) ?? [];
  const yValues = codes.get(20) ?? [];

  if (xValues.length === 0 || yValues.length === 0) {
    return null; // no vertices
  }

  const count = Math.min(xValues.length, yValues.length);
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    const x = parseFloat(xValues[i]);
    const y = parseFloat(yValues[i]);
    if (isNaN(x) || isNaN(y)) {
      return null; // malformed vertex
    }
    vertices.push({ x, y });
  }

  if (vertices.length < 1) {
    return null;
  }

  // Group code 70: flags; bit 1 (value 1) = closed
  const flagStr = codes.get(70)?.[0] ?? '0';
  const flags = parseInt(flagStr, 10);
  const closed = !isNaN(flags) && (flags & 1) !== 0;

  return { type: 'LWPOLYLINE', layer, vertices, closed };
}

function parseLine(
  layer: string,
  codes: Map<number, string[]>
): RawLine | null {
  const startX = parseFloat(codes.get(10)?.[0] ?? 'NaN');
  const startY = parseFloat(codes.get(20)?.[0] ?? 'NaN');
  const endX = parseFloat(codes.get(11)?.[0] ?? 'NaN');
  const endY = parseFloat(codes.get(21)?.[0] ?? 'NaN');

  if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
    return null;
  }

  return {
    type: 'LINE',
    layer,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
  };
}

function parseCircle(
  layer: string,
  codes: Map<number, string[]>
): RawCircle | null {
  const cx = parseFloat(codes.get(10)?.[0] ?? 'NaN');
  const cy = parseFloat(codes.get(20)?.[0] ?? 'NaN');
  const r = parseFloat(codes.get(40)?.[0] ?? 'NaN');

  if (isNaN(cx) || isNaN(cy) || isNaN(r) || r <= 0) {
    return null;
  }

  return { type: 'CIRCLE', layer, cx, cy, r };
}

function parseArc(
  layer: string,
  codes: Map<number, string[]>
): RawArc | null {
  const cx = parseFloat(codes.get(10)?.[0] ?? 'NaN');
  const cy = parseFloat(codes.get(20)?.[0] ?? 'NaN');
  const r = parseFloat(codes.get(40)?.[0] ?? 'NaN');
  const startAngleDeg = parseFloat(codes.get(50)?.[0] ?? 'NaN');
  const endAngleDeg = parseFloat(codes.get(51)?.[0] ?? 'NaN');

  if (
    isNaN(cx) ||
    isNaN(cy) ||
    isNaN(r) ||
    r <= 0 ||
    isNaN(startAngleDeg) ||
    isNaN(endAngleDeg)
  ) {
    return null;
  }

  return { type: 'ARC', layer, cx, cy, r, startAngleDeg, endAngleDeg };
}

// ── toParsedPointSet ─────────────────────────────────────────

/**
 * Convert an array of raw DXF entities into a ParsedPointSet.
 *
 * - LWPOLYLINE: one ParsedPoint per vertex in order
 * - LINE: exactly two points (start, end)
 * - CIRCLE: exactly 36 points at angle_k = k * 10° for k = 0..35
 * - ARC: ceil(sweep/10) points; first at startDeg, interior at 10° steps, last at endDeg
 *
 * All points have:
 *   id = 'p_<counter>' (counter increments globally within the call)
 *   targetLat = null, targetLon = null
 *   isControlPoint = false, isTransformed = false
 */
export function toParsedPointSet(
  rawEntities: RawEntity[]
): { points: ParsedPointSet; warnings: string[] } {
  const points: ParsedPoint[] = [];
  const warnings: string[] = [];
  let counter = 0;

  const nextId = (): string => `p_${++counter}`;

  for (const entity of rawEntities) {
    switch (entity.type) {
      case 'LWPOLYLINE': {
        emitLwPolyline(entity, points, nextId);
        break;
      }
      case 'LINE': {
        emitLine(entity, points, nextId);
        break;
      }
      case 'CIRCLE': {
        emitCircle(entity, points, nextId);
        break;
      }
      case 'ARC': {
        emitArc(entity, points, nextId);
        break;
      }
    }
  }

  return { points, warnings };
}

// ── Entity emitters ──────────────────────────────────────────

function emitLwPolyline(
  entity: RawLwPolyline,
  points: ParsedPoint[],
  nextId: () => string
): void {
  const { layer, vertices, closed } = entity;
  const allVertices = vertices.map((v) => ({ x: v.x, y: v.y }));

  for (let i = 0; i < vertices.length; i++) {
    const isLast = i === vertices.length - 1;
    const controlCode = closed && isLast ? 'CLS' : '';

    const sourceEntity: LwPolylineSource = {
      kind: 'LWPOLYLINE',
      vertices: allVertices,
      closed,
      vertexIndex: i,
    };

    points.push({
      id: nextId(),
      lineCode: layer,
      controlCode,
      sourceX: vertices[i].x,
      sourceY: vertices[i].y,
      entityType: 'LWPOLYLINE',
      layer,
      targetLat: null,
      targetLon: null,
      isControlPoint: false,
      isTransformed: false,
      isTessellated: false,
      sourceEntity,
    });
  }
}

function emitLine(
  entity: RawLine,
  points: ParsedPoint[],
  nextId: () => string
): void {
  const { layer, start, end } = entity;

  const startSource: LineSource = {
    kind: 'LINE',
    start,
    end,
    endpoint: 'start',
  };

  points.push({
    id: nextId(),
    lineCode: layer,
    controlCode: '',
    sourceX: start.x,
    sourceY: start.y,
    entityType: 'LINE',
    layer,
    targetLat: null,
    targetLon: null,
    isControlPoint: false,
    isTransformed: false,
    isTessellated: false,
    sourceEntity: startSource,
  });

  const endSource: LineSource = {
    kind: 'LINE',
    start,
    end,
    endpoint: 'end',
  };

  points.push({
    id: nextId(),
    lineCode: layer,
    controlCode: '',
    sourceX: end.x,
    sourceY: end.y,
    entityType: 'LINE',
    layer,
    targetLat: null,
    targetLon: null,
    isControlPoint: false,
    isTransformed: false,
    isTessellated: false,
    sourceEntity: endSource,
  });
}

function emitCircle(
  entity: RawCircle,
  points: ParsedPoint[],
  nextId: () => string
): void {
  const { layer, cx, cy, r } = entity;

  for (let k = 0; k < 36; k++) {
    const angleDeg = k * 10;
    const angleRad = (angleDeg * Math.PI) / 180;
    const sourceX = cx + r * Math.cos(angleRad);
    const sourceY = cy + r * Math.sin(angleRad);

    const sourceEntity: CircleSource = {
      kind: 'CIRCLE',
      cx,
      cy,
      r,
      sampleIndex: k,
    };

    points.push({
      id: nextId(),
      lineCode: layer,
      controlCode: '',
      sourceX,
      sourceY,
      entityType: 'CIRCLE',
      layer,
      targetLat: null,
      targetLon: null,
      isControlPoint: false,
      isTransformed: false,
      isTessellated: true,
      sourceEntity,
    });
  }
}

function emitArc(
  entity: RawArc,
  points: ParsedPoint[],
  nextId: () => string
): void {
  const { layer, cx, cy, r, startAngleDeg, endAngleDeg } = entity;

  // Compute sweep in (0, 360]
  let sweep = ((endAngleDeg - startAngleDeg) % 360 + 360) % 360;
  if (sweep === 0) {
    sweep = 360;
  }

  // Number of points = ceil(sweep / 10)
  const sampleCount = Math.ceil(sweep / 10);

  for (let i = 0; i < sampleCount; i++) {
    let angleDeg: number;
    if (i === 0) {
      // First point exactly at startAngleDeg
      angleDeg = startAngleDeg;
    } else if (i === sampleCount - 1) {
      // Last point exactly at endAngleDeg
      angleDeg = endAngleDeg;
    } else {
      // Interior points at 10° intervals from startAngleDeg
      angleDeg = startAngleDeg + i * 10;
    }

    const angleRad = (angleDeg * Math.PI) / 180;
    const sourceX = cx + r * Math.cos(angleRad);
    const sourceY = cy + r * Math.sin(angleRad);

    const sourceEntity: ArcSource = {
      kind: 'ARC',
      cx,
      cy,
      r,
      startAngleDeg,
      endAngleDeg,
      sampleIndex: i,
      sampleCount,
    };

    points.push({
      id: nextId(),
      lineCode: layer,
      controlCode: '',
      sourceX,
      sourceY,
      entityType: 'ARC',
      layer,
      targetLat: null,
      targetLon: null,
      isControlPoint: false,
      isTransformed: false,
      isTessellated: true,
      sourceEntity,
    });
  }
}

// ── parseDxfToPointSet ───────────────────────────────────────

/**
 * Parse a DXF text string directly into a ParsedPointSet.
 *
 * This is a lightweight raw parser that only handles the 4 supported
 * entity types (LWPOLYLINE, LINE, CIRCLE, ARC). It does NOT use the
 * existing parseDXF function, in order to preserve the CIRCLE/ARC
 * distinction (parseDXF converts both to Arc internally).
 *
 * Returns `{ points: [], warnings: ['No ENTITIES section'] }` when
 * no ENTITIES section is found in the text.
 */
export function parseDxfToPointSet(
  text: string
): { points: ParsedPointSet; warnings: string[] } {
  const rawEntities = parseRawEntities(text);

  if (rawEntities === null) {
    return { points: [], warnings: ['No ENTITIES section'] };
  }

  return toParsedPointSet(rawEntities);
}
