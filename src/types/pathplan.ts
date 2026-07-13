// Basic types for Path Plan (will expand later with utilities)

export interface PathPlanWaypoint {
    id: number;
    lat: number;
    lon: number;
    alt: number;
    row?: string;
    block?: string;
    pile?: string;
    distance?: number; // Distance from previous waypoint in meters
    mark?: boolean; // Per-waypoint marking. undefined = use global servo_enabled
}

export interface DxfMapEntity {
    id: string;
    kind: 'line' | 'point' | 'text';
    coordinates: Array<{ lat: number; lon: number }>;
    layer?: string;
    label?: string;
    dashed?: boolean;
    closedRing?: boolean;
}

export interface MissionData {
    id: string;
    name: string;
    createdAt: string;
    waypoints: PathPlanWaypoint[];
    totalDistance: number;
    totalWaypoints: number;
}

export type DrawingMode = 'none' | 'waypoint' | 'polygon' | 'line';
export type ExportFormat = 'qgc' | 'json' | 'csv' | 'kml' | 'dxf';
