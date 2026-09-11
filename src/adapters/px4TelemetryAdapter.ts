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
  TelemetryEnvelope,
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
    "rpp_state_name" in d ||
    "rpp" in d ||
    "rpp_debug" in d ||
    "rpp_debug_available" in d ||
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstPresent(...values: unknown[]): unknown {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return value;
  }
  return undefined;
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

const RPP_DEBUG_FIELD_MAP: Array<{ flat: string; aliases: string[] }> = [
  {
    flat: "rpp_debug_available",
    aliases: ["rpp_debug_available", "debug_available", "available"],
  },
  {
    flat: "rpp_debug_fresh",
    aliases: ["rpp_debug_fresh", "debug_fresh", "fresh"],
  },
  {
    flat: "rpp_control_mode",
    aliases: ["rpp_control_mode", "control_mode"],
  },
  {
    flat: "rpp_goal_number",
    aliases: ["rpp_goal_number", "goal_number"],
  },
  {
    flat: "rpp_actual_speed_mps",
    aliases: ["rpp_actual_speed_mps", "actual_speed_mps"],
  },
  {
    flat: "rpp_command_speed_mps",
    aliases: ["rpp_command_speed_mps", "command_speed_mps"],
  },
  {
    flat: "rpp_current_yaw_deg",
    aliases: ["rpp_current_yaw_deg", "current_yaw_deg"],
  },
  {
    flat: "rpp_path_bearing_deg",
    aliases: ["rpp_path_bearing_deg", "path_bearing_deg"],
  },
  {
    flat: "rpp_guidance_bearing_deg",
    aliases: ["rpp_guidance_bearing_deg", "guidance_bearing_deg"],
  },
  {
    flat: "rpp_heading_error_deg",
    aliases: ["rpp_heading_error_deg", "heading_error_deg"],
  },
  {
    flat: "rpp_distance_to_goal_m",
    aliases: ["rpp_distance_to_goal_m", "distance_to_goal_m", "dist_to_goal_m"],
  },
  {
    flat: "rpp_cross_track_error_mm",
    aliases: ["rpp_cross_track_error_mm", "cross_track_error_mm"],
  },
  {
    flat: "rpp_cross_track_side",
    aliases: ["rpp_cross_track_side", "cross_track_side"],
  },
  {
    flat: "rpp_along_remaining_mm",
    aliases: ["rpp_along_remaining_mm", "along_remaining_mm"],
  },
  {
    flat: "rpp_along_position",
    aliases: ["rpp_along_position", "along_position"],
  },
];

/**
 * Accept wrapped backend packets such as `{ data: {...} }` or `{ telemetry: {...} }`.
 * Outer timestamp fields are preserved when the inner body is the live snapshot.
 */
export function unwrapTelemetryPayload(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const root = data as Record<string, unknown>;
  const outerGeneratedAt = root.generated_at;
  const outerTimestamp = root.timestamp;
  const outerCreatedAt = root.created_at;
  const wrappers = [
    root.telemetry,
    root.data,
    root.payload,
    root.rover_data,
    root.body,
    root.result,
  ];

  if (isPx4Payload(root)) {
    return root;
  }

  for (const candidate of wrappers) {
    if (!isPx4Payload(candidate)) continue;
    const inner = candidate as Record<string, unknown>;
    return {
      ...inner,
      generated_at: firstPresent(outerGeneratedAt, inner.generated_at),
      timestamp: firstPresent(outerTimestamp, inner.timestamp),
      created_at: firstPresent(outerCreatedAt, inner.created_at),
    };
  }

  return data;
}

/**
 * Copy nested `rpp` / `rpp_debug` fields onto the flat telemetry contract.
 * Existing flat values always win so mixed payloads stay stable.
 */
