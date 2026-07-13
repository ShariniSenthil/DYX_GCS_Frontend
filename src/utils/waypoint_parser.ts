// File: src/utils/waypoint_parser.ts

/**
 * QGC Waypoint Parser
 * -------------------
 * Handles Mission Planner / QGroundControl (.waypoints) file format (QGC WPL 110)
 * Converts it into ParsedWaypoint[] that fits your app’s mission structure.
 */

export type ParsedWaypoint = {
    id: number;
    command: string;
    frame: number;
    current: number;
    lat: number;
    lon: number;
    alt: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    autocontinue: number;
};

// Map of MAVLink command IDs → readable names
const COMMAND_MAP: Record<number, string> = {
    16: "WAYPOINT",
    17: "LOITER_UNLIM",
    18: "LOITER_TURNS",
    19: "LOITER_TIME",
    20: "RETURN_TO_LAUNCH",
    21: "LAND",
    22: "TAKEOFF",
    115: "CONDITION_YAW",
    178: "DO_CHANGE_SPEED",
    112: "CONDITION_DELAY",
    183: "DO_SET_HOME",
    184: "DO_SET_SERVO",
    206: "DO_SET_SERVO",
    201: "DO_DIGICAM_CONTROL",
    82: "SPLINE_WAYPOINT",
};

// Utility: safe number conversion
const safeNumber = (val: string | undefined, def = 0): number => {
    const n = parseFloat(val || "");
    return isNaN(n) ? def : n;
};

/**
 * Parse QGC WPL 110 formatted file text into ParsedWaypoint[]
 */
export function parseQGCWaypoints(fileText: string): ParsedWaypoint[] {
    const lines = fileText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error("Empty .waypoints file");

    // Header check
    if (!lines[0].toUpperCase().startsWith("QGC WPL")) {
        throw new Error("Invalid QGC WPL header — missing 'QGC WPL 110'");
    }

    const waypoints: ParsedWaypoint[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/\s+|\t+/);
        if (cols.length < 12) continue; // skip malformed lines

        const index = i - 1;
        const current = safeNumber(cols[1], 0);
        const frame = safeNumber(cols[2], 3);
        const cmdId = safeNumber(cols[3], 16);
        const command = COMMAND_MAP[cmdId] || `CMD_${cmdId}`;

        const wp: ParsedWaypoint = {
            id: index + 1,
            frame,
            current,
            command,
            param1: safeNumber(cols[4]),
            param2: safeNumber(cols[5]),
            param3: safeNumber(cols[6]),
            param4: safeNumber(cols[7]),
            lat: safeNumber(cols[8]),
            lon: safeNumber(cols[9]),
            alt: safeNumber(cols[10]),
            autocontinue: safeNumber(cols[11], 1),
        };

        waypoints.push(wp);
    }

    if (waypoints.length === 0) {
        throw new Error("No valid waypoints found in file");
    }

    return waypoints;
}
