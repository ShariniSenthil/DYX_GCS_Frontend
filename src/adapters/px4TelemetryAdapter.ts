/**
 * px4TelemetryAdapter — Map flat Px4TelemetryData to existing RoverTelemetry shape.
 *
 * This adapter is the single translation layer between the 4WD_SERVER backend
 * and the existing UI contract. No UI component needs to know the backend
 * field names — they only consume RoverTelemetry.
 *
 * Field mapping reference:
 *   Audit doc §Telemetry — T1, T3
 *   Implementation plan §Phase 3 field mapping table
 */

import type { Px4TelemetryData } from '../types/px4/telemetry';
import type {
  RoverTelemetry,
  TelemetryState,
  TelemetryGlobal,
  TelemetryBattery,
  TelemetryRtk,
  TelemetryMission,
  ServoStatus,
  NetworkData,
} from '../types/telemetry';
import { normalizePx4Mode } from './px4ModeAdapter';

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Detect whether a socket payload is a flat PX4 dict vs legacy ArduRover envelope.
 * PX4 payloads have `pos_n` / `pos_e` (NED); ArduRover has `state.armed` or `position`.
 */
export function isPx4Payload(data: unknown): data is Px4TelemetryData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  // PX4 flat dict — accept any of these top-level fields (backend may omit null keys).
  return (
    'pos_n' in d ||
    'pos_e' in d ||
    ('lat' in d && 'lon' in d) ||
    'battery_pct' in d ||
    'gps_fix' in d ||
    'rpp_state' in d ||
    'heading_ned_deg' in d
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

const safeBool = (v: unknown, fallback = false): boolean => {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return fallback;
};

const optionalNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  return isFinite(n) ? n : null;
};

// ── GPS fix mapping ───────────────────────────────────────────────────────────
// PX4 backend sends gps_fix as integer (0–6 scale compatible with MAVLink GPS_FIX_TYPE)

function mapGpsFix(fix: unknown): number {
  const n = safeNum(fix, 0);
  // Clamp to valid range
  return Math.max(0, Math.min(6, n));
}

// ── Main adapter ──────────────────────────────────────────────────────────────

/**
 * Convert flat PX4TelemetryData → RoverTelemetry for UI consumption.
 *
 * Safe for missing/null fields: falls back to 0 / false / 'UNKNOWN'.
 * Called on every telemetry socket event (~10 Hz).
 */
export function toRoverTelemetry(
  flat: Px4TelemetryData,
  now: number = Date.now(),
): RoverTelemetry {
  const state: TelemetryState = {
    armed: safeBool(flat.armed),
    mode: normalizePx4Mode(flat.mode),
    system_status: flat.connected ? 'ACTIVE' : 'STANDBY',
    heartbeat_ts: now,
  };

  const global: TelemetryGlobal = {
    lat: safeNum(flat.lat),
    lon: safeNum(flat.lon),
    alt_rel: safeNum(flat.alt),
    vel: safeNum(flat.speed_m_s),
    satellites_visible: safeNum(flat.gps_sat),
  };

  const battery: TelemetryBattery = {
    voltage: safeNum(flat.battery_v),
    current: 0, // Not in PX4 flat dict
    percentage: safeNum(flat.battery_pct),
  };

  const rtk: TelemetryRtk = {
    fix_type: mapGpsFix(flat.gps_fix),
    baseline_age: 0,
    base_linked: safeNum(flat.gps_fix) >= 5,
  };

  const mission: TelemetryMission & {
    rpp_state?: number;
    rpp_state_name?: string;
    dist_to_goal_m?: number;
    xtrack_m?: number;
  } = {
    total_wp: 0,
    current_wp: 0,
    status: 'IDLE',
    progress_pct: 0,
    rpp_state: safeNum(flat.rpp_state),
    rpp_state_name: flat.rpp_state_name ?? '',
    dist_to_goal_m: safeNum(flat.dist_to_goal_m),
    xtrack_m: safeNum(flat.xtrack_m),
  };

  const servo: ServoStatus & {
    spraying?: boolean;
    marking_state?: string;
    commanded_on?: boolean;
    confirmed_off?: boolean;
    dash_feasible?: boolean;
  } = {
    servo_id: 0,
    active: safeBool(flat.spraying),
    last_command_ts: now,
    spraying: safeBool(flat.spraying),
    marking_state: flat.marking_state ?? 'idle',
    commanded_on: safeBool(flat.commanded_on),
    confirmed_off: safeBool(flat.confirmed_off),
    dash_feasible: safeBool(flat.dash_feasible),
  };

  // Jetson Wi-Fi/Ethernet comes from GET /api/network poll — not FCU `connected`.
  const network: NetworkData = {
    connection_type: 'none',
    wifi_signal_strength: 0,
    wifi_rssi: -100,
    interface: '',
    wifi_connected: false,
    lora_connected: false,
  };

  const imuLabel =
    flat.imu_status ??
    (flat.rpp_debug_fresh === false ? 'RPP STALE' : flat.rpp_state_name ?? 'OK');

  return {
    state,
    global,
    battery,
    rtk,
    mission,
    servo,
    network,
    hrms: safeNum(flat.hrms),
    vrms: safeNum(flat.vrms),
    imu_status: imuLabel,
    lastMessageTs: now,
    fcu_connected: safeBool(flat.connected),
    gps_fix_name: flat.gps_fix_name,
    rpp_state_name: flat.rpp_state_name,
    xtrack_cm: safeNum(flat.xtrack_m) * 100,
    distance_to_next_m: safeNum(flat.dist_to_goal_m),
    attitude: { yaw_deg: safeNum(flat.heading_ned_deg) },
    measured_speed_m_s: optionalNum(flat.measured_speed_m_s),
    along_track_speed_mps: optionalNum(flat.along_track_speed_mps),
    cross_track_speed_mps: optionalNum(flat.cross_track_speed_mps),
    // Joystick V2 telemetry fields
    joystick_state: flat.joystick_state ?? null,
    joystick_active: flat.joystick_active ?? null,
    joystick_last_valid_cmd_age_ms: flat.joystick_last_valid_cmd_age_ms ?? null,
    joystick_stop_reason: flat.joystick_stop_reason ?? null,
    control_owner: flat.control_owner ?? null,
  };
}

/**
 * Merge a mission_status socket snapshot into an existing RoverTelemetry.
 * Called separately from the `mission_status` event (~10 Hz).
 */
export function mergeMissionStatus(
  base: RoverTelemetry,
  status: {
    state?: string;
    rpp_state?: number;
    rpp_state_name?: string;
    dist_to_goal?: number;
    speed?: number;
    xtrack?: number;
    path_name?: string;
  },
): RoverTelemetry {
  const missionPatch: Partial<TelemetryMission> & {
    rpp_state?: number;
    rpp_state_name?: string;
  } = {
    status: status.state ?? base.mission.status,
    rpp_state: status.rpp_state ?? (base.mission as any).rpp_state,
    rpp_state_name: status.rpp_state_name ?? (base.mission as any).rpp_state_name,
  };

  return {
    ...base,
    mission: { ...base.mission, ...missionPatch },
    distance_to_next_m:
      typeof status.dist_to_goal === 'number' ? status.dist_to_goal : base.distance_to_next_m,
    xtrack_cm:
      typeof status.xtrack === 'number' ? status.xtrack * 100 : base.xtrack_cm,
    global: {
      ...base.global,
      vel: typeof status.speed === 'number' ? status.speed : base.global.vel,
    },
  };
}
