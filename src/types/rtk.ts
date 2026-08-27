/**
 * Exact backend RTK contract from rover_ws commit e57e050.
 *
 * Backend owns profile persistence, desired RUNNING/STOPPED intent,
 * worker lifecycle, and RTCM injection. The tablet is not an NTRIP
 * authority. Profile responses never include the NTRIP password.
 */

// ---------------------------------------------------------------------------
// Enumerations — exact backend string values
// ---------------------------------------------------------------------------

/** Operator-requested persisted lifecycle target (`DesiredState`). */
export const RTK_DESIRED_STATES = ["STOPPED", "RUNNING"] as const;
export type RtkDesiredState = (typeof RTK_DESIRED_STATES)[number];

/** Supervisor state (`ManagerState`). */
export const RTK_MANAGER_STATES = [
  "STOPPED",
  "WAITING_FOR_MAVROS",
  "STARTING",
  "RUNNING",
  "RUNNING_MAVROS_STALE",
  "BACKOFF",
  "STOPPING",
  "ERROR",
] as const;
export type RtkManagerState = (typeof RTK_MANAGER_STATES)[number];

/** Latched terminal manager error (`ErrorReason`). */
export const RTK_ERROR_REASONS = [
  "CONFIG_INVALID",
  "OWNERSHIP_CONFLICT",
  "AUTH_FAILED",
  "MOUNTPOINT_REJECTED",
  "RESTART_BUDGET_EXHAUSTED",
] as const;
export type RtkErrorReason = (typeof RTK_ERROR_REASONS)[number];

/** Semantic child-exit reasons (`WorkerExitReason`). */
export const RTK_WORKER_EXIT_REASONS = [
  "CLEAN",
  "RETRYABLE_FAILURE",
  "CONFIG_INVALID",
  "OWNERSHIP_CONFLICT",
  "AUTH_FAILED",
  "MOUNTPOINT_REJECTED",
] as const;
export type RtkWorkerExitReason = (typeof RTK_WORKER_EXIT_REASONS)[number];

/** Worker status vocabulary (`WorkerStatusKind`). */
export const RTK_WORKER_STATUS_KINDS = [
  "STARTED",
  "READY",
  "TERMINAL_ERROR",
] as const;
export type RtkWorkerStatusKind = (typeof RTK_WORKER_STATUS_KINDS)[number];

/**
 * TLS policy (`WorkerConfig.tls_mode`).
 * REQUIRED = verified TLS, no plaintext fallback.
 * DISABLED = explicit insecure plaintext operator policy.
 */
export const RTK_TLS_MODES = ["REQUIRED", "DISABLED"] as const;
export type RtkTlsMode = (typeof RTK_TLS_MODES)[number];

