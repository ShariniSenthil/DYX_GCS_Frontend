/**
 * Type definitions for Rover ROS Telemetry and Services
 * Matches the backend telemetry structure
 */

import type { RtkUiState } from "../adapters/px4RtkUiStateAdapter";

export interface TelemetryState {
  armed: boolean;
  mode: string;
  system_status: string;
  heartbeat_ts: number;
}

export interface TelemetryGlobal {
  lat: number;
  lon: number;
  alt_rel: number;
  vel: number;
  satellites_visible: number;
}

export interface TelemetryBattery {
  voltage: number;
  current: number;
  percentage: number;
}

export interface TelemetryRtk {
  fix_type: number;
  baseline_age: number;
  base_linked: boolean;
}

export interface TelemetryMission {
  total_wp: number;
  current_wp: number;
  status: string;
  progress_pct: number;

  /** Authoritative backend marking-point counters. */
  active_point_index?: number | null;
  active_point_number?: number | null;
  active_point_state?: string | null;
  completed_points?: number;
  skipped_points?: number;
  failed_points?: number;
  remaining_points?: number;
  navigation_point_count?: number;
  loaded?: boolean;
  ready?: boolean;
}

export interface TelemetryAccuracy {
  available: boolean;
  goal_number?: number | null;

  cross_track_error_mm?: number | null;
  cross_track_abs_mm?: number | null;
  cross_track_side?: string | null;

  front_back_error_mm?: number | null;
  front_back_abs_mm?: number | null;
  front_back_position?: string | null;

  radial_error_mm?: number | null;
  closest_radial_error_mm?: number | null;

  accuracy_target_mm?: number | null;
  test_tolerance_mm?: number | null;

  accuracy_status?: string | null;
  accuracy_pass?: boolean;
  within_test_tolerance?: boolean;
}

export interface ServoStatus {
  servo_id: number;
  active: boolean;
  last_command_ts: number;
  [key: string]: any;
}

export interface NetworkData {
  connection_type: string;
  wifi_signal_strength: number;
  wifi_rssi: number;
  interface: string;
  wifi_connected: boolean;
  lora_connected: boolean;
}

export interface RoverTelemetry {
  state: TelemetryState;
  global: TelemetryGlobal;
  battery: TelemetryBattery;
  rtk: TelemetryRtk;
  mission: TelemetryMission;
  servo: ServoStatus;
  network: NetworkData;
  hrms: number;
  vrms: number;
  imu_status: string;
  lastMessageTs: number | null;
  attitude?: {
    yaw_deg: number;
  };
  wp_dist_cm?: number;
  xtrack_cm?: number;
  wp_brg?: number;
  position_error_cm?: number;
  gps_failsafe?: GpsFailsafeStatus;
  distance_to_next_m?: number;
  accuracy?: TelemetryAccuracy;

accuracy_available?: boolean;

cross_track_error_mm?: number | null;
cross_track_abs_mm?: number | null;
cross_track_side?: string | null;

front_back_error_mm?: number | null;
front_back_abs_mm?: number | null;
front_back_position?: string | null;

radial_error_mm?: number | null;
closest_radial_error_mm?: number | null;

accuracy_target_mm?: number | null;
test_tolerance_mm?: number | null;

accuracy_status?: string | null;
accuracy_pass?: boolean;
within_test_tolerance?: boolean;
  fcu_connected?: boolean;
  gps_fix_name?: string;
  mission_state?: string;
  rpp_state_name?: string;
  rtk_stream_active?: boolean;
  rtk_ui_state?: RtkUiState;
  measured_speed_m_s?: number | null;
  along_track_speed_mps?: number | null;
  cross_track_speed_mps?: number | null;
  joystick_state?: string | null;
  joystick_active?: boolean | null;
  joystick_owner_present?: boolean | null;
  joystick_has_lease?: boolean | null;
  joystick_last_valid_cmd_age_ms?: number | null;
  joystick_deadman?: boolean | null;
  joystick_commanded_throttle?: number | null;
  joystick_commanded_steering?: number | null;
  joystick_stop_reason?: string | null;
  control_owner?: string | null;
  joystick_owned?: boolean | null;
  gateway_active?: boolean | null;
  gateway_command_age_ms?: number | null;
  gateway_last_send_age_ms?: number | null;
  transport_healthy?: boolean | null;
  transport_error?: string | null;
}

export interface TelemetryEnvelope {
  timestamp?: number;
  state?: Partial<TelemetryState>;
  global?: Partial<TelemetryGlobal>;
  battery?: Partial<TelemetryBattery>;
  rtk?: Partial<TelemetryRtk>;
  mission?: Partial<TelemetryMission>;
  servo?: Partial<ServoStatus>;
  network?: Partial<NetworkData>;
  hrms?: number;
  vrms?: number;
  imu_status?: string;
  attitude?: {
    yaw_deg: number;
  };
  wp_dist_cm?: number;
  xtrack_cm?: number;
  wp_brg?: number;
  position_error_cm?: number;
  distance_to_next_m?: number;
  accuracy?: Partial<TelemetryAccuracy>;

accuracy_available?: boolean;

cross_track_error_mm?: number | null;
cross_track_abs_mm?: number | null;
cross_track_side?: string | null;

front_back_error_mm?: number | null;
front_back_abs_mm?: number | null;
front_back_position?: string | null;

radial_error_mm?: number | null;
closest_radial_error_mm?: number | null;

accuracy_target_mm?: number | null;
test_tolerance_mm?: number | null;

accuracy_status?: string | null;
accuracy_pass?: boolean;
within_test_tolerance?: boolean;
  fcu_connected?: boolean;
  gps_fix_name?: string;
  mission_state?: string;
  rpp_state_name?: string;
  rtk_stream_active?: boolean;
  rtk_ui_state?: RtkUiState;
  measured_speed_m_s?: number | null;
  along_track_speed_mps?: number | null;
  cross_track_speed_mps?: number | null;
  joystick_state?: string | null;
  joystick_active?: boolean | null;
  joystick_last_valid_cmd_age_ms?: number | null;
  joystick_stop_reason?: string | null;
  control_owner?: string | null;
}

export interface ServiceResponse {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: any;
}

export interface Waypoint {
  id?: number;
  lat: number;
  lng: number;
  alt: number;
  command?: string;
  frame?: number;
  current?: number;
  autocontinue?: number;
  [key: string]: any;
}

export interface MissionEventData {
  timestamp?: string | number;
  message?: string;
  lat?: number | null;
  lng?: number | null;
  waypointId?: number | null;
  status?: string | null;
  servoAction?: string | null;
  [key: string]: any;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type GpsFailsafeMode = "disable" | "strict" | "relax";

export interface GpsFailsafeStatus {
  mode: GpsFailsafeMode;
  triggered: boolean;
  reason?: string;
  fix_type?: number;
  wp_dist_cm?: number;
  xtrack_cm?: number;
  wp_brg?: number;
  requires_ack?: boolean;
  servo_suppressed: boolean;
  action?: string;
  timestamp?: string;
}

export interface GpsFailsafeEvent {
  wp_dist_cm: number;
  threshold_cm: number;
  timestamp: number;
}
