// ============================================================
// Shared fast-check generators — DXF parser property tests
// ============================================================
//
// Provides arbitraries for DXF entity objects and serialized DXF text.
// Used by property tests in the dxf-localization-pipeline spec.
//
// Requirements: 2.1, 2.2, 2.3, 3.1, 4.1, 5.1, 6.1
// ============================================================

import * as fc from 'fast-check';

// ── Entity type definitions ──────────────────────────────────

export type LwPolylineEntity = {
  type: 'LWPOLYLINE';
  layer: string;
  vertices: { x: number; y: number }[];
  closed: boolean;
};

export type LineEntity = {
  type: 'LINE';
  layer: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type CircleEntity = {
  type: 'CIRCLE';
  layer: string;
  cx: number;
  cy: number;
  r: number;
};

export type ArcEntity = {
  type: 'ARC';
  layer: string;
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
};

export type DxfEntity = LwPolylineEntity | LineEntity | CircleEntity | ArcEntity;

// ── arbEntityLayer ───────────────────────────────────────────

/**
 * Produces short printable ASCII layer strings (1–8 chars, printable ASCII 0x20–0x7E).
 */
export const arbEntityLayer: fc.Arbitrary<string> = fc
  .array(
    fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code)),
    { minLength: 1, maxLength: 8 }
  )
  .map((chars) => chars.join(''));

// ── arbLwPolyline ────────────────────────────────────────────

/**
 * Generates an LWPOLYLINE entity with 2–20 vertices (each x,y in [-1000,1000]),
 * a random closed boolean, and a layer string.
 */
export const arbLwPolyline: fc.Arbitrary<LwPolylineEntity> = fc
  .record({
    layer: arbEntityLayer,
    vertices: fc.array(
      fc.record({
        x: fc.float({ min: -1000, max: 1000, noNaN: true }),
        y: fc.float({ min: -1000, max: 1000, noNaN: true }),
      }),
      { minLength: 2, maxLength: 20 }
    ),
    closed: fc.boolean(),
  })
  .map(({ layer, vertices, closed }) => ({
    type: 'LWPOLYLINE' as const,
    layer,
    vertices,
    closed,
  }));

// ── arbLine ──────────────────────────────────────────────────

/**
 * Generates a LINE entity with two random 2D points (start/end, each x,y in [-1000,1000])
 * plus a layer string.
 */
export const arbLine: fc.Arbitrary<LineEntity> = fc
  .record({
    layer: arbEntityLayer,
    start: fc.record({
      x: fc.float({ min: -1000, max: 1000, noNaN: true }),
      y: fc.float({ min: -1000, max: 1000, noNaN: true }),
    }),
    end: fc.record({
      x: fc.float({ min: -1000, max: 1000, noNaN: true }),
      y: fc.float({ min: -1000, max: 1000, noNaN: true }),
    }),
  })
  .map(({ layer, start, end }) => ({
    type: 'LINE' as const,
    layer,
    start,
    end,
  }));

// ── arbCircle ────────────────────────────────────────────────

/**
 * Generates a CIRCLE entity with center in [-1000,1000]² and radius in (0,1000],
 * plus a layer string.
 */
export const arbCircle: fc.Arbitrary<CircleEntity> = fc
  .record({
    layer: arbEntityLayer,
    cx: fc.float({ min: -1000, max: 1000, noNaN: true }),
    cy: fc.float({ min: -1000, max: 1000, noNaN: true }),
    // radius strictly > 0: use a small positive min to avoid r=0
    r: fc.float({ min: 1e-6, max: 1000, noNaN: true }),
  })
  .map(({ layer, cx, cy, r }) => ({
    type: 'CIRCLE' as const,
    layer,
    cx,
    cy,
    r,
  }));

// ── arbArc ───────────────────────────────────────────────────

/**
 * Generates an ARC entity built on arbCircle plus two distinct angles
 * startDeg and endDeg in [0, 360) where startDeg !== endDeg.
 */
export const arbArc: fc.Arbitrary<ArcEntity> = fc
  .tuple(
    arbCircle,
    // Generate two distinct integer-degree angles in [0, 359]
    fc.integer({ min: 0, max: 359 }),
    fc.integer({ min: 1, max: 359 }) // offset from startDeg, ensures != 0
  )
  .map(([circle, startDeg, offset]) => {
    const endDeg = (startDeg + offset) % 360;
    return {
      type: 'ARC' as const,
      layer: circle.layer,
      cx: circle.cx,
      cy: circle.cy,
      r: circle.r,
      startDeg,
      endDeg,
    };
  });