/** Correction-stream `state` values projected by the ROS bridge. */
export const RTK_CORRECTION_STREAM_STATES = [
  "DISCONNECTED",
  "WAITING_FOR_FIRST_PUBLISHED_FRAME",
  "HEALTHY",
  "UNHEALTHY",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;
export type RtkCorrectionStreamState =
  (typeof RTK_CORRECTION_STREAM_STATES)[number];

/** GGA/VRS transmitter `state` values. */
export const RTK_GGA_STATES = [
  "DISABLED",
  "WAITING_FOR_FIX",
  "NO_FIX",
  "STALE",
  "READY",
  "UNKNOWN",
] as const;
export type RtkGgaState = (typeof RTK_GGA_STATES)[number];

/** FastAPI `detail.code` values from rtk_routes.py. */
export const RTK_API_ERROR_CODES = [
  "RTK_CONTROL_UNAVAILABLE",
  "RTK_PROFILE_INVALID",
  "RTK_PROFILE_NOT_FOUND",
  "RTK_PROFILE_CONFLICT",
  "RTK_STATE_CONFLICT",
  "RTK_CONTROL_INCONSISTENT",
  "RTK_RUNTIME_UNAVAILABLE",
  "RTK_PERSISTENCE_UNAVAILABLE",
  "RTK_CONTROL_FAILED",
] as const;
export type RtkApiErrorCode = (typeof RTK_API_ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Credential-free persisted RTK profile (`_profile_payload`). */
export interface RtkProfile {
  id: number;
  name: string;
  caster_host: string;
  caster_port: number;
  mountpoint: string;
  username: string;
  password_configured: boolean;
  rtcm_topic: string;
  connect_timeout_sec: number;
  socket_timeout_sec: number;
  healthy_age_sec: number;
  stale_reconnect_sec: number;
  reconnect_delay_sec: number;
  first_data_timeout_sec: number;
  gga_enabled: boolean;
  gga_interval_sec: number;
  gga_max_age_sec: number;
  tls_mode: RtkTlsMode;
  max_mavros_rtcm_frame_bytes: number;
  enabled: boolean;
  revision: number;
  created_at_epoch: number;
  updated_at_epoch: number;
}

export const RTK_PROFILE_CREATE_DEFAULTS = {
  rtcm_topic: "/mavros/gps_rtk/send_rtcm",
  connect_timeout_sec: 10.0,
  socket_timeout_sec: 1.0,
  healthy_age_sec: 5.0,
  stale_reconnect_sec: 10.0,
  reconnect_delay_sec: 5.0,
  first_data_timeout_sec: 10.0,
  gga_enabled: false,
  gga_interval_sec: 10.0,
  gga_max_age_sec: 5.0,
  tls_mode: "REQUIRED" as RtkTlsMode,
  max_mavros_rtcm_frame_bytes: 720,
  enabled: true,
} as const;

/**
 * POST /api/rtk/profiles body.
 * `password` is write-only and required. Do not trim it.
 */
export interface RtkProfileCreateRequest {
  name: string;
  caster_host: string;
  caster_port: number;
  mountpoint: string;
  username: string;
  password: string;
  rtcm_topic?: string;
  connect_timeout_sec?: number;
  socket_timeout_sec?: number;
  healthy_age_sec?: number;
  stale_reconnect_sec?: number;
  reconnect_delay_sec?: number;
  first_data_timeout_sec?: number;
  gga_enabled?: boolean;
  gga_interval_sec?: number;
  gga_max_age_sec?: number;
  tls_mode?: RtkTlsMode;
  max_mavros_rtcm_frame_bytes?: number;
  enabled?: boolean;
}

/**
 * PATCH /api/rtk/profiles/{id} body.
 * Omit `password` entirely when unchanged. Blank editor field means omit,
 * not send "". Explicit JSON null is also treated as omit by the backend.
 */
export interface RtkProfileUpdateRequest {
  name?: string;
  caster_host?: string;
  caster_port?: number;
  mountpoint?: string;
  username?: string;
  password?: string;
  rtcm_topic?: string;
  connect_timeout_sec?: number;
  socket_timeout_sec?: number;
  healthy_age_sec?: number;
  stale_reconnect_sec?: number;
  reconnect_delay_sec?: number;
  first_data_timeout_sec?: number;
  gga_enabled?: boolean;
  gga_interval_sec?: number;
  gga_max_age_sec?: number;
  tls_mode?: RtkTlsMode;
  max_mavros_rtcm_frame_bytes?: number;
  enabled?: boolean;
}

/**
 * Fields whose change on the active profile forces persisted STOPPED.
 * `name` is NOT runtime-significant. `password` is compared via the
 * stored secret (any provided replacement is runtime-significant).
 */
export const RTK_RUNTIME_SIGNIFICANT_FIELDS = [
  "caster_host",
  "caster_port",
  "mountpoint",
  "username",
  "password",
  "rtcm_topic",
  "connect_timeout_sec",
  "socket_timeout_sec",
  "healthy_age_sec",
  "stale_reconnect_sec",
  "reconnect_delay_sec",
  "first_data_timeout_sec",
  "gga_enabled",
  "gga_interval_sec",
  "gga_max_age_sec",
  "tls_mode",
  "max_mavros_rtcm_frame_bytes",
  "enabled",
] as const;

export type RtkRuntimeSignificantField =
  (typeof RTK_RUNTIME_SIGNIFICANT_FIELDS)[number];

export interface RtkProfileListResponse {
  profiles: RtkProfile[];
  count: number;
}

export interface RtkProfileResponse {
  profile: RtkProfile;
}

export interface RtkProfileDeleteResponse {
  success: boolean;
  deleted_profile_id: number;
}

// ---------------------------------------------------------------------------
// Persisted runtime + control snapshots
// ---------------------------------------------------------------------------

export interface RtkPersistedRuntimeState {
  active_profile_id: number | null;
  desired_state: RtkDesiredState;
  revision: number;
  updated_at_epoch: number;
}

export interface RtkActivateResponse {
  success: boolean;
  persisted: RtkPersistedRuntimeState;
}

export interface RtkIntentResponse {
  success: boolean;
  message: string;
  persisted: RtkPersistedRuntimeState;
}

export interface RtkSupervisorSnapshot {
  running: boolean;
  shutdown_requested: boolean;
  mavros_ready: boolean;
  last_error_code: string | null;
}

export interface RtkManagerSnapshot {
  desired_state: RtkDesiredState;
  state: RtkManagerState;
  mavros_ready: boolean;
  active_run_id: string | null;
  child_started: boolean;
  child_ready: boolean;
  next_restart_at_monotonic_sec: number | null;
  consecutive_failures: number;
  restart_count_in_window: number;
  error_reason: RtkErrorReason | null;
}

export interface RtkProcessSnapshot {
  active_run_id: string | null;
  pid: number | null;
  stop_requested: boolean;
  stop_deadline_monotonic_sec: number | null;
  kill_sent: boolean;
  exit_reported: boolean;
}

export interface RtkWorkerStatusSnapshot {
  run_id: string;
  kind: RtkWorkerStatusKind;
  detail_code: string | null;
}

export interface RtkRuntimeSnapshot {
  supervisor: RtkSupervisorSnapshot;
  manager: RtkManagerSnapshot | null;
  process: RtkProcessSnapshot | null;
  last_worker_status: RtkWorkerStatusSnapshot | null;
  last_process_returncode: number | null;
  last_protocol_fault_run_id: string | null;
}

export interface RtkGgaTelemetry {
  enabled: boolean;
  state: RtkGgaState | string;
  source_age_sec: number | null;
  last_sent_age_sec: number | null;
  sent_total: number;
  send_errors: number;
}

export interface RtkCorrectionStream {
  state: RtkCorrectionStreamState | string;
  connected: boolean;
  healthy: boolean;
  correction_age_sec: number | null;
  socket_bytes_received: number;
  valid_frames: number;
  published_frames: number;
  crc_failures: number;
  invalid_headers: number;
  resync_bytes_discarded: number;
  partial_frame_timeouts: number;
  oversize_drops: number;
  publish_errors: number;
  mavros_ready: boolean;
  mavros_rtcm_subscribers: number;
  worker_mavros_subscribers: number;
  max_mavros_rtcm_frame_bytes: number | null;
  gga: RtkGgaTelemetry;
}

/**
 * GNSS solution is independent from correction-stream health.
 * MAVLink GPS_FIX_TYPE: 5 = RTK FLOAT, 6 = RTK FIXED.
 */
export interface RtkGnssSolution {
  fix_type: number;
  fix_name: string;
  rtk_float: boolean;
  rtk_fixed: boolean;
  satellites_visible: number;
  horizontal_accuracy_m: number | null;
  vertical_accuracy_m: number | null;
  hdop: number | null;
  vdop: number | null;
}

/** Inner `status` object of GET /api/rtk/status. */
export interface RtkStatus {
  persisted: RtkPersistedRuntimeState;
  active_profile: RtkProfile | null;
  runtime: RtkRuntimeSnapshot;
  correction_stream: RtkCorrectionStream;
  gnss_solution: RtkGnssSolution;
}

/** Exact GET /api/rtk/status HTTP body. */
export interface RtkStatusResponse {
  status: RtkStatus;
}

// ---------------------------------------------------------------------------
// FastAPI error body
// ---------------------------------------------------------------------------

export interface RtkApiErrorDetail {
  code: string;
  message: string;
}

export interface FastApiValidationErrorItem {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

export interface FastApiErrorBody {
  detail: RtkApiErrorDetail | string | FastApiValidationErrorItem[];
}

export interface RtkParsedApiError {
  statusCode: number | null;
  code: string | null;
  message: string;
}

/**
 * Deprecated RoverServices compatibility types. LoRa is not part of the
 * production RTK API. These exist only so the telemetry service object still
 * typechecks; they are not a runtime NTRIP authority.
 */
export type LoraRTKStatusState =
  | "connecting"
  | "connected"
  | "streaming"
  | "error"
  | "disconnected"
  | "status_update";

export interface LoraRTKStatus {
  status?: LoraRTKStatusState;
  message?: string;
  started_at?: string;
  messages_received?: number;
  bytes_received?: number;
  error_count?: number;
  is_connected?: boolean;
  is_running?: boolean;
}

export interface NTRIPStartParams {
  ntrip_url?: string;
  host?: string;
  port?: number;
  mountpoint?: string;
  user?: string;
  password?: string;
  [key: string]: unknown;
}

export interface NTRIPStartResponse {
  success: boolean;
  message: string;
  source: "NTRIP";
}

export interface NTRIPStopResponse {
  success: boolean;
  message: string;
  source: "NTRIP";
}

export interface LoRaStartResponse {
  success: boolean;
  message: string;
  source: "LoRa";
}

export interface LoRaStopResponse {
  success: boolean;
  message: string;
  source: "LoRa";
}

export interface RTKStopAllResponse {
  success: boolean;
  message: string;
}

/** @deprecated Use RtkStatusResponse. Kept for RoverServices typing. */
export type RTKStatusResponse = RtkStatusResponse;
