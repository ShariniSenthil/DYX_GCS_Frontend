// ============================================================
// Command Parser — parse typed coordinate/distance/angle input
// ============================================================
//
// AutoCAD-style input formats:
//   50,30          Absolute coordinate
//   @12,5          Relative cartesian
//   @50<30         Relative polar
//   50             Distance only (angle from cursor)
//   <30            Angle only (distance from cursor)
//   c / close      Command keyword
//   u / undo       Command keyword
//   esc / cancel   Command keyword

import { WorldPoint } from './types';

export type ParsedInput =
  | { kind: 'absolute'; point: WorldPoint }
  | { kind: 'relative'; delta: WorldPoint }
  | { kind: 'polar'; distance: number; angle: number }
  | { kind: 'distance'; value: number }
  | { kind: 'angle'; degrees: number }
  | { kind: 'command'; name: string }
  | { kind: 'invalid' };

export function parseCADInput(raw: string, lastPoint: WorldPoint | null): ParsedInput {
  const s = raw.trim().toLowerCase();
  if (!s) return { kind: 'invalid' };

  // Command keywords
  if (s === 'c' || s === 'close') return { kind: 'command', name: 'close' };
  if (s === 'u' || s === 'undo') return { kind: 'command', name: 'undo' };
  if (s === 'esc' || s === 'cancel' || s === 'e') return { kind: 'command', name: 'cancel' };
  if (s === 'enter' || s === '') return { kind: 'command', name: 'enter' };

  // Relative polar: @dist<angle
  const polarMatch = s.match(/^@(-?\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)/);
  if (polarMatch) {
    const dist = parseFloat(polarMatch[1]);
    const angleDeg = parseFloat(polarMatch[2]);
    return { kind: 'polar', distance: dist, angle: angleDeg };
  }

  // Relative cartesian: @x,y
  const relMatch = s.match(/^@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (relMatch) {
    return { kind: 'relative', delta: { x: parseFloat(relMatch[1]), y: parseFloat(relMatch[2]) } };
  }

  // Angle only: <number
  const angMatch = s.match(/^<\s*(-?\d+(?:\.\d+)?)/);
  if (angMatch) {
    return { kind: 'angle', degrees: parseFloat(angMatch[1]) };
  }

  // Absolute cartesian: x,y
  const absMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (absMatch) {
    return { kind: 'absolute', point: { x: parseFloat(absMatch[1]), y: parseFloat(absMatch[2]) } };
  }

  // Distance only: number
  const distMatch = s.match(/^(-?\d+(?:\.\d+)?)/);
  if (distMatch) {
    return { kind: 'distance', value: parseFloat(distMatch[1]) };
  }

  return { kind: 'invalid' };
}

/**
 * Resolve a parsed input into a concrete world point.
 * Requires lastPoint for relative inputs.
 */
export function resolveParsedInput(
  input: ParsedInput,
  lastPoint: WorldPoint | null,
  cursorAngleDeg: number | null,
): WorldPoint | null {
  switch (input.kind) {
    case 'absolute':
      return input.point;
    case 'relative':
      if (!lastPoint) return null;
      return { x: lastPoint.x + input.delta.x, y: lastPoint.y + input.delta.y };
    case 'polar': {
      if (!lastPoint) return null;
      const rad = input.angle * Math.PI / 180;
      return { x: lastPoint.x + input.distance * Math.cos(rad), y: lastPoint.y + input.distance * Math.sin(rad) };
    }
    case 'distance': {
      if (!lastPoint || cursorAngleDeg == null) return null;
      const rad = cursorAngleDeg * Math.PI / 180;
      return { x: lastPoint.x + input.value * Math.cos(rad), y: lastPoint.y + input.value * Math.sin(rad) };
    }
    default:
      return null;
  }
}
