/**
 * Geometric pattern generation utilities for mission planning
 * Includes circle, grid, polygon, and other pattern generators
 */

import { vincentyDistance } from './missionCalculator';

const EARTH_RADIUS_M = 6378137; // Earth radius in meters

/**
 * Calculate distance between two points using Vincenty formula
 * More accurate than Haversine (±0.5mm vs ±0.5%)
 */
export function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  return vincentyDistance(
    { lat: point1.lat, lon: point1.lng },
    { lat: point2.lat, lon: point2.lng }
  );
}

/**
 * Calculate bearing from point1 to point2 in degrees
 */
export function calculateBearing(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const lat1 = (point1.lat * Math.PI) / 180;
  const lat2 = (point2.lat * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = Math.atan2(y, x);

  return ((bearing * 180) / Math.PI + 360) % 360;
}

/**
 * Calculate destination point given start point, bearing, and distance
 */
export function calculateDestination(
  start: { lat: number; lng: number },
  bearing: number,
  distance: number
): { lat: number; lng: number } {
  const R = EARTH_RADIUS_M;
  const bearingRad = (bearing * Math.PI) / 180;
  const lat1 = (start.lat * Math.PI) / 180;
  const lng1 = (start.lng * Math.PI) / 180;
  const angularDistance = distance / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

/**
 * Generate circular mission waypoints
 */
export interface CircleWaypointParams {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  numPoints: number;
  altitude: number;
  startAngleDeg?: number;
  clockwise?: boolean;
}

export function generateCircleWaypoints(
  params: CircleWaypointParams
): { lat: number; lng: number; alt: number }[] {
  const {
    centerLat,
    centerLng,
    radiusM,
    numPoints,
    altitude,
    startAngleDeg = 0,
    clockwise = true,
  } = params;

  const waypoints: { lat: number; lng: number; alt: number }[] = [];
  const direction = clockwise ? 1 : -1;

  for (let i = 0; i < numPoints; i++) {
    const angleStep = (360 / numPoints) * direction;
    const angleDeg = startAngleDeg + i * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;

    // Calculate lat/lng offset
    const dLat = ((radiusM * Math.cos(angleRad)) / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLng =
      ((radiusM * Math.sin(angleRad)) /
        (EARTH_RADIUS_M * Math.cos((centerLat * Math.PI) / 180))) *
      (180 / Math.PI);

    waypoints.push({
      lat: centerLat + dLat,
      lng: centerLng + dLng,
      alt: altitude,
    });
  }

  // Add closing waypoint to complete circle
  if (waypoints.length > 0) {
    waypoints.push({ ...waypoints[0] });
  }

  return waypoints;
}

/**
 * Generate regular polygon waypoints (hexagon, octagon, etc.)
 */
export function generateRegularPolygonWaypoints(
  center: { lat: number; lng: number },
  radiusM: number,
  numSides: number,
  startBearing: number,
  altitude: number
): { lat: number; lng: number; alt: number }[] {
  const waypoints: { lat: number; lng: number; alt: number }[] = [];
  const angleStep = 360 / numSides;

  for (let i = 0; i < numSides; i++) {
    const bearing = startBearing + i * angleStep;
    const point = calculateDestination(center, bearing, radiusM);
    waypoints.push({
      lat: point.lat,
      lng: point.lng,
      alt: altitude,
    });
  }

  // Close the polygon
  if (waypoints.length > 0) {
    waypoints.push({ ...waypoints[0] });
  }

  return waypoints;
}

/**
 * Generate survey grid mission with serpentine (lawnmower) pattern
 */
export interface SurveyGridParams {
  centerLat: number;
  centerLng: number;
  widthM: number;
  heightM: number;
  laneSpacingM: number;
  angleDegree: number;
  altitude: number;
  overlapPercent?: number;
}

export function generateSurveyGrid(
  params: SurveyGridParams
): { lat: number; lng: number; alt: number }[] {
  const {
    centerLat,
    centerLng,
    widthM,
    heightM,
    laneSpacingM,
    angleDegree,
    altitude,
    overlapPercent = 0,
  } = params;

  const waypoints: { lat: number; lng: number; alt: number }[] = [];
  const angleRad = (angleDegree * Math.PI) / 180;

  // Calculate effective spacing with overlap
  const effectiveSpacing = laneSpacingM * (1 - overlapPercent / 100);

  // Calculate number of lanes
  const numLanes = Math.max(2, Math.ceil(widthM / effectiveSpacing));

  // Calculate half dimensions
  const halfWidth = widthM / 2;
  const halfHeight = heightM / 2;

  for (let lane = 0; lane < numLanes; lane++) {
    // Calculate offset from center for this lane
    const laneOffset = -halfWidth + lane * effectiveSpacing;

    // Determine direction (alternate for serpentine pattern)
    const forward = lane % 2 === 0;

    // Calculate start and end points for this lane
    const startY = forward ? -halfHeight : halfHeight;
    const endY = forward ? halfHeight : -halfHeight;

    // Create waypoints for this lane (start and end)
    for (const y of forward ? [startY, endY] : [startY, endY]) {
      // Rotate and translate relative to grid center
      const rotatedX = laneOffset * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = laneOffset * Math.sin(angleRad) + y * Math.cos(angleRad);

      // Convert meters to lat/lng offset
      const latOffset = (rotatedY / EARTH_RADIUS_M) * (180 / Math.PI);
      const lngOffset =
        (rotatedX / (EARTH_RADIUS_M * Math.cos((centerLat * Math.PI) / 180))) *
        (180 / Math.PI);

      waypoints.push({
        lat: centerLat + latOffset,
        lng: centerLng + lngOffset,
        alt: altitude,
      });
    }
  }

  return waypoints;
}

/**
 * Generate rectangle waypoints
 */
export function generateRectangleWaypoints(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
  altitude: number
): { lat: number; lng: number; alt: number }[] {
  const minLat = Math.min(point1.lat, point2.lat);
  const maxLat = Math.max(point1.lat, point2.lat);
  const minLng = Math.min(point1.lng, point2.lng);
  const maxLng = Math.max(point1.lng, point2.lng);

  return [
    { lat: minLat, lng: minLng, alt: altitude }, // SW
    { lat: maxLat, lng: minLng, alt: altitude }, // NW
    { lat: maxLat, lng: maxLng, alt: altitude }, // NE
    { lat: minLat, lng: maxLng, alt: altitude }, // SE
    { lat: minLat, lng: minLng, alt: altitude }, // Close rectangle
  ];
}

/**
 * Check if point is inside polygon using ray casting algorithm
 */
export function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng,
      yi = polygon[i].lat;
    const xj = polygon[j].lng,
      yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Generate polygon survey with serpentine pattern
 */
export interface PolygonSurveyParams {
  polygon: { lat: number; lng: number }[];
  spacingM: number;
  altitude: number;
  angleDeg: number;
}

export function generatePolygonSurvey(
  params: PolygonSurveyParams
): { lat: number; lng: number; alt: number }[] {
  const { polygon, spacingM, altitude, angleDeg } = params;

  if (polygon.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }

  const waypoints: { lat: number; lng: number; alt: number }[] = [];
  const angleRad = (angleDeg * Math.PI) / 180;

  // Find bounding box
  const minLat = Math.min(...polygon.map((p) => p.lat));
  const maxLat = Math.max(...polygon.map((p) => p.lat));
  const minLng = Math.min(...polygon.map((p) => p.lng));
  const maxLng = Math.max(...polygon.map((p) => p.lng));

  // Calculate polygon center
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Calculate bounding box dimensions in meters
  const latDiffM = (maxLat - minLat) * (EARTH_RADIUS_M * Math.PI / 180);
  const lngDiffM =
    (maxLng - minLng) *
    (EARTH_RADIUS_M * Math.cos((centerLat * Math.PI) / 180) * Math.PI / 180);
  const maxDim = Math.max(latDiffM, lngDiffM);

  // Number of survey lines
  const numLines = Math.ceil(maxDim / spacingM) + 2;

  // Generate survey lines
  for (let i = 0; i < numLines; i++) {
    const offset = -maxDim / 2 + i * spacingM;
    const linePoints: { lat: number; lng: number }[] = [];

    // Generate points along this survey line
    const numPointsPerLine = 50; // Sample points along line
    for (let j = 0; j <= numPointsPerLine; j++) {
      const along = -maxDim / 2 + (j * maxDim) / numPointsPerLine;

      // Calculate point position (rotated)
      const rotX = offset * Math.cos(angleRad) - along * Math.sin(angleRad);
      const rotY = offset * Math.sin(angleRad) + along * Math.cos(angleRad);

      // Convert to lat/lng
      const lat = centerLat + (rotY / EARTH_RADIUS_M) * (180 / Math.PI);
      const lng =
        centerLng +
        (rotX / (EARTH_RADIUS_M * Math.cos((centerLat * Math.PI) / 180))) *
          (180 / Math.PI);

      // Check if point is inside polygon
      if (pointInPolygon({ lat, lng }, polygon)) {
        linePoints.push({ lat, lng });
      }
    }

    // If we have points on this line, add first and last as waypoints
    if (linePoints.length >= 2) {
      // Alternate direction for serpentine pattern
      const points =
        i % 2 === 0
          ? [linePoints[0], linePoints[linePoints.length - 1]]
          : [linePoints[linePoints.length - 1], linePoints[0]];

      points.forEach((pt) => {
        waypoints.push({
          lat: pt.lat,
          lng: pt.lng,
          alt: altitude,
        });
      });
    }
  }

  return waypoints;
}
