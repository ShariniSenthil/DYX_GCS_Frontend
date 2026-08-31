/**
 * Map the active 4WD backend telemetry payload to the existing UI contract.
 *
 * The backend sends nested production sections plus flat compatibility fields.
 * This adapter accepts both formats and keeps UI components backend-agnostic.
 */

import type { Px4TelemetryData } from "../types/px4/telemetry";
import type {
  RoverTelemetry,
  TelemetryState,
  TelemetryGlobal,
  TelemetryBattery,
  TelemetryRtk,
  TelemetryMission,
  ServoStatus,
  NetworkData,
} from "../types/telemetry";
import { normalizePx4Mode } from "./px4ModeAdapter";

export function isPx4Payload(data: unknown): data is Px4TelemetryData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  return (
    "vehicle" in d ||
    "position" in d ||
    "gps" in d ||
    "accuracy" in d ||
    "accuracy_available" in d ||
    "cross_track_error_mm" in d ||
    "front_back_error_mm" in d ||
    "radial_error_mm" in d ||
    "pos_n" in d ||
    "pos_e" in d ||
    ("lat" in d && "lon" in d) ||
    "battery_pct" in d ||
    "gps_fix" in d ||
    "rpp_state" in d ||
    "heading_ned_deg" in d
  );
}

const safeNum = (value: unknown, fallback = 0): number => {
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const optionalNum = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : null;
};

const firstOptionalNum = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numberValue = optionalNum(value);
    if (numberValue !== null) return numberValue;
  }
  return null;
};

const safeBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
};

function mapGpsFix(fix: unknown): number {
  return Math.max(0, Math.min(6, safeNum(fix, 0)));
}

