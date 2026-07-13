/**
 * Accuracy Calculation Utilities
 * Calculates position error using Haversine formula and determines accuracy levels
 */

/**
 * Calculate great-circle distance between two points using Haversine formula
 * @param lat1 Target latitude (degrees)
 * @param lon1 Target longitude (degrees)
 * @param lat2 Achieved latitude (degrees)
 * @param lon2 Achieved longitude (degrees)
 * @returns Distance in meters
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters (mean radius)
  
  const φ1 = (lat1 * Math.PI) / 180; // Convert to radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // Distance in meters

  return d;
}

/**
 * Determine accuracy level based on position error
 * Thresholds (in mm):
 * - Excellent: ≤ 30 mm
 * - Good: 30-60 mm
 * - Poor: > 60 mm (triggers servo suppression)
 * @param errorMm Position error in millimeters
 * @returns Object with accuracy level and color
 */
export interface AccuracyResult {
  level: 'excellent' | 'good' | 'poor';
  color: string;
  label: string;
}

export function getAccuracyLevel(errorMm: number): AccuracyResult {
  if (errorMm <= 30.0) {
    return {
      level: 'excellent',
      color: '#10B981', // Green
      label: 'Excellent',
    };
  } else if (errorMm <= 60.0) {
    return {
      level: 'good',
      color: '#F59E0B', // Orange
      label: 'Good',
    };
  } else {
    return {
      level: 'poor',
      color: '#EF4444', // Red
      label: 'Poor',
    };
  }
}

/**
 * Calculate position error in mm and determine accuracy level
 * @param targetLat Target waypoint latitude
 * @param targetLon Target waypoint longitude
 * @param achievedLat Rover's achieved latitude
 * @param achievedLon Rover's achieved longitude
 * @returns Position error in mm and accuracy result
 */
export function calculateAccuracy(
  targetLat: number,
  targetLon: number,
  achievedLat: number,
  achievedLon: number
): {
  errorMm: number;
  accuracy: AccuracyResult;
} {
  // Calculate distance in meters
  const distanceMeters = calculateHaversineDistance(
    targetLat,
    targetLon,
    achievedLat,
    achievedLon
  );

  // Convert to millimeters
  const errorMm = distanceMeters * 1000;

  // Get accuracy level
  const accuracy = getAccuracyLevel(errorMm);

  return {
    errorMm,
    accuracy,
  };
}

/**
 * Format accuracy display string
 * @param errorMm Error in millimeters
 * @param accuracy Accuracy result
 * @returns Formatted string like "Excellent - 35.0mm"
 */
export function formatAccuracyDisplay(errorMm: number, accuracy: AccuracyResult): string {
  // Always show 1 decimal place for mm values
  const displayError = errorMm.toFixed(1);
  return `${accuracy.label} - ${displayError}mm`;
}
