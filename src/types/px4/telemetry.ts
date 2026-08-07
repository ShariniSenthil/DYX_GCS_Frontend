/**
 * 4WD rover telemetry types.
 *
 * The active backend sends both a nested production snapshot and flat
 * compatibility fields on the `telemetry` Socket.IO event and
 * GET /api/telemetry/latest.
 */

export interface Px4VehicleTelemetry {
  connected?: boolean;
  armed?: boolean;
  mode?: string;
  heading_deg?: number | null;
  ground_speed_mps?: number | null;
}

export interface Px4PositionTelemetry {
  latitude?: number | null;
  longitude?: number | null;
  altitude_m?: number | null;
  local_x_m?: number | null;
  local_y_m?: number | null;
}

export interface Px4GpsTelemetry {
  fix_type?: number;
  fix_name?: string;
  satellites_visible?: number;
  horizontal_accuracy_m?: number | null;
  vertical_accuracy_m?: number | null;
  hdop?: number | null;
  vdop?: number | null;
  rtk_fixed?: boolean;
}

export interface Px4BatteryTelemetry {
  voltage_v?: number | null;
  current_a?: number | null;
  remaining_percent?: number | null;
}

export interface Px4MissionTelemetry {
  state?: string;
  loaded?: boolean;
  ready?: boolean;
  total_points?: number;
  navigation_point_count?: number;
  active_point_index?: number | null;
  active_point_number?: number | null;
  active_point_state?: string | null;
  completed_points?: number;
  skipped_points?: number;
  failed_points?: number;
  remaining_points?: number;
  progress_percent?: number;
  marking_active?: boolean;
}

export interface Px4AccuracyTelemetry {
  available?: boolean;
  source?: string | null;
  goal_number?: number | null;

  cross_track_error_m?: number | null;
  cross_track_error_mm?: number | null;
  cross_track_abs_mm?: number | null;
  cross_track_side?: string | null;

  front_back_error_m?: number | null;
  front_back_error_mm?: number | null;
  front_back_abs_mm?: number | null;
  front_back_position?: string | null;

  radial_error_m?: number | null;
  radial_error_mm?: number | null;

  closest_radial_error_m?: number | null;
  closest_radial_error_mm?: number | null;

  accuracy_target_m?: number | null;
  accuracy_target_mm?: number | null;

  test_tolerance_m?: number | null;
  test_tolerance_mm?: number | null;

  accuracy_status?: string | null;
  accuracy_pass?: boolean;
  within_test_tolerance?: boolean;
}

/** Payload from socket `telemetry` and REST `/api/telemetry/latest`. */
export interface Px4TelemetryData {
  generated_at?: string | number;
  revision?: number;

  vehicle?: Px4VehicleTelemetry;
  position?: Px4PositionTelemetry;
  gps?: Px4GpsTelemetry;
  battery?: Px4BatteryTelemetry;
  mission?: Px4MissionTelemetry;
  accuracy?: Px4AccuracyTelemetry;

  // NED/local position compatibility fields
  pos_n?: number | null;
  pos_e?: number | null;

  // Attitude
  heading_deg?: number | null;
  heading_ned_deg?: number | null;

  // Velocity
  speed_m_s?: number | null;
  speed_mps?: number | null;
  measured_speed_m_s?: number | null;
  along_track_speed_mps?: number | null;
  cross_track_speed_mps?: number | null;

  // Path tracking (optional on the current backend)
  xtrack_m?: number | null;
  dist_to_goal_m?: number | null;
  dist_to_goal?: number | null;
  wp_dist_cm?: number | null;

  // RPP state (optional on the current backend)
  rpp_state?: number | null;
  rpp_state_name?: string | null;

  // Vehicle compatibility fields
  armed?: boolean;
  mode?: string;
  connected?: boolean;

  // Battery compatibility fields
  battery_v?: number | null;
  battery_pct?: number | null;

  // GPS compatibility fields
  gps_fix?: number | null;
  gps_fix_name?: string;
  gps_sat?: number | null;
  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  hrms?: number | null;
  vrms?: number | null;

  // Mission compatibility fields
  mission_state?: string | null;
  marking_active?: boolean;

  // Spray / marking compatibility fields
  spraying?: boolean;
  marking_state?: string;
  commanded_on?: boolean;
  confirmed_off?: boolean;
  dash_feasible?: boolean;

  // Optional diagnostics
  imu_status?: string;
  pose_age_ms?: number;
  rpp_debug_fresh?: boolean;
  timestamp?: number | string;

  // Joystick V2 fields
  joystick_state?: string | null;
  joystick_active?: boolean | null;
  joystick_has_lease?: boolean | null;
  joystick_last_valid_cmd_age_ms?: number | null;
  joystick_deadman?: boolean | null;
  joystick_stop_reason?: string | null;
  control_owner?: string | null;


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
}

// ── Mission status (socket `mission_status` event) ───────────────────────────

export type MissionState =
  | "idle"
  | "loading"
  | "arming"
  | "switching_offboard"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "completed"
  | "error"
  | string;

export interface Px4MissionStatus extends Px4MissionTelemetry {
  state: MissionState;
  rpp_state?: number;
  rpp_state_name?: string;
  dist_to_goal?: number;
  speed?: number;
  xtrack?: number;
  path_name?: string;
  mission_id?: string;
  point_index?: number;
  expected_generation?: number;
  spray_mode?: string;
}

// ── Healthz response ─────────────────────────────────────────────────────────

export interface Px4HealthzResponse {
  status?: string;
  backend_online?: boolean;
  ros_node_started?: boolean;
  ros_connected?: boolean;

  /** Current backend name. */
  vehicle_connected?: boolean;
  /** Compatibility alias added by the backend patch. */
  fcu_connected?: boolean;

  armed: boolean;
  mode: string;
  mission_state?: MissionState | string | null;
  hrms?: number | null;
  vrms?: number | null;

  rpp_state?: number | null;
  pose_age_ms?: number | null;
  backend_uptime_sec?: number;
  uptime_s?: number;
}

// ── Loaded path response ──────────────────────────────────────────────────────

export interface LoadedPathResponse {
  path_name: string | null;
  mission_id: string | null;
  total_points?: number;
  spray_mode?: string;
  loaded_at?: string;
}
