// ============================================================
// DXF Serializer — CADEntity[] → DXF text string
// ============================================================
//
// The inverse of dxfParser.ts. Takes our internal CADEntity[]
// and produces a valid DXF R12/R2000 text file that can be
// opened by AutoCAD, LibreCAD, or any DXF-aware backend.
//
// Output format: ASCII DXF with group codes.
// Minimum structure:
//   SECTION HEADER   ($ACADVER, $INSUNITS)
//   SECTION TABLES   (LAYER table)
//   SECTION ENTITIES (LINE, CIRCLE, ARC, LWPOLYLINE, POINT, TEXT)
//   EOF

import { CADEntity, CADLayer, UnitSystem } from './types';
import { UNIT_TO_METRES } from './types';

const DXF_UNIT_CODES: Record<UnitSystem, number> = {
  mm: 4,
  cm: 5,
  m: 6,
  in: 1,
  ft: 2,
};

/**
 * Serialize CADEntity[] into a complete DXF file string.
 */
export function entitiesToDXF(
  entities: CADEntity[],
  layers: CADLayer[] = [],
  units: UnitSystem = 'm',
): string {
  const lines: string[] = [];

  // ── HEADER section ──
  lines.push('  0', 'SECTION', '  2', 'HEADER');
  lines.push('  9', '$ACADVER', '  1', 'AC1015');
  lines.push('  9', '$INSUNITS', ' 70', String(DXF_UNIT_CODES[units]));
  lines.push('  0', 'ENDSEC');

  // ── TABLES section (LAYER table) ──
  lines.push('  0', 'SECTION', '  2', 'TABLES');
  lines.push('  0', 'TABLE', '  2', 'LAYER', ' 70', String(Math.max(layers.length, 1)));
  // Always include layer 0
  const seenLayers = new Set<string>();
  const allLayers: CADLayer[] = [
    { id: '0', name: '0', color: '#FFFFFF', visible: true, locked: false },
    ...layers,
  ];
  for (const layer of allLayers) {
    if (seenLayers.has(layer.name)) continue;
    seenLayers.add(layer.name);
    const colorNum = colorNameToACAD(layer.color);
    lines.push(
      '  0', 'LAYER',
      '  2', layer.name,
      ' 70', '0',
      ' 62', String(colorNum),
      '  6', 'CONTINUOUS',
    );
  }
  lines.push('  0', 'ENDTAB', '  0', 'ENDSEC');

  // ── ENTITIES section ──
  lines.push('  0', 'SECTION', '  2', 'ENTITIES');
  for (const e of entities) {
    serializeEntity(e, lines);
  }
  lines.push('  0', 'ENDSEC');

  // ── EOF ──
  lines.push('  0', 'EOF');

  return lines.join('\n');
}

function serializeEntity(e: CADEntity, out: string[]): void {
  switch (e.type) {
    case 'Line':
      out.push(
        '  0', 'LINE',
        '  8', e.layer,
        ' 10', fmt(e.start.x),
        ' 20', fmt(e.start.y),
        ' 30', '0.0',
        ' 11', fmt(e.end.x),
        ' 21', fmt(e.end.y),
        ' 31', '0.0',
      );
      break;

    case 'Circle':
      out.push(
        '  0', 'CIRCLE',
        '  8', e.layer,
        ' 10', fmt(e.center.x),
        ' 20', fmt(e.center.y),
        ' 30', '0.0',
        ' 40', fmt(e.radius),
      );
      break;

    case 'Arc':
      // DXF arc angles are in degrees
      out.push(
        '  0', 'ARC',
        '  8', e.layer,
        ' 10', fmt(e.center.x),
        ' 20', fmt(e.center.y),
        ' 30', '0.0',
        ' 40', fmt(e.radius),
        ' 50', fmt(radToDeg(e.startAngle)),
        ' 51', fmt(radToDeg(e.endAngle)),
      );
      break;

    case 'Point':
      out.push(
        '  0', 'POINT',
        '  8', e.layer,
        ' 10', fmt(e.position.x),
        ' 20', fmt(e.position.y),
        ' 30', '0.0',
      );
      break;

    case 'Text':
      out.push(
        '  0', 'TEXT',
        '  8', e.layer,
        ' 10', fmt(e.position.x),
        ' 20', fmt(e.position.y),
        ' 30', '0.0',
        ' 40', fmt(e.height),
        '  1', e.content,
        ' 50', fmt(radToDeg(e.rotation)),
      );
      break;

    case 'Polyline': {
      // LWPOLYLINE (lightweight polyline)
      out.push(
        '  0', 'LWPOLYLINE',
        '  8', e.layer,
        ' 90', String(e.vertices.length),
        ' 70', e.closed ? '1' : '0',
      );
      for (let i = 0; i < e.vertices.length; i++) {
        out.push(
          ' 10', fmt(e.vertices[i].x),
          ' 20', fmt(e.vertices[i].y),
        );
        if (e.bulges && e.bulges[i] !== 0) {
          out.push(' 42', fmt(e.bulges[i]));
        }
      }
      break;
    }

    case 'Rectangle': {
      // Serialize as closed LWPOLYLINE with 4 corners
      const c1 = e.corner1, c2 = e.corner2;
      out.push(
        '  0', 'LWPOLYLINE',
        '  8', e.layer,
        ' 90', '4',
        ' 70', '1',
        ' 10', fmt(c1.x), ' 20', fmt(c1.y),
        ' 10', fmt(c2.x), ' 20', fmt(c1.y),
        ' 10', fmt(c2.x), ' 20', fmt(c2.y),
        ' 10', fmt(c1.x), ' 20', fmt(c2.y),
      );
      break;
    }

    case 'Dimension':
      // Serialize as a LINE with dimension text
      out.push(
        '  0', 'LINE',
        '  8', e.layer,
        ' 10', fmt(e.p1.x),
        ' 20', fmt(e.p1.y),
        ' 30', '0.0',
        ' 11', fmt(e.p2.x),
        ' 21', fmt(e.p2.y),
        ' 31', '0.0',
        '  1', e.text,
      );
      break;
  }
}

// ============================================================
// Helpers
// ============================================================

/** Format a number for DXF — avoid scientific notation for small/large values */
function fmt(n: number): string {
  if (!isFinite(n)) return '0.0';
  if (Math.abs(n) < 1e-12) return '0.0';
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/** Radians to degrees */
function radToDeg(rad: number): number {
  return (rad * 180 / Math.PI + 360) % 360;
}

/** Approximate hex color → ACAD Color Index (ACI).
 *  Since ACI is 1-255, we use a simple hash for custom colors
 *  and map common ones directly. */
function colorNameToACAD(hexOrName: string): number {
  const map: Record<string, number> = {
    '#FF0000': 1,  // red
    '#FFFF00': 2,  // yellow
    '#00FF00': 3,  // green
    '#00FFFF': 4,  // cyan
    '#0000FF': 5,  // blue
    '#FF00FF': 6,  // magenta
    '#FFFFFF': 7,  // white/black
    '#22C55E': 3,  // green variant
    '#3B82F6': 5,  // blue variant
    '#F59E0B': 2,  // amber
    '#EF4444': 1,  // red variant
    '#A855F7': 6,  // purple
    '#6B7280': 8,  // gray
  };
  const upper = hexOrName.toUpperCase();
  if (map[upper] != null) return map[upper];
  // Hash fallback
  let hash = 0;
  for (let i = 0; i < hexOrName.length; i++) {
    hash = ((hash << 5) - hash + hexOrName.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 255) + 1;
}
