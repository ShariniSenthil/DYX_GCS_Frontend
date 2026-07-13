import { PathPlanWaypoint } from '../types/pathplan';

/**
 * Calculate distance between two waypoints using Vincenty formula
 * More accurate than Haversine (±0.5mm vs ±0.5%)
 */
export const calculateDistance = (
    wp1: { lat: number; lon: number },
    wp2: { lat: number; lon: number }
): number => {
    return vincentyDistance(wp1, wp2);
};

/**
 * Calculate total mission distance
 */
export const calculateMissionDistance = (waypoints: PathPlanWaypoint[]): number => {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const distance = calculateDistance(waypoints[i - 1], waypoints[i]);
        if (Number.isFinite(distance) && distance >= 0) {
            totalDistance += distance;
        }
    }
    return totalDistance;
};

/**
 * Calculate estimated flight time
 */
export const calculateEstimatedFlightTime = (
    distance: number,
    roverSpeed: number = 1.0 // meters per second
): number => {
    if (roverSpeed <= 0) return 0;
    return distance / roverSpeed;
};

/**
 * Calculate mission bounds
 */
export const calculateMissionBounds = (waypoints: PathPlanWaypoint[]) => {
    if (waypoints.length === 0) {
        return { north: 0, south: 0, east: 0, west: 0 };
    }

    let north = waypoints[0].lat;
    let south = waypoints[0].lat;
    let east = waypoints[0].lon;
    let west = waypoints[0].lon;

    for (const wp of waypoints) {
        north = Math.max(north, wp.lat);
        south = Math.min(south, wp.lat);
        east = Math.max(east, wp.lon);
        west = Math.min(west, wp.lon);
    }

    return { north, south, east, west };
};

/**
 * Get altitude range
 */
export const getAltitudeRange = (waypoints: PathPlanWaypoint[]) => {
    if (waypoints.length === 0) {
        return { min: 0, max: 0 };
    }

    let min = waypoints[0].alt;
    let max = waypoints[0].alt;

    for (const wp of waypoints) {
        min = Math.min(min, wp.alt);
        max = Math.max(max, wp.alt);
    }

    return { min, max };
};

/**
 * Format time for display
 */
