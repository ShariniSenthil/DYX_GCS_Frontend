// ============================================================
// geoToWaypoints Adapter — GeoEntity → PathPlanWaypoint[]
// ============================================================
//
// Converts georeferenced entities (lat/lon) into PathPlanWaypoint
// format used by the PathPlanScreen.
//
// This adapter extracts waypoints from:
//   - GeoLine endpoints
//   - GeoPolyline vertices (including arc segment endpoints)
//   - GeoArc curves (discretized into intermediate waypoints)
//   - GeoPointEntity positions
//
// The adapter is configurable: you can choose which entity types
// produce waypoints.

import { GeoEntity, GeoLine, GeoPolyline, GeoPointEntity, GeoArc } from '../../core/geometry/types';
import { PathPlanWaypoint } from '../../types/pathplan';

/** Configuration for the adapter */
export type GeoToWaypointConfig = {
  /** Include Line endpoints (default: true) */
  includeLines?: boolean;
  /** Include Polyline vertices (default: true) */
  includePolylines?: boolean;
  /** Include Arc centers as waypoints (default: false) */
  includeArcCenters?: boolean;
  /** Discretize Arc/Circle curves into waypoints along the path (default: true) */
  includeArcCurves?: boolean;
  /** Include Point entities as waypoints (default: true) */
  includePoints?: boolean;
  /** Default altitude for waypoints (default: 0) */
  defaultAlt?: number;
  /** Layer filter — only include entities from these layers (default: all) */
  layerFilter?: string[];
  /** Maximum distance (meters) between arc discretization points (default: 1.0) */
  arcResolution?: number;
};

const DEFAULT_CONFIG: Required<GeoToWaypointConfig> = {
  includeLines: true,
  includePolylines: true,
  includeArcCenters: false,
  includeArcCurves: true,
  includePoints: true,
  defaultAlt: 0,
  layerFilter: [],
  arcResolution: 1.0,
};

function passesLayerFilter(layer: string | undefined, filter: string[]): boolean {
  if (filter.length === 0) return true;
  if (!layer) return false;
  return filter.includes(layer);
}

/**
 * Discretize an arc into a sequence of lat/lon points along the curve.
 * Produces waypoints at regular distance intervals along the arc,
 * plus the arc endpoint.
 */
function discretizeArc(
  center: { lat: number; lon: number },
  radiusMeters: number,
  startAngle: number,
  endAngle: number,
  resolution: number,
  defaultAlt: number,
  idStart: number,
  prefix: string,
): { waypoints: PathPlanWaypoint[]; nextId: number } {
  let wpId = idStart;
  const waypoints: PathPlanWaypoint[] = [];

  // Normalize angles so sweep is always positive (CCW)
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 2 * Math.PI;
  if (sweep < 1e-10) return { waypoints, nextId: wpId };

  // Arc length in meters
  const arcLength = radiusMeters * sweep;

  // Number of intermediate points based on resolution
  const numPoints = Math.max(2, Math.ceil(arcLength / resolution));

  // ENU conversion factors (approximate, for small areas)
  const EARTH_RADIUS = 6378137;
  const latRad = center.lat * Math.PI / 180;
  const metersPerDegLat = EARTH_RADIUS * Math.PI / 180;
  const metersPerDegLon = metersPerDegLat * Math.cos(latRad);

  for (let i = 0; i <= numPoints; i++) {
    // Skip the last point if it will be covered by the next segment's start
    // (we include it for standalone arcs but skip for polyline-embedded arcs)
    const angle = startAngle + (sweep * i) / numPoints;

    // Point on circle in local ENU meters (East = X, North = Y)
    const eastM = radiusMeters * Math.cos(angle);
    const northM = radiusMeters * Math.sin(angle);

    // Convert ENU offset to lat/lon delta
    const lat = center.lat + (northM / metersPerDegLat);
    const lon = center.lon + (eastM / metersPerDegLon);

    waypoints.push({
      id: wpId++,
      lat,
      lon,
      alt: defaultAlt,
      distance: 0,
      block: '',
      row: '',
      pile: `${prefix}_p${i}`,
      mark: false,
    });
  }

  return { waypoints, nextId: wpId };
}

/**
 * Convert GeoEntity[] → PathPlanWaypoint[]
 *
 * @param geoEntities - Georeferenced entities from georeferenceCAD
 * @param config - Adapter configuration
 * @returns PathPlanWaypoint array ready for updateWaypoints()
 */
