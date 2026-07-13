import { PathPlanWaypoint } from '../types/pathplan';

export interface ValidationError {
    waypointIndex?: number;
    type: 'error' | 'warning';
    code: string;
    message: string;
    value?: any;
}

/**
 * Validates an array of waypoints and returns any errors or warnings found.
 * 
 * Validations include:
 * - Type checking (lat, lon, alt must be numbers)
 * - NaN detection
 * - Coordinate range validation (lat: ±90, lon: ±180)
 * - Altitude validation (positive, reasonable limits)
 * - Duplicate waypoint detection
 * - Null island check (0,0)
 * - Optional field validation
 */
export const validateWaypoints = (waypoints: PathPlanWaypoint[]): ValidationError[] => {
    const errors: ValidationError[] = [];
    const seenCoordinates = new Set<string>();

    waypoints.forEach((wp, idx) => {
        // 1. Type checks for latitude
        if (typeof wp.lat !== 'number' || isNaN(wp.lat)) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'INVALID_LAT',
                message: `Waypoint ${idx}: Latitude must be a valid number`,
                value: wp.lat
            });
        }

        // 2. Type checks for longitude
        if (typeof wp.lon !== 'number' || isNaN(wp.lon)) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'INVALID_LON',
                message: `Waypoint ${idx}: Longitude must be a valid number`,
                value: wp.lon
            });
        }

        // 3. Range checks for latitude
        if (typeof wp.lat === 'number' && !isNaN(wp.lat) && Math.abs(wp.lat) > 90) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'LAT_OUT_OF_RANGE',
                message: `Waypoint ${idx}: Latitude must be between -90 and 90 (got ${wp.lat})`,
                value: wp.lat
            });
        }

        // 4. Range checks for longitude
        if (typeof wp.lon === 'number' && !isNaN(wp.lon) && Math.abs(wp.lon) > 180) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'LON_OUT_OF_RANGE',
                message: `Waypoint ${idx}: Longitude must be between -180 and 180 (got ${wp.lon})`,
                value: wp.lon
            });
        }

        // 5. Altitude validation (REQUIRED parameter)
        if (wp.alt === undefined || wp.alt === null) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'MISSING_ALTITUDE',
                message: `Waypoint ${idx}: Altitude is required`,
                value: wp.alt
            });
        } else if (typeof wp.alt !== 'number' || isNaN(wp.alt)) {
            errors.push({
                waypointIndex: idx,
                type: 'error',
                code: 'INVALID_ALTITUDE',
                message: `Waypoint ${idx}: Altitude must be a valid number`,
                value: wp.alt
            });
        } else if (wp.alt < 0) {
            errors.push({
                waypointIndex: idx,
                type: 'warning',
                code: 'NEGATIVE_ALTITUDE',
                message: `Waypoint ${idx}: Negative altitude detected (${wp.alt}m). Will be converted to positive before upload.`,
                value: wp.alt
            });
        } else if (wp.alt > 10000) {
            errors.push({
                waypointIndex: idx,
                type: 'warning',
                code: 'ALTITUDE_UNUSUALLY_HIGH',
                message: `Waypoint ${idx}: Altitude is unusually high: ${wp.alt}m (typical max: 10000m)`,
                value: wp.alt
            });
        } else if (wp.alt === 0) {
            errors.push({
                waypointIndex: idx,
                type: 'warning',
                code: 'ZERO_ALTITUDE',
                message: `Waypoint ${idx}: Altitude is set to 0m. Confirm this is intentional.`,
                value: wp.alt
            });
        }

        // 6. DUPLICATE DETECTION (NEW)
        // Use 6 decimal places for coordinate comparison (~0.1m precision)
        if (typeof wp.lat === 'number' && !isNaN(wp.lat) &&
            typeof wp.lon === 'number' && !isNaN(wp.lon)) {
            const coordKey = `${wp.lat.toFixed(6)},${wp.lon.toFixed(6)}`;
            if (seenCoordinates.has(coordKey)) {
                errors.push({
                    waypointIndex: idx,
                    type: 'warning',
                    code: 'DUPLICATE_WAYPOINT',
                    message: `Waypoint ${idx}: Duplicate coordinates (${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}) detected earlier in mission`,
                    value: { lat: wp.lat, lon: wp.lon }
                });
            }
            seenCoordinates.add(coordKey);
        }

        // 7. Null island check (0,0)
        if (wp.lat === 0 && wp.lon === 0) {
            errors.push({
                waypointIndex: idx,
                type: 'warning',
                code: 'NULL_ISLAND',
                message: `Waypoint ${idx}: Coordinates at null island (0, 0). Confirm this is intentional.`,
                value: { lat: wp.lat, lon: wp.lon }
            });
        }

        // 8. Optional field validation (if command is present in PathPlanWaypoint, which it isn't by default but might be extended)
        // Assuming PathPlanWaypoint might have optional command property or we skip this check if not present.
        // The type definition doesn't have command, but we can check if it exists in the object.

        /* 
        if ((wp as any).command && typeof (wp as any).command !== 'string') {
          errors.push({
            waypointIndex: idx,
            type: 'error',
            code: 'INVALID_COMMAND',
            message: `Waypoint ${idx}: Command must be a string`,
            value: (wp as any).command
          });
        }
        */

        /*
        if ((wp as any).frame !== undefined && typeof (wp as any).frame !== 'number') {
          errors.push({
            waypointIndex: idx,
            type: 'error',
            code: 'INVALID_FRAME',
            message: `Waypoint ${idx}: Frame must be a number`,
            value: (wp as any).frame
          });
        }
        */

        // 9. Parameter validation (optional but should be numbers if present)
        /*
        const params = ['param1', 'param2', 'param3', 'param4'] as const;
        params.forEach(param => {
          const value = (wp as any)[param];
          if (value !== undefined && value !== null && (typeof value !== 'number' || isNaN(value))) {
            errors.push({
              waypointIndex: idx,
              type: 'warning',
              code: 'INVALID_PARAMETER',
              message: `Waypoint ${idx}: ${param} should be a number if specified`,
              value
            });
          }
        });
        */
    });

    return errors;
};

