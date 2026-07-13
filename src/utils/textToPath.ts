/**
 * Convert text characters to waypoint coordinates
 * Each character is rendered as a series of waypoints forming its shape
 */

// Simple 7-segment style character definitions (normalized to 0-1 scale)
// Each character is an array of line segments [x1, y1, x2, y2]
const CHAR_SHAPES: { [key: string]: number[][] } = {
  'A': [[0, 1, 0.5, 0], [0.5, 0, 1, 1], [0.25, 0.5, 0.75, 0.5]],
  'B': [[0, 0, 0, 1], [0, 0, 0.7, 0], [0.7, 0, 1, 0.25], [1, 0.25, 0.7, 0.5], [0, 0.5, 0.7, 0.5], [0.7, 0.5, 1, 0.75], [1, 0.75, 0.7, 1], [0.7, 1, 0, 1]],
  'C': [[1, 0.2, 0.7, 0], [0.7, 0, 0.3, 0], [0.3, 0, 0, 0.2], [0, 0.2, 0, 0.8], [0, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 1, 0.8]],
  'D': [[0, 0, 0, 1], [0, 0, 0.6, 0], [0.6, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.6, 1], [0.6, 1, 0, 1]],
  'E': [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1], [0, 0.5, 0.7, 0.5]],
  'F': [[1, 0, 0, 0], [0, 0, 0, 1], [0, 0.5, 0.7, 0.5]],
  'G': [[1, 0.2, 0.7, 0], [0.7, 0, 0.3, 0], [0.3, 0, 0, 0.2], [0, 0.2, 0, 0.8], [0, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 1, 0.8], [1, 0.8, 1, 0.5], [1, 0.5, 0.5, 0.5]],
  'H': [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 1, 0.5]],
  'I': [[0.2, 0, 0.8, 0], [0.5, 0, 0.5, 1], [0.2, 1, 0.8, 1]],
  'J': [[0, 0, 1, 0], [0.5, 0, 0.5, 0.8], [0.5, 0.8, 0.3, 1], [0.3, 1, 0, 0.8]],
  'K': [[0, 0, 0, 1], [1, 0, 0, 0.5], [0, 0.5, 1, 1]],
  'L': [[0, 0, 0, 1], [0, 1, 1, 1]],
  'M': [[0, 1, 0, 0], [0, 0, 0.5, 0.4], [0.5, 0.4, 1, 0], [1, 0, 1, 1]],
  'N': [[0, 1, 0, 0], [0, 0, 1, 1], [1, 1, 1, 0]],
  'O': [[0.3, 0, 0.7, 0], [0.7, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.7], [0, 0.7, 0, 0.3], [0, 0.3, 0.3, 0]],
  'P': [[0, 1, 0, 0], [0, 0, 0.7, 0], [0.7, 0, 1, 0.2], [1, 0.2, 1, 0.4], [1, 0.4, 0.7, 0.5], [0.7, 0.5, 0, 0.5]],
  'Q': [[0.3, 0, 0.7, 0], [0.7, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.7], [0, 0.7, 0, 0.3], [0, 0.3, 0.3, 0], [0.6, 0.7, 1, 1.2]],
  'R': [[0, 1, 0, 0], [0, 0, 0.7, 0], [0.7, 0, 1, 0.2], [1, 0.2, 1, 0.4], [1, 0.4, 0.7, 0.5], [0.7, 0.5, 0, 0.5], [0.5, 0.5, 1, 1]],
  'S': [[1, 0.2, 0.7, 0], [0.7, 0, 0.3, 0], [0.3, 0, 0, 0.2], [0, 0.2, 0.3, 0.5], [0.3, 0.5, 0.7, 0.5], [0.7, 0.5, 1, 0.7], [1, 0.7, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.8]],
  'T': [[0, 0, 1, 0], [0.5, 0, 0.5, 1]],
  'U': [[0, 0, 0, 0.8], [0, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 1, 0.8], [1, 0.8, 1, 0]],
  'V': [[0, 0, 0.5, 1], [0.5, 1, 1, 0]],
  'W': [[0, 0, 0.2, 1], [0.2, 1, 0.5, 0.5], [0.5, 0.5, 0.8, 1], [0.8, 1, 1, 0]],
  'X': [[0, 0, 1, 1], [1, 0, 0, 1]],
  'Y': [[0, 0, 0.5, 0.5], [1, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 1]],
  'Z': [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 1, 1]],
  '0': [[0.3, 0, 0.7, 0], [0.7, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.7], [0, 0.7, 0, 0.3], [0, 0.3, 0.3, 0], [0.2, 0.2, 0.8, 0.8]],
  '1': [[0.3, 0.2, 0.5, 0], [0.5, 0, 0.5, 1], [0.2, 1, 0.8, 1]],
  '2': [[0, 0.2, 0.3, 0], [0.3, 0, 0.7, 0], [0.7, 0, 1, 0.2], [1, 0.2, 1, 0.4], [1, 0.4, 0, 1], [0, 1, 1, 1]],
  '3': [[0, 0.2, 0.3, 0], [0.3, 0, 0.7, 0], [0.7, 0, 1, 0.2], [1, 0.2, 1, 0.4], [1, 0.4, 0.7, 0.5], [0.4, 0.5, 0.7, 0.5], [0.7, 0.5, 1, 0.6], [1, 0.6, 1, 0.8], [1, 0.8, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.8]],
  '4': [[0.7, 0, 0.7, 1], [0.7, 0, 0, 0.7], [0, 0.7, 1, 0.7]],
  '5': [[1, 0, 0, 0], [0, 0, 0, 0.5], [0, 0.5, 0.7, 0.5], [0.7, 0.5, 1, 0.7], [1, 0.7, 1, 0.9], [1, 0.9, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0, 0.8]],
  '6': [[0.8, 0, 0.4, 0], [0.4, 0, 0, 0.3], [0, 0.3, 0, 0.8], [0, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 1, 0.8], [1, 0.8, 1, 0.6], [1, 0.6, 0.7, 0.5], [0.7, 0.5, 0, 0.5]],
  '7': [[0, 0, 1, 0], [1, 0, 0.5, 1]],
  '8': [[0.3, 0, 0.7, 0], [0.7, 0, 1, 0.2], [1, 0.2, 1, 0.3], [1, 0.3, 0.7, 0.5], [0.7, 0.5, 0.3, 0.5], [0.3, 0.5, 0, 0.3], [0, 0.3, 0, 0.2], [0, 0.2, 0.3, 0], [0.3, 0.5, 0, 0.7], [0, 0.7, 0, 0.8], [0, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 1, 0.8], [1, 0.8, 1, 0.7], [1, 0.7, 0.7, 0.5]],
  '9': [[1, 0.7, 1, 0.2], [1, 0.2, 0.7, 0], [0.7, 0, 0.3, 0], [0.3, 0, 0, 0.2], [0, 0.2, 0, 0.4], [0, 0.4, 0.3, 0.5], [0.3, 0.5, 1, 0.5], [1, 0.5, 1, 1], [1, 1, 0.6, 1], [0.6, 1, 0.3, 0.8]],
  ' ': [], // Space character
};

