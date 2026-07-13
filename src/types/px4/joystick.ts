/**
 * 4WD_SERVER Joystick V2 types — lease protocol.
 *
 * Backend: 4WD_SERVER/server/joystick_controller.py
 */

// ── Frontend state machine ────────────────────────────────────────────────────

export type FrontendJoystickState =
  | 'DISABLED'
  | 'DISCONNECTED'
  | 'SUSPENDED'
  | 'AVAILABLE'
  | 'ACQUIRING'
  | 'ACTIVE'
  | 'HELD'
  | 'RELEASING'
  | 'BLOCKED_BY_MISSION'
  | 'ERROR';

/** Backward-compatible alias. */
export type JoystickLeaseState = FrontendJoystickState;

// ── Socket payloads ───────────────────────────────────────────────────────────

/** Client → Server: request joystick lease. */
export interface JoystickAcquirePayload {
  auth: string;
  session_id: string;
  client_monotonic_ms: number;
}

/** Server → Client: lease granted. */
export interface JoystickAcquiredPayload {
  type?: 'joystick_acquired';
  lease_id: string;
  state?: 'active';
  command_rate_hz: number;
  max_throttle: number;
  max_steering: number;
  server_stop_timeout_ms: number;
  gateway_stop_timeout_ms?: number;
}

/** Client → Server: control command (sent <= command_rate_hz). */
export interface JoystickCommandPayload {
  auth: string;
  session_id: string;
  lease_id: string;
  sequence: number;
  client_monotonic_ms: number;
  throttle: number;     // normalized [-1, 1]
  steering: number;     // normalized [-1, 1]
  deadman: boolean;     // must be true to actuate
}

/** Client → Server: release lease. */
export interface JoystickReleasePayload {
  auth: string;
  session_id: string;
  lease_id: string;
}

/** Server → Client: release confirmed. */
export interface JoystickReleasedPayload {
  type?: 'joystick_released';
  state?: 'inactive';
  reason?: string;
  lease_id?: string;
}

// ── Error types ───────────────────────────────────────────────────────────────

export type JoystickErrorCode =
  | 'manual_control_disabled'
  | 'malformed'
  | 'mode_unavailable'
  | 'fcu_disconnected'
  | 'not_armed'
  | 'not_owner'
  | 'mission_active'
  | 'joystick_active'
  | 'acquire_cancelled'
  | 'unavailable'
  | 'lease_inactive'
  | 'transport_unavailable'
  | 'out_of_order'
  | 'replay'
  | 'rate_exceeded'
  | 'nan_value'
  | 'out_of_range'
  | 'unauthorised'
  | 'unauthorized'
  | 'unknown';

export interface JoystickErrorPayload {
  type: string;
  code: JoystickErrorCode;
  message: string;
}

// ── Intent ────────────────────────────────────────────────────────────────────

export interface JoystickIntent {
  throttle: number;
  steering: number;
}

// ── Telemetry fields (subset of RoverTelemetry relevant to joystick) ──────────

export interface JoystickTelemetryFields {
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
  connected?: boolean | null;
  armed?: boolean | null;
  mode?: string | null;
}

// ── Lease info ────────────────────────────────────────────────────────────────

export interface JoystickLeaseInfo {
  leaseId: string;
  commandRateHz: number;
  maxThrottle: number;
  maxSteering: number;
  serverStopTimeoutMs: number;
  gatewayStopTimeoutMs?: number;
}