// ── arbEntitiesSection ───────────────────────────────────────

/**
 * Mixes the above entity types into an array of 1–10 entities.
 */
export const arbEntitiesSection: fc.Arbitrary<DxfEntity[]> = fc.array(
  fc.oneof(
    arbLwPolyline,
    arbLine,
    arbCircle,
    arbArc
  ),
  { minLength: 1, maxLength: 10 }
);

// ── DXF serialization helpers ────────────────────────────────

function serializeLwPolyline(e: LwPolylineEntity): string {
  const lines: string[] = [
    '0',
    'LWPOLYLINE',
    '8',
    e.layer,
    '70',
    e.closed ? '1' : '0',
    '90',
    String(e.vertices.length),
  ];
  for (const v of e.vertices) {
    lines.push('10', String(v.x), '20', String(v.y));
  }
  return lines.join('\n');
}

function serializeLine(e: LineEntity): string {
  return [
    '0', 'LINE',
    '8', e.layer,
    '10', String(e.start.x),
    '20', String(e.start.y),
    '11', String(e.end.x),
    '21', String(e.end.y),
  ].join('\n');
}

function serializeCircle(e: CircleEntity): string {
  return [
    '0', 'CIRCLE',
    '8', e.layer,
    '10', String(e.cx),
    '20', String(e.cy),
    '40', String(e.r),
  ].join('\n');
}

function serializeArc(e: ArcEntity): string {
  return [
    '0', 'ARC',
    '8', e.layer,
    '10', String(e.cx),
    '20', String(e.cy),
    '40', String(e.r),
    '50', String(e.startDeg),
    '51', String(e.endDeg),
  ].join('\n');
}

function serializeEntity(e: DxfEntity): string {
  switch (e.type) {
    case 'LWPOLYLINE': return serializeLwPolyline(e);
    case 'LINE':       return serializeLine(e);
    case 'CIRCLE':     return serializeCircle(e);
    case 'ARC':        return serializeArc(e);
  }
}

/** Noise section names that can appear before/after ENTITIES */
const NOISE_SECTION_NAMES = ['HEADER', 'BLOCKS', 'CLASSES', 'TABLES', 'OBJECTS'] as const;

function buildNoiseSection(name: string): string {
  return `0\nSECTION\n2\n${name}\n0\nENDSEC`;
}

// ── arbDxfText ───────────────────────────────────────────────

/**
 * Serializes an arbEntitiesSection to valid DXF text.
 * Optionally wraps with noise sections (HEADER, BLOCKS, CLASSES, TABLES, OBJECTS)
 * before/after the ENTITIES section.
 *
 * Returns both the entity objects (for computing expected counts) and the
 * serialized DXF text.
 */
export const arbDxfText: fc.Arbitrary<{ entities: DxfEntity[]; text: string }> = fc
  .tuple(
    arbEntitiesSection,
    // One boolean per noise section: whether to include it before ENTITIES
    fc.boolean(), // HEADER
    fc.boolean(), // BLOCKS
    fc.boolean(), // CLASSES
    fc.boolean(), // TABLES
    fc.boolean(), // OBJECTS (after ENTITIES)
  )
  .map(([entities, addHeader, addBlocks, addClasses, addTables, addObjects]) => {
    const parts: string[] = [];

    // Optional noise sections before ENTITIES
    if (addHeader)  parts.push(buildNoiseSection('HEADER'));
    if (addClasses) parts.push(buildNoiseSection('CLASSES'));
    if (addTables)  parts.push(buildNoiseSection('TABLES'));
    if (addBlocks)  parts.push(buildNoiseSection('BLOCKS'));

    // ENTITIES section
    const entityLines = entities.map(serializeEntity).join('\n');
    parts.push(
      `0\nSECTION\n2\nENTITIES\n${entityLines}\n0\nENDSEC`
    );

    // Optional noise section after ENTITIES
    if (addObjects) parts.push(buildNoiseSection('OBJECTS'));

    // EOF marker
    parts.push('0\nEOF');

    const text = parts.join('\n');
    return { entities, text };
  });