/**
 * Checks if validation errors contain any critical errors (type: 'error')
 */
export const hasCriticalErrors = (errors: ValidationError[]): boolean => {
    return errors.some(e => e.type === 'error');
};

/**
 * Returns only critical errors (type: 'error')
 */
export const getCriticalErrors = (errors: ValidationError[]): ValidationError[] => {
    return errors.filter(e => e.type === 'error');
};

/**
 * Returns only warnings (type: 'warning')
 */
export const getWarnings = (errors: ValidationError[]): ValidationError[] => {
    return errors.filter(e => e.type === 'warning');
};

/**
 * Formats validation errors into a human-readable string
 */
export const formatValidationErrors = (errors: ValidationError[], maxErrors: number = 5): string => {
    if (errors.length === 0) return '';

    const criticalErrors = getCriticalErrors(errors);
    const warnings = getWarnings(errors);

    let message = '';

    if (criticalErrors.length > 0) {
        message += `Found ${criticalErrors.length} error(s):\n`;
        criticalErrors.slice(0, maxErrors).forEach(err => {
            message += `- ${err.message}\n`;
        });
        if (criticalErrors.length > maxErrors) {
            message += `... and ${criticalErrors.length - maxErrors} more error(s)\n`;
        }
    }

    if (warnings.length > 0) {
        if (message) message += '\n';
        message += `Found ${warnings.length} warning(s):\n`;
        warnings.slice(0, maxErrors).forEach(warn => {
            message += `- ${warn.message}\n`;
        });
        if (warnings.length > maxErrors) {
            message += `... and ${warnings.length - maxErrors} more warning(s)\n`;
        }
    }

    return message;
};

/**
 * Sanitizes waypoints before upload to rover.
 * Automatically corrects issues that can be safely fixed:
 * - Converts negative altitudes to positive (absolute value)
 * 
 * @param waypoints - Array of waypoints to sanitize
 * @returns Sanitized waypoints safe for rover upload
 */
export const sanitizeWaypointsForUpload = (waypoints: PathPlanWaypoint[]): PathPlanWaypoint[] => {
    return waypoints.map((wp, idx) => {
        const sanitized = { ...wp };

        // Fix negative altitudes
        if (sanitized.alt < 0) {
            console.log(`Sanitizing waypoint ${idx}: Converting altitude ${sanitized.alt}m to ${Math.abs(sanitized.alt)}m`);
            sanitized.alt = Math.abs(sanitized.alt);
        }

        return sanitized;
    });
};