interface TextPathParams {
  text: string;
  centerLat: number;
  centerLon: number;
  letterWidth: number; // meters
  letterHeight: number; // meters
  letterSpacing: number; // meters
  alignment: 'left' | 'center' | 'right';
}

/**
 * Convert meters to approximate lat/lon degrees
 * (Very simplified - assumes small distances near equator)
 */
function metersToLatLon(meters: number, latitude: number): { latDelta: number; lonDelta: number } {
  const latDelta = meters / 111320; // 1 degree latitude ≈ 111.32 km
  const lonDelta = meters / (111320 * Math.cos(latitude * Math.PI / 180)); // longitude varies by latitude
  return { latDelta, lonDelta };
}

/**
 * Generate waypoints for a single character
 */
function generateCharacterWaypoints(
  char: string,
  startLat: number,
  startLon: number,
  width: number,
  height: number,
  baseLatitude: number
): { latitude: number; longitude: number }[] {
  const shape = CHAR_SHAPES[char.toUpperCase()];
  if (!shape || shape.length === 0) {
    return []; // Skip unknown or space characters
  }

  const waypoints: { latitude: number; longitude: number }[] = [];
  const { latDelta: heightDelta, lonDelta: heightLonDelta } = metersToLatLon(height, baseLatitude);
  const { latDelta: widthLatDelta, lonDelta: widthDelta } = metersToLatLon(width, baseLatitude);

  // For each line segment in the character
  for (const segment of shape) {
    const [x1, y1, x2, y2] = segment;
    
    // Convert normalized coordinates (0-1) to actual lat/lon
    const lat1 = startLat - (y1 * heightDelta); // Y goes down (south)
    const lon1 = startLon + (x1 * widthDelta);
    const lat2 = startLat - (y2 * heightDelta);
    const lon2 = startLon + (x2 * widthDelta);

    // Add start and end points of each segment
    waypoints.push({ latitude: lat1, longitude: lon1 });
    waypoints.push({ latitude: lat2, longitude: lon2 });
  }

  return waypoints;
}

/**
 * Convert text to waypoint path with separation between letters
 * Returns an array of waypoint groups (one group per letter)
 */
export function textToWaypointPath(params: TextPathParams): { latitude: number; longitude: number }[] {
  const { text, centerLat, centerLon, letterWidth, letterHeight, letterSpacing, alignment } = params;
  
  if (!text || text.length === 0) {
    return [];
  }

  const chars = text.toUpperCase().split('');
  const totalWidth = chars.length * letterWidth + (chars.length - 1) * letterSpacing;
  
  // Calculate starting position based on alignment
  let startLon = centerLon;
  if (alignment === 'center') {
    const { lonDelta } = metersToLatLon(totalWidth / 2, centerLat);
    startLon = centerLon - lonDelta;
  } else if (alignment === 'right') {
    const { lonDelta } = metersToLatLon(totalWidth, centerLat);
    startLon = centerLon - lonDelta;
  }

  let currentLon = startLon;
  const allWaypoints: { latitude: number; longitude: number }[] = [];

  // Generate waypoints for each character with separation marker
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    
    if (char === ' ') {
      // Space character - just advance position
      const { lonDelta } = metersToLatLon(letterWidth + letterSpacing, centerLat);
      currentLon += lonDelta;
      continue;
    }

    const charWaypoints = generateCharacterWaypoints(
      char,
      centerLat,
      currentLon,
      letterWidth,
      letterHeight,
      centerLat
    );

    // Add character waypoints
    allWaypoints.push(...charWaypoints);

    // Add a separation marker (null/undefined coordinates) between letters
    // This will be filtered out later but marks the letter boundary
    if (i < chars.length - 1 && chars[i + 1] !== ' ') {
      // Add a special marker with NaN to indicate letter separation
      allWaypoints.push({ latitude: NaN, longitude: NaN });
    }

    // Move to next character position
    const { lonDelta } = metersToLatLon(letterWidth + letterSpacing, centerLat);
    currentLon += lonDelta;
  }

  return allWaypoints;
}