export function flattenRppFields(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const flattened: Record<string, unknown> = { ...raw };
  const rpp = asRecord(raw.rpp);
  const rppDebug =
    asRecord(raw.rpp_debug) ??
    asRecord(rpp?.debug) ??
    asRecord(rpp?.rpp_debug);

  const rppState = firstPresent(raw.rpp_state, rpp?.state, rpp?.rpp_state);
  if (
    isAbsent(flattened.rpp_state) &&
    rppState !== undefined &&
    typeof rppState !== "object"
  ) {
    flattened.rpp_state = rppState;
  }

  const rppStateName = firstPresent(
    raw.rpp_state_name,
    rpp?.state_name,
    rpp?.rpp_state_name,
    rpp?.name,
  );
  if (isAbsent(flattened.rpp_state_name) && typeof rppStateName === "string") {
    flattened.rpp_state_name = rppStateName;
  }

  const nestedSources = [rppDebug, rpp].filter(
    (value): value is Record<string, unknown> => Boolean(value),
  );

  for (const { flat, aliases } of RPP_DEBUG_FIELD_MAP) {
    if (!isAbsent(flattened[flat])) continue;
    const nestedValues = nestedSources.flatMap((source) =>
      aliases.map((alias) => source[alias]),
    );
    const value = firstPresent(...nestedValues);
    if (value !== undefined) {
      flattened[flat] = value;
    }
  }

  return flattened;
}


export function toTelemetryEnvelopeFromRoverData(
  raw: any,
  now: number = Date.now(),
): TelemetryEnvelope {
  const envelope: TelemetryEnvelope = { timestamp: now };
  const flat = flattenRppFields(asRecord(raw) ?? {});

  const optNum = (val: any) => {
    if (val === null || val === undefined || val === "") return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  };
  const optBool = (val: any) => {
    if (val === null || val === undefined) return undefined;
    if (val === 1 || val === "1" || val === "true") return true;
    if (val === 0 || val === "0" || val === "false") return false;
    return Boolean(val);
  };
  const optStr = (val: any) => {
    if (val === null || val === undefined) return undefined;
    return String(val);
  };
  
  const cleanObj = (obj: any) => {
    const cleaned: any = {};
    let hasKeys = false;
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        cleaned[k] = v;
        hasKeys = true;
      }
    }
    return hasKeys ? cleaned : undefined;
  };

  const position = asRecord(flat.position) ?? {};
  const vehicle = asRecord(flat.vehicle) ?? {};
  const gps = asRecord(flat.gps) ?? {};
  const battery = asRecord(flat.battery) ?? {};
  const mission = asRecord(flat.mission) ?? {};
  
  envelope.state = cleanObj({
    armed: optBool(flat.armed ?? vehicle.armed),
    mode: flat.mode ?? vehicle.mode ? String(flat.mode ?? vehicle.mode) : undefined,
    system_status: optBool(flat.connected ?? vehicle.connected) ? "ACTIVE" : (optBool(flat.connected ?? vehicle.connected) === false ? "STANDBY" : undefined),
    heartbeat_ts: now,
  });

  envelope.global = cleanObj({
    lat: optNum(flat.lat ?? position.latitude),
    lon: optNum(flat.lon ?? position.longitude),
    alt_rel: optNum(flat.alt ?? position.altitude_m),
    vel: optNum(flat.speed_m_s ?? flat.speed_mps ?? vehicle.ground_speed_mps),
    satellites_visible: optNum(flat.gps_sat ?? gps.satellites_visible),
  });

  envelope.battery = cleanObj({
    voltage: optNum(flat.battery_v ?? battery.voltage_v),
    current: optNum(battery.current_a),
    percentage: optNum(flat.battery_pct ?? battery.remaining_percent),
  });

  const fixType = optNum(flat.gps_fix ?? gps.fix_type);
  envelope.rtk = cleanObj({
    fix_type: fixType,
    base_linked: fixType !== undefined ? fixType >= 5 : undefined,
  });

  envelope.servo = cleanObj({
    active: optBool(flat.spraying ?? flat.marking_active ?? mission.marking_active),
    spraying: optBool(flat.spraying ?? flat.marking_active ?? mission.marking_active),
  });

  envelope.distance_to_next_m = optNum(flat.dist_to_goal_m ?? flat.dist_to_goal);
  envelope.xtrack_cm = optNum(flat.xtrack_m) !== undefined ? optNum(flat.xtrack_m)! * 100 : undefined;

  envelope.fcu_connected = optBool(flat.connected ?? vehicle.connected);
  envelope.mission_state = optStr(mission.state ?? flat.mission_state);
  envelope.rpp_state_name = optStr(flat.rpp_state_name);

  const rppDebugAvailable = optBool(flat.rpp_debug_available);
  envelope.rpp_debug_available =
    rppDebugAvailable ??
    (optNum(flat.rpp_actual_speed_mps) !== undefined ||
    optNum(flat.rpp_cross_track_error_mm) !== undefined ||
    optNum(flat.rpp_along_remaining_mm) !== undefined ||
    optNum(flat.rpp_distance_to_goal_m) !== undefined
      ? true
      : undefined);
  envelope.rpp_control_mode = optStr(flat.rpp_control_mode);
  envelope.rpp_goal_number = optNum(flat.rpp_goal_number);
  envelope.rpp_actual_speed_mps = optNum(flat.rpp_actual_speed_mps);
  envelope.rpp_command_speed_mps = optNum(flat.rpp_command_speed_mps);
  envelope.rpp_current_yaw_deg = optNum(flat.rpp_current_yaw_deg);
  envelope.rpp_path_bearing_deg = optNum(flat.rpp_path_bearing_deg);
  envelope.rpp_guidance_bearing_deg = optNum(flat.rpp_guidance_bearing_deg);
  envelope.rpp_heading_error_deg = optNum(flat.rpp_heading_error_deg);
  envelope.rpp_distance_to_goal_m = optNum(flat.rpp_distance_to_goal_m);
  envelope.rpp_cross_track_error_mm = optNum(flat.rpp_cross_track_error_mm);
  envelope.rpp_cross_track_side = optStr(flat.rpp_cross_track_side);
  envelope.rpp_along_remaining_mm = optNum(flat.rpp_along_remaining_mm);
  envelope.rpp_along_position = optStr(flat.rpp_along_position);

  return envelope;
}