export function toRoverTelemetry(
  flat: Px4TelemetryData,
  now: number = Date.now(),
): RoverTelemetry {
  const vehicle = flat.vehicle;
  const position = flat.position;
  const gps = flat.gps;
  const batterySection = flat.battery;
  const missionSection = flat.mission;
  const accuracySection = flat.accuracy;

  const connected = safeBool(flat.connected ?? vehicle?.connected);

  const state: TelemetryState = {
    armed: safeBool(flat.armed ?? vehicle?.armed),
    mode: normalizePx4Mode(flat.mode ?? vehicle?.mode),
    system_status: connected ? "ACTIVE" : "STANDBY",
    heartbeat_ts: now,
  };

  const global: TelemetryGlobal = {
    lat: safeNum(flat.lat ?? position?.latitude),
    lon: safeNum(flat.lon ?? position?.longitude),
    alt_rel: safeNum(flat.alt ?? position?.altitude_m),
    vel: safeNum(
      flat.speed_m_s ?? flat.speed_mps ?? vehicle?.ground_speed_mps,
    ),
    satellites_visible: safeNum(
      flat.gps_sat ?? gps?.satellites_visible,
    ),
  };

  const battery: TelemetryBattery = {
    voltage: safeNum(flat.battery_v ?? batterySection?.voltage_v),
    current: safeNum(batterySection?.current_a),
    percentage: safeNum(
      flat.battery_pct ?? batterySection?.remaining_percent,
    ),
  };

  const fixType = mapGpsFix(flat.gps_fix ?? gps?.fix_type);

  const rtk: TelemetryRtk = {
    fix_type: fixType,
    baseline_age: 0,
    base_linked: safeBool(gps?.rtk_fixed, fixType >= 5),
  };

  const activePointIndex = firstOptionalNum(
    missionSection?.active_point_index,
  );
  const activePointNumber = firstOptionalNum(
    missionSection?.active_point_number,
    activePointIndex !== null ? activePointIndex + 1 : null,
  );

  const mission: TelemetryMission & {
    rpp_state?: number;
    rpp_state_name?: string;
    dist_to_goal_m?: number;
    xtrack_m?: number;
  } = {
    total_wp: safeNum(missionSection?.total_points),
    current_wp: safeNum(activePointNumber),
    status: String(
      missionSection?.state ?? flat.mission_state ?? "IDLE",
    ).toUpperCase(),
    progress_pct: safeNum(missionSection?.progress_percent),
    active_point_index:
      activePointIndex !== null ? Math.trunc(activePointIndex) : null,
    active_point_number:
      activePointNumber !== null ? Math.trunc(activePointNumber) : null,
    active_point_state: missionSection?.active_point_state ?? null,
    completed_points: safeNum(missionSection?.completed_points),
    skipped_points: safeNum(missionSection?.skipped_points),
    failed_points: safeNum(missionSection?.failed_points),
    remaining_points: safeNum(missionSection?.remaining_points),
    navigation_point_count: safeNum(
      missionSection?.navigation_point_count,
    ),
    loaded: Boolean(missionSection?.loaded),
    ready: Boolean(missionSection?.ready),
    rpp_state: safeNum(flat.rpp_state),
    rpp_state_name: flat.rpp_state_name ?? "",
    dist_to_goal_m: safeNum(flat.dist_to_goal_m ?? flat.dist_to_goal),
    xtrack_m: safeNum(flat.xtrack_m),
  };

  const markingActive = safeBool(
    flat.marking_active ?? missionSection?.marking_active,
  );

  const servo: ServoStatus & {
    spraying?: boolean;
    marking_state?: string;
    commanded_on?: boolean;
    confirmed_off?: boolean;
    dash_feasible?: boolean;
  } = {
    servo_id: 0,
    active: safeBool(flat.spraying, markingActive),
    last_command_ts: now,
    spraying: safeBool(flat.spraying, markingActive),
    marking_state:
      flat.marking_state ?? (markingActive ? "marking" : "idle"),
    commanded_on: safeBool(flat.commanded_on),
    confirmed_off: safeBool(flat.confirmed_off),
    dash_feasible: safeBool(flat.dash_feasible),
  };

  const network: NetworkData = {
    connection_type: "none",
    wifi_signal_strength: 0,
    wifi_rssi: -100,
    interface: "",
    wifi_connected: false,
    lora_connected: false,
  };

  const imuLabel =
    flat.imu_status ??
    (flat.rpp_debug_fresh === false
      ? "RPP STALE"
      : flat.rpp_state_name ?? "OK");

  const hrms = firstOptionalNum(
    flat.hrms,
    gps?.horizontal_accuracy_m,
  );
  const vrms = firstOptionalNum(
    flat.vrms,
    gps?.vertical_accuracy_m,
  );

  const crossTrackErrorMm = firstOptionalNum(
  flat.cross_track_error_mm,
  accuracySection?.cross_track_error_mm,
);

const crossTrackAbsMm = firstOptionalNum(
  flat.cross_track_abs_mm,
  accuracySection?.cross_track_abs_mm,
  crossTrackErrorMm !== null
    ? Math.abs(crossTrackErrorMm)
    : null,
);

const frontBackErrorMm = firstOptionalNum(
  flat.front_back_error_mm,
  accuracySection?.front_back_error_mm,
);

const frontBackAbsMm = firstOptionalNum(
  flat.front_back_abs_mm,
  accuracySection?.front_back_abs_mm,
  frontBackErrorMm !== null
    ? Math.abs(frontBackErrorMm)
    : null,
);

const radialErrorMm = firstOptionalNum(
  flat.radial_error_mm,
  accuracySection?.radial_error_mm,
);

const closestRadialErrorMm = firstOptionalNum(
  flat.closest_radial_error_mm,
  accuracySection?.closest_radial_error_mm,
);

const accuracyTargetMm = firstOptionalNum(
  flat.accuracy_target_mm,
  accuracySection?.accuracy_target_mm,
);

const testToleranceMm = firstOptionalNum(
  flat.test_tolerance_mm,
  accuracySection?.test_tolerance_mm,
);

const crossTrackSide = String(
  flat.cross_track_side ??
    accuracySection?.cross_track_side ??
    "UNKNOWN",
);

const frontBackPosition = String(
  flat.front_back_position ??
    accuracySection?.front_back_position ??
    "UNKNOWN",
);

const accuracyStatus = String(
  flat.accuracy_status ??
    accuracySection?.accuracy_status ??
    "UNAVAILABLE",
);

const accuracyPass = safeBool(
  flat.accuracy_pass ??
    accuracySection?.accuracy_pass,
  false,
);

const withinTestTolerance = safeBool(
  flat.within_test_tolerance ??
    accuracySection?.within_test_tolerance,
  false,
);

const accuracyAvailable = safeBool(
  flat.accuracy_available ??
    accuracySection?.available,
  crossTrackErrorMm !== null &&
    frontBackErrorMm !== null &&
    radialErrorMm !== null,
);

/*
 * Exact live RPP controller telemetry.
 *
 * These values are calculated by RPP and forwarded by the backend.
 * Preserve their values, signs and units without reconstructing geometry.
 */
const rppDebugAvailable = safeBool(
  flat.rpp_debug_available,
  false,
);

const rppControlMode =
  typeof flat.rpp_control_mode === "string"
    ? flat.rpp_control_mode
    : null;

const rppGoalNumber = firstOptionalNum(
  flat.rpp_goal_number,
);

const rppActualSpeedMps = firstOptionalNum(
  flat.rpp_actual_speed_mps,
);

const rppCommandSpeedMps = firstOptionalNum(
  flat.rpp_command_speed_mps,
);

const rppCurrentYawDeg = firstOptionalNum(
  flat.rpp_current_yaw_deg,
);

const rppPathBearingDeg = firstOptionalNum(
  flat.rpp_path_bearing_deg,
);

const rppGuidanceBearingDeg = firstOptionalNum(
  flat.rpp_guidance_bearing_deg,
);

const rppHeadingErrorDeg = firstOptionalNum(
  flat.rpp_heading_error_deg,
);

const rppDistanceToGoalM = firstOptionalNum(
  flat.rpp_distance_to_goal_m,
);

const rppCrossTrackErrorMm = firstOptionalNum(
  flat.rpp_cross_track_error_mm,
);

const rppCrossTrackSide =
  typeof flat.rpp_cross_track_side === "string"
    ? flat.rpp_cross_track_side
    : null;

const rppAlongRemainingMm = firstOptionalNum(
  flat.rpp_along_remaining_mm,
);

const rppAlongPosition =
  typeof flat.rpp_along_position === "string"
    ? flat.rpp_along_position
    : null;

  return {
    state,
    global,
    battery,
    rtk,
    mission,
    servo,
    network,
    hrms: hrms ?? 0,
    vrms: vrms ?? 0,
    imu_status: imuLabel,
    lastMessageTs: now,
    fcu_connected: connected,
    gps_fix_name: flat.gps_fix_name ?? gps?.fix_name,
    mission_state: mission.status,
    rpp_state_name: flat.rpp_state_name ?? undefined,
    xtrack_cm: safeNum(flat.xtrack_m) * 100,
    accuracy: {
  available: accuracyAvailable,

  goal_number: firstOptionalNum(
    accuracySection?.goal_number,
  ),

  cross_track_error_mm: crossTrackErrorMm,
  cross_track_abs_mm: crossTrackAbsMm,
  cross_track_side: crossTrackSide,

  front_back_error_mm: frontBackErrorMm,
  front_back_abs_mm: frontBackAbsMm,
  front_back_position: frontBackPosition,

  radial_error_mm: radialErrorMm,
  closest_radial_error_mm:
    closestRadialErrorMm,

  accuracy_target_mm: accuracyTargetMm,
  test_tolerance_mm: testToleranceMm,

  accuracy_status: accuracyStatus,
  accuracy_pass: accuracyPass,
  within_test_tolerance:
    withinTestTolerance,
},

accuracy_available: accuracyAvailable,

cross_track_error_mm: crossTrackErrorMm,
cross_track_abs_mm: crossTrackAbsMm,
cross_track_side: crossTrackSide,

front_back_error_mm: frontBackErrorMm,
front_back_abs_mm: frontBackAbsMm,
front_back_position: frontBackPosition,

radial_error_mm: radialErrorMm,
closest_radial_error_mm:
  closestRadialErrorMm,

accuracy_target_mm: accuracyTargetMm,
test_tolerance_mm: testToleranceMm,

accuracy_status: accuracyStatus,
accuracy_pass: accuracyPass,
within_test_tolerance:
  withinTestTolerance,

rpp_debug_available: rppDebugAvailable,
rpp_control_mode: rppControlMode,
rpp_goal_number: rppGoalNumber,

rpp_actual_speed_mps: rppActualSpeedMps,
rpp_command_speed_mps: rppCommandSpeedMps,

rpp_current_yaw_deg: rppCurrentYawDeg,
rpp_path_bearing_deg: rppPathBearingDeg,
rpp_guidance_bearing_deg: rppGuidanceBearingDeg,
rpp_heading_error_deg: rppHeadingErrorDeg,

rpp_distance_to_goal_m: rppDistanceToGoalM,

rpp_cross_track_error_mm: rppCrossTrackErrorMm,
rpp_cross_track_side: rppCrossTrackSide,

rpp_along_remaining_mm: rppAlongRemainingMm,
rpp_along_position: rppAlongPosition,
    distance_to_next_m: (() => {
      const distanceM = firstOptionalNum(
        flat.dist_to_goal_m,
        flat.dist_to_goal,
      );
      if (distanceM !== null) return Math.max(0, distanceM);

      const distanceCm = optionalNum(flat.wp_dist_cm);
      return distanceCm !== null ? Math.max(0, distanceCm / 100) : undefined;
    })(),
    attitude: {
      yaw_deg: safeNum(
        flat.heading_ned_deg ?? flat.heading_deg ?? vehicle?.heading_deg,
      ),
    },
    measured_speed_m_s: optionalNum(flat.measured_speed_m_s),
    along_track_speed_mps: optionalNum(flat.along_track_speed_mps),
    cross_track_speed_mps: optionalNum(flat.cross_track_speed_mps),
    joystick_state: flat.joystick_state ?? null,
    joystick_active: flat.joystick_active ?? null,
    joystick_last_valid_cmd_age_ms:
      flat.joystick_last_valid_cmd_age_ms ?? null,
    joystick_stop_reason: flat.joystick_stop_reason ?? null,
    control_owner: flat.control_owner ?? null,
  };
}

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
    total_points?: number;
    completed_points?: number;
    skipped_points?: number;
    failed_points?: number;
    remaining_points?: number;
    progress_percent?: number;
    active_point_index?: number | null;
    active_point_number?: number | null;
    active_point_state?: string | null;
  },
): RoverTelemetry {
  const missionPatch: Partial<TelemetryMission> & {
    rpp_state?: number;
    rpp_state_name?: string;
  } = {
    status: status.state ?? base.mission.status,
    rpp_state: status.rpp_state ?? (base.mission as any).rpp_state,
    rpp_state_name:
      status.rpp_state_name ?? (base.mission as any).rpp_state_name,
  };

  if (typeof status.total_points === "number") {
    missionPatch.total_wp = Math.max(0, status.total_points);
  }
  if (typeof status.completed_points === "number") {
    missionPatch.completed_points = Math.max(0, status.completed_points);
  }
  if (typeof status.skipped_points === "number") {
    missionPatch.skipped_points = Math.max(0, status.skipped_points);
  }
  if (typeof status.failed_points === "number") {
    missionPatch.failed_points = Math.max(0, status.failed_points);
  }
  if (typeof status.remaining_points === "number") {
    missionPatch.remaining_points = Math.max(0, status.remaining_points);
  }
  if (typeof status.progress_percent === "number") {
    missionPatch.progress_pct = Math.max(
      0,
      Math.min(100, status.progress_percent),
    );
  }
  if (status.active_point_index !== undefined) {
    missionPatch.active_point_index = status.active_point_index;
  }
  if (status.active_point_number !== undefined) {
    missionPatch.active_point_number = status.active_point_number;
    missionPatch.current_wp = status.active_point_number ?? 0;
  }
  if (status.active_point_state !== undefined) {
    missionPatch.active_point_state = status.active_point_state;
  }

  return {
    ...base,
    mission: { ...base.mission, ...missionPatch },
    mission_state: status.state ?? base.mission_state,
    distance_to_next_m:
      typeof status.dist_to_goal === "number"
        ? status.dist_to_goal
        : base.distance_to_next_m,
    xtrack_cm:
      typeof status.xtrack === "number" ? status.xtrack * 100 : base.xtrack_cm,
    global: {
      ...base.global,
      vel: typeof status.speed === "number" ? status.speed : base.global.vel,
    },
  };
}
