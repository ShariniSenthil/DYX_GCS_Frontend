// ============================================================
// Adapter: ParsedCoordinate → PathPlanWaypoint
// ============================================================
// Maintains backward compatibility with the existing PathPlanWaypoint
// type used throughout PathPlanScreen.tsx and downstream components.
//
// The new parser system returns ParserResult with ParsedCoordinate[].
// This adapter converts those to the old PathPlanWaypoint[] shape
// so that existing UI code, distance calculations, and upload flows
// continue to work without modification.

import { ParsedCoordinate } from './types';
import { PathPlanWaypoint } from '../../types/pathplan';

/**
 * Convert a single ParsedCoordinate to a PathPlanWaypoint.
 *
 * Mapping:
 *   latitude  → lat
 *   longitude → lon
 *   elevation → alt (default 0 if null)
 *   pile      → pile
 *   block     → block
 *   row       → row
 *   id        → id
 *   mark      → undefined (set by caller based on servo_enabled)
 *   distance  → 0 (calculated by caller)
 */
export function convertToPathPlanWaypoint(coord: ParsedCoordinate): PathPlanWaypoint {
  return {
    id: coord.id,
    lat: coord.latitude,
    lon: coord.longitude,
    alt: coord.elevation ?? 0,
    block: coord.block,
    row: coord.row,
    pile: coord.pile,
    distance: 0,
    mark: undefined,
  };
}

/**
 * Convert an array of ParsedCoordinate to PathPlanWaypoint[].
 * Convenience wrapper.
 */
export function convertToPathPlanWaypoints(coords: ParsedCoordinate[]): PathPlanWaypoint[] {
  return coords.map(convertToPathPlanWaypoint);
}
