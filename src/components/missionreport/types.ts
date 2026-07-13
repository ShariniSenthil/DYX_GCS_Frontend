export type Mode = 'AUTO' | 'MANUAL' | 'CONTINUOUS' | 'DASH';

export interface Waypoint {
  sn: number;
  block: string;
  row: string;
  pile: string;
  lat: number;
  lon: number;
  // Optional distance (meters) from previous waypoint. May be populated by PathPlan.
  distance?: number;
  mark?: boolean;
  alt: number;
  status: 'Pending' | 'Completed' | 'Marked' | 'Reached' | 'Skipped';
  time: string;
  remark: string;
}

export interface VehicleStatus {
  battery: string;
  gps: string;
  satellites: number;
  hrms: string;
  vrms: string;
  imu: string;  mode?: string;}