export const formatFlightTime = (seconds: number): string => {
    if (seconds < 60) {
        return `${Math.ceil(seconds)} second${Math.ceil(seconds) !== 1 ? 's' : ''}`;
    }

    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.ceil(seconds % 60);
        return `${minutes}m ${secs}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

/**
 * Format distance for display
 */
export const formatDistance = (meters: number): string => {
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
};

/**
 * Get mission summary statistics
 */
export interface MissionStatistics {
    waypointCount: number;
    totalDistance: number;
    estimatedTime: number;
    altitudeRange: { min: number; max: number };
    boundingBox: { north: number; south: number; east: number; west: number };
}

export const calculateMissionStatistics = (
    waypoints: PathPlanWaypoint[]
): MissionStatistics => {
    return {
        waypointCount: waypoints.length,
        totalDistance: calculateMissionDistance(waypoints),
        estimatedTime: calculateEstimatedFlightTime(
            calculateMissionDistance(waypoints),
            1.0 // default 1 m/s
        ),
        altitudeRange: getAltitudeRange(waypoints),
        boundingBox: calculateMissionBounds(waypoints)
    };
};

/**
 * Haversine distance between two points on a sphere (IUGG mean Earth radius).
 * ~5-10x faster than Vincenty. Error < 0.5% vs WGS84 ellipsoid
 * (under 2.5m at 500m, well below RTK GPS noise floor).
 * Use for preview/recalculation where sub-meter accuracy isn't critical.
 */
export const haversineDistance = (
    wp1: { lat: number; lon: number },
    wp2: { lat: number; lon: number }
): number => {
    const R = 6371008.8; // IUGG mean Earth radius in meters
    const toRad = Math.PI / 180;

    const dLat = (wp2.lat - wp1.lat) * toRad;
    const dLon = (wp2.lon - wp1.lon) * toRad;
    const sinDLat = Math.sin(dLat * 0.5);
    const sinDLon = Math.sin(dLon * 0.5);
    const c1 = Math.cos(wp1.lat * toRad);
    const c2 = Math.cos(wp2.lat * toRad);
    const h = sinDLat * sinDLat + c1 * c2 * sinDLon * sinDLon;
    // atan2 form — numerically stable for all distances, no asin domain errors
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * Fast equirectangular distance approximation for short-range waypoints.
 * Error < 0.25m at 500m, < 0.05% under 50km at mid-latitudes.
 * ~20-30x faster than Vincenty. Ideal for inline WebView calculations
 * and bulk recalculation where sub-meter accuracy isn't required.
 */
export const fastDistance = (
    a: { lat: number; lon: number },
    b: { lat: number; lon: number }
): number => {
    const R = 6371008.8; // IUGG mean Earth radius (meters)
    const toRad = Math.PI / 180;
    const x = (b.lon - a.lon) * toRad * Math.cos((a.lat + b.lat) * 0.5 * toRad);
    const y = (b.lat - a.lat) * toRad;
    return R * Math.sqrt(x * x + y * y);
};

/**
 * Calculate distance between two points using Vincenty's inverse formula (Karney method).
 * Uses WGS84 ellipsoid for sub-millimeter accuracy (±0.5mm).
 * Falls back to Haversine if iteration doesn't converge.
 */
export const vincentyDistance = (
    wp1: { lat: number; lon: number },
    wp2: { lat: number; lon: number }
): number => {
    // Validate input coordinates
    if (!wp1 || !wp2 ||
        !Number.isFinite(wp1.lat) || !Number.isFinite(wp1.lon) ||
        !Number.isFinite(wp2.lat) || !Number.isFinite(wp2.lon)) {
        console.warn('[missionCalculator] vincentyDistance: Invalid coordinates:', { wp1, wp2 });
        return 0;
    }

    if (Math.abs(wp1.lat) > 90 || Math.abs(wp2.lat) > 90) return 0;
    if (Math.abs(wp1.lon) > 180 || Math.abs(wp2.lon) > 180) return 0;

    // WGS84 ellipsoid parameters
    const a = 6378137.0;           // Semi-major axis (meters)
    const f = 1 / 298.257223563;   // Flattening
    const b = a * (1 - f);         // Semi-minor axis

    const toRad = (deg: number) => deg * Math.PI / 180;

    const phi1 = toRad(wp1.lat);
    const phi2 = toRad(wp2.lat);
    const L = toRad(wp2.lon - wp1.lon);

    // Reduced latitudes
    const U1 = Math.atan((1 - f) * Math.tan(phi1));
    const U2 = Math.atan((1 - f) * Math.tan(phi2));
    const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
    const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

    // Coincident points
    if (Math.abs(wp1.lat - wp2.lat) < 1e-12 && Math.abs(wp1.lon - wp2.lon) < 1e-12) {
        return 0;
    }

    let lambda = L;
    let lambdaPrev: number;
    let sinSigma: number, cosSigma: number, sigma: number;
    let sinAlpha: number, cos2Alpha: number, cos2SigmaM: number;
    let C: number;
    const maxIterations = 200;

    for (let i = 0; i < maxIterations; i++) {
        const sinLambda = Math.sin(lambda);
        const cosLambda = Math.cos(lambda);

        sinSigma = Math.sqrt(
            (cosU2 * sinLambda) ** 2 +
            (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
        );

        if (sinSigma === 0) return 0; // Coincident points

        cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
        sigma = Math.atan2(sinSigma, cosSigma);

        sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
        cos2Alpha = 1 - sinAlpha ** 2;

        cos2SigmaM = cos2Alpha !== 0
            ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha
            : 0; // Equatorial line

        C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));

        lambdaPrev = lambda;
        lambda = L + (1 - C) * f * sinAlpha * (
            sigma + C * sinSigma * (
                cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)
            )
        );

        if (Math.abs(lambda - lambdaPrev) < 1e-12) {
            // Converged - calculate distance
            const u2 = cos2Alpha * (a ** 2 - b ** 2) / (b ** 2);
            const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
            const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));

            const deltaSigma = B * sinSigma * (
                cos2SigmaM + (B / 4) * (
                    cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
                    (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
                )
            );

            const distance = b * A * (sigma - deltaSigma);
            return Number.isFinite(distance) && distance >= 0 ? distance : 0;
        }
    }

    // Failed to converge (antipodal points) - fall back to Haversine
    console.warn('[missionCalculator] Vincenty failed to converge, using Haversine fallback');
    return haversineDistance(wp1, wp2);
};

/**
 * Recalculate distances for all waypoints after reordering.
 * When originPoint is provided, the first waypoint's distance is measured
 * from that origin (e.g., rover position). Otherwise, first waypoint = 0.
 */
export const recalculateWaypointDistances = (
    waypoints: PathPlanWaypoint[],
    originPoint?: { lat: number; lon: number }
): PathPlanWaypoint[] => {
    return waypoints.map((wp, idx) => {
        if (idx === 0) {
            const dist = originPoint
                ? calculateDistance(originPoint, { lat: wp.lat, lon: wp.lon })
                : 0;
            return { ...wp, distance: dist };
        }
        const prev = waypoints[idx - 1];
        const dist = calculateDistance(
            { lat: prev.lat, lon: prev.lon },
            { lat: wp.lat, lon: wp.lon }
        );
        return { ...wp, distance: dist };
    });
};

/**
 * Calculate forward azimuth (bearing) between two geodetic points.
 * Uses the spherical formula — accurate to <0.5° for typical drone distances.
 * Returns degrees clockwise from true north [0, 360).
 */
export const calcBearing = (
    wp1: { lat: number; lon: number },
    wp2: { lat: number; lon: number }
): number => {
    const toRad = (d: number) => d * Math.PI / 180;
    const toDeg = (r: number) => r * 180 / Math.PI;
    const lat1 = toRad(wp1.lat);
    const lat2 = toRad(wp2.lat);
    const dLon = toRad(wp2.lon - wp1.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};