export function geoEntitiesToWaypoints(
  geoEntities: GeoEntity[],
  config: GeoToWaypointConfig = {}
): PathPlanWaypoint[] {
  const cfg: Required<GeoToWaypointConfig> = { ...DEFAULT_CONFIG, ...config };
  const waypoints: PathPlanWaypoint[] = [];
  let wpId = 1;

  for (const entity of geoEntities) {
    // Layer filter
    if (!passesLayerFilter(entity.layer, cfg.layerFilter)) continue;

    switch (entity.type) {
      case 'Line': {
        if (!cfg.includeLines) continue;
        const line = entity as GeoLine;

        // Start point
        waypoints.push({
          id: wpId++,
          lat: line.geoStart.lat,
          lon: line.geoStart.lon,
          alt: line.geoStart.alt ?? cfg.defaultAlt,
          distance: 0,
          block: '',
          row: '',
          pile: `line_${wpId - 1}_start`,
          mark: false,
        });

        // End point
        waypoints.push({
          id: wpId++,
          lat: line.geoEnd.lat,
          lon: line.geoEnd.lon,
          alt: line.geoEnd.alt ?? cfg.defaultAlt,
          distance: 0,
          block: '',
          row: '',
          pile: `line_${wpId - 1}_end`,
          mark: false,
        });
        break;
      }

      case 'Point': {
        if (!cfg.includePoints) continue;
        const pt = entity as GeoPointEntity;

        waypoints.push({
          id: wpId++,
          lat: pt.geoPosition.lat,
          lon: pt.geoPosition.lon,
          alt: pt.geoPosition.alt ?? cfg.defaultAlt,
          distance: 0,
          block: '',
          row: '',
          pile: `point_${wpId - 1}`,
          mark: false,
        });
        break;
      }

      case 'Polyline': {
        if (!cfg.includePolylines) continue;
        const pl = entity as GeoPolyline;

        // Start vertex
        waypoints.push({
          id: wpId++,
          lat: pl.startGeo.lat,
          lon: pl.startGeo.lon,
          alt: pl.startGeo.alt ?? cfg.defaultAlt,
          distance: 0,
          block: '',
          row: '',
          pile: `polyline_${wpId - 1}_start`,
          mark: false,
        });

        // Subsequent vertices — discretize arc segments along the curve
        for (let i = 0; i < pl.segments.length; i++) {
          const seg = pl.segments[i];

          if (seg.segmentType === 'Arc' && cfg.includeArcCurves) {
            // Discretize arc segment into intermediate points
            const result = discretizeArc(
              seg.centerGeo,
              seg.radius,
              seg.startAngle,
              seg.endAngle,
              cfg.arcResolution,
              cfg.defaultAlt,
              wpId,
              `polyline_arc_${wpId}`,
            );
            // Skip the first point (it's the same as the previous segment's end/start vertex)
            // but include the rest
            for (let j = 1; j < result.waypoints.length; j++) {
              waypoints.push(result.waypoints[j]);
            }
            wpId = result.nextId;
          } else {
            // Line segment — just the endpoint
            waypoints.push({
              id: wpId++,
              lat: seg.toGeo.lat,
              lon: seg.toGeo.lon,
              alt: seg.toGeo.alt ?? cfg.defaultAlt,
              distance: 0,
              block: '',
              row: '',
              pile: `polyline_${wpId - 1}_v${i + 1}`,
              mark: false,
            });
          }
        }
        break;
      }

      case 'Arc': {
        const arc = entity as GeoArc;

        if (cfg.includeArcCurves) {
          // Discretize the full arc/circle into waypoints along the curve
          const result = discretizeArc(
            arc.geoCenter,
            arc.radius,
            arc.startAngle,
            arc.endAngle,
            cfg.arcResolution,
            cfg.defaultAlt,
            wpId,
            `arc_${wpId}`,
          );
          waypoints.push(...result.waypoints);
          wpId = result.nextId;
        } else if (cfg.includeArcCenters) {
          // Fallback: just the center point
          waypoints.push({
            id: wpId++,
            lat: arc.geoCenter.lat,
            lon: arc.geoCenter.lon,
            alt: arc.geoCenter.alt ?? cfg.defaultAlt,
            distance: 0,
            block: '',
            row: '',
            pile: `arc_center_${wpId - 1}`,
            mark: false,
          });
        }
        break;
      }
      case 'Text':
        // Text entities don't produce waypoints
        break;
    }
  }

  return waypoints;
}

/**
 * Extract ONLY polyline vertices as waypoints (most common use case).
 * This produces a continuous path following the CAD drawing.
 */
export function extractPolylineWaypoints(
  geoEntities: GeoEntity[],
  config: GeoToWaypointConfig = {}
): PathPlanWaypoint[] {
  return geoEntitiesToWaypoints(geoEntities, {
    ...config,
    includeLines: false,
    includePolylines: true,
    includeArcCenters: false,
    includeArcCurves: true,
    includePoints: false,
  });
}

/**
 * Extract ALL entity endpoints/vertices as waypoints.
 * This produces the densest waypoint set.
 */
export function extractAllWaypoints(
  geoEntities: GeoEntity[],
  config: GeoToWaypointConfig = {}
): PathPlanWaypoint[] {
  return geoEntitiesToWaypoints(geoEntities, {
    ...config,
    includeLines: true,
    includePolylines: true,
    includeArcCenters: false,
    includeArcCurves: true,
    includePoints: true,
  });
}