export function toRoverTelemetry(
  raw: Px4TelemetryData,
  now: number = Date.now(),
): RoverTelemetry {
  const flat = flattenRppFields(asRecord(raw) ?? {}) as Px4TelemetryData;
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

  const rppState = firstOptionalNum(flat.rpp_state);
  const rppStateName =
    typeof flat.rpp_state_name === "string" && flat.rpp_state_name.trim()
      ? flat.rpp_state_name
      : undefined;

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
    dist_to_goal_m: safeNum(flat.dist_to_goal_m ?? flat.dist_to_goal),
    xtrack_m: safeNum(flat.xtrack_m),
    ...(rppState !== null ? { rpp_state: rppState } : {}),
    ...(rppStateName ? { rpp_state_name: rppStateName } : {}),
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
    gps?.raw_hrms_m,
  );
  const vrms = firstOptionalNum(
    flat.vrms,
    gps?.raw_vrms_m,
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
 * Absent fields stay undefined so a later partial packet cannot wipe live values.
 */
const rppControlMode =
  typeof flat.rpp_control_mode === "string"
    ? flat.rpp_control_mode
    : undefined;

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
    : undefined;

const rppAlongRemainingMm = firstOptionalNum(
  flat.rpp_along_remaining_mm,
);

const rppAlongPosition =
  typeof flat.rpp_along_position === "string"
    ? flat.rpp_along_position
    : undefined;

const hasRppDebugValues =
  rppControlMode !== undefined ||
  rppGoalNumber !== null ||
  rppActualSpeedMps !== null ||
  rppCommandSpeedMps !== null ||
  rppCurrentYawDeg !== null ||
  rppPathBearingDeg !== null ||
  rppGuidanceBearingDeg !== null ||
  rppHeadingErrorDeg !== null ||
  rppDistanceToGoalM !== null ||
  rppCrossTrackErrorMm !== null ||
  rppCrossTrackSide !== undefined ||
  rppAlongRemainingMm !== null ||
  rppAlongPosition !== undefined;

const hasExplicitRppDebugFlag = !isAbsent(flat.rpp_debug_available);

const rppDebugAvailable = hasRppDebugValues
  ? true
  : hasExplicitRppDebugFlag
    ? safeBool(flat.rpp_debug_available, false)
    : undefined;

const rppDebugFresh = isAbsent(flat.rpp_debug_fresh)
  ? undefined
  : safeBool(flat.rpp_debug_fresh, false);

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
    rpp_state_name: rppStateName,
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
rpp_debug_fresh: rppDebugFresh,
rpp_control_mode: rppControlMode,
rpp_goal_number: rppGoalNumber ?? undefined,

rpp_actual_speed_mps: rppActualSpeedMps ?? undefined,
rpp_command_speed_mps: rppCommandSpeedMps ?? undefined,

rpp_current_yaw_deg: rppCurrentYawDeg ?? undefined,
rpp_path_bearing_deg: rppPathBearingDeg ?? undefined,
rpp_guidance_bearing_deg: rppGuidanceBearingDeg ?? undefined,
rpp_heading_error_deg: rppHeadingErrorDeg ?? undefined,

rpp_distance_to_goal_m: rppDistanceToGoalM ?? undefined,

rpp_cross_track_error_mm: rppCrossTrackErrorMm ?? undefined,
rpp_cross_track_side: rppCrossTrackSide,

rpp_along_remaining_mm: rppAlongRemainingMm ?? undefined,
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

/**
 * Copy adapted rover telemetry into the live envelope used by applyEnvelope.
 * Undefined RPP fields stay undefined so partial packets do not wipe live values.
 */
export function toLiveTelemetryEnvelope(
  adapted: RoverTelemetry,
  timestamp: number,
): TelemetryEnvelope {
  return {
    timestamp,
    state: adapted.state,
    global: adapted.global,
    battery: adapted.battery,
    rtk: adapted.rtk,
    mission: adapted.mission,
    servo: adapted.servo,
    hrms: adapted.hrms,
    vrms: adapted.vrms,
    imu_status: adapted.imu_status,
    distance_to_next_m: adapted.distance_to_next_m,
    xtrack_cm: adapted.xtrack_cm,
    accuracy: adapted.accuracy,
    accuracy_available: adapted.accuracy_available,
    cross_track_error_mm: adapted.cross_track_error_mm,
    cross_track_abs_mm: adapted.cross_track_abs_mm,
    cross_track_side: adapted.cross_track_side,
    front_back_error_mm: adapted.front_back_error_mm,
    front_back_abs_mm: adapted.front_back_abs_mm,
    front_back_position: adapted.front_back_position,
    radial_error_mm: adapted.radial_error_mm,
    closest_radial_error_mm: adapted.closest_radial_error_mm,
    accuracy_target_mm: adapted.accuracy_target_mm,
    test_tolerance_mm: adapted.test_tolerance_mm,
    accuracy_status: adapted.accuracy_status,
    accuracy_pass: adapted.accuracy_pass,
    within_test_tolerance: adapted.within_test_tolerance,
    attitude: adapted.attitude,
    fcu_connected: adapted.fcu_connected,
    gps_fix_name: adapted.gps_fix_name,
    rpp_state_name: adapted.rpp_state_name,
    rpp_debug_available: adapted.rpp_debug_available,
    rpp_debug_fresh: adapted.rpp_debug_fresh,
    rpp_control_mode: adapted.rpp_control_mode,
    rpp_goal_number: adapted.rpp_goal_number,
    rpp_actual_speed_mps: adapted.rpp_actual_speed_mps,
    rpp_command_speed_mps: adapted.rpp_command_speed_mps,
    rpp_current_yaw_deg: adapted.rpp_current_yaw_deg,
    rpp_path_bearing_deg: adapted.rpp_path_bearing_deg,
    rpp_guidance_bearing_deg: adapted.rpp_guidance_bearing_deg,
    rpp_heading_error_deg: adapted.rpp_heading_error_deg,
    rpp_distance_to_goal_m: adapted.rpp_distance_to_goal_m,
    rpp_cross_track_error_mm: adapted.rpp_cross_track_error_mm,
    rpp_cross_track_side: adapted.rpp_cross_track_side,
    rpp_along_remaining_mm: adapted.rpp_along_remaining_mm,
    rpp_along_position: adapted.rpp_along_position,
    measured_speed_m_s: adapted.measured_speed_m_s,
    along_track_speed_mps: adapted.along_track_speed_mps,
    cross_track_speed_mps: adapted.cross_track_speed_mps,
    joystick_state: adapted.joystick_state,
    joystick_active: adapted.joystick_active,
    joystick_last_valid_cmd_age_ms: adapted.joystick_last_valid_cmd_age_ms,
    joystick_stop_reason: adapted.joystick_stop_reason,
    control_owner: adapted.control_owner,
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
  };

  if (typeof status.rpp_state === "number" && Number.isFinite(status.rpp_state)) {
    missionPatch.rpp_state = status.rpp_state;
  }
  if (typeof status.rpp_state_name === "string" && status.rpp_state_name.trim()) {
    missionPatch.rpp_state_name = status.rpp_state_name;
  }

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

  const nextRppStateName =
    missionPatch.rpp_state_name ??
    base.rpp_state_name ??
    (base.mission as { rpp_state_name?: string }).rpp_state_name;

  return {
    ...base,
    mission: { ...base.mission, ...missionPatch },
    mission_state: status.state ?? base.mission_state,
    rpp_state_name: nextRppStateName,
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
