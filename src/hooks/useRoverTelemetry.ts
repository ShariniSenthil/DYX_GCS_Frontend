/**
 * React Native Hook: useRoverTelemetry
 *
 * Handles Socket.IO connection to backend and real-time telemetry streaming
 * Adapted from web app's useRoverROS for React Native
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import type { Socket, ManagerOptions, SocketOptions } from "socket.io-client";
import {
  getBackendURL,
  isOfflineMode,
  SOCKET_CONFIG,
  API_ENDPOINTS,
  SOCKET_EVENTS,
} from "../config";
import {
  RoverTelemetry,
  TelemetryEnvelope,
  TelemetryState,
  TelemetryGlobal,
  TelemetryBattery,
  TelemetryRtk,
  TelemetryMission,
  ServoStatus,
  NetworkData,
  ServiceResponse,
  ConnectionState,
  MissionEventData,
  Waypoint,
} from "../types/telemetry";
import { LoraRTKStatus } from "../types/rtk";
import { AUTH_ENABLED, isPx4DxpEnabled } from "../config/featureFlags";
import {
  isPx4Payload,
  toRoverTelemetry,
  mergeMissionStatus,
} from "../adapters/px4TelemetryAdapter";
import { toNetworkData } from "../adapters/px4NetworkAdapter";
import { rtkStatusToEnvelope } from "../adapters/px4RtkStatusAdapter";
import { toRtkUiState } from "../adapters/px4RtkUiStateAdapter";
import { normalizePx4Mode } from "../adapters/px4ModeAdapter";
import { PX4_SYSTEM, PX4_TELEMETRY, PX4_RTK } from "../config/px4Endpoints";
import type { Px4HealthzResponse } from "../types/px4/telemetry";
import type { RtkStatusResponse } from "../services/rtkService";
import { apiGet, apiPost } from "../services/apiClient";
import {
  clearMission as clearBackendMission,
  getMissionStatus as getBackendMissionStatus,
  nextMissionPoint,
  pauseMission as pauseBackendMission,
  resumeMission as resumeBackendMission,
  skipMissionPoint,
  startMission as startBackendMission,
  stopMission as stopBackendMission,
} from "../services/missionApi";
import { loadSession } from "../services/authStorage";
import {
  isRobotStatusDebugEnabled,
  getRobotStatusDebug,
  patchRobotStatusDebug,
  pickRawRobotFields,
  telemetryDiagLog,
} from "../utils/robotStatusDebug";

/** Mode normalizer — PX4 only (NRP_ROS CMODE table disabled). */
const normalizeRoverMode = (mode: unknown): string => normalizePx4Mode(mode);

// NRP_ROS LEGACY DISABLED — ArduRover CMODE(n) mode translation table.
// const ARDUROVER_MODES: Record<number, string> = {
//   0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD',
//   5: 'LOITER', 6: 'FOLLOW', 7: 'SIMPLE', 8: 'DOCK',
//   9: 'CIRCLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL',
//   15: 'GUIDED', 16: 'INITIALISING',
// };
// const normalizeRoverMode = (mode: unknown): string => { ... };

/** Stub for NRP_ROS legacy service methods — routes disabled during PX4 migration. */
const nrpRosLegacyDisabled = (label: string): Promise<ServiceResponse> =>
  Promise.resolve({
    success: false,
    message: `NRP_ROS legacy disabled (${label}) — use 4WD_SERVER services`,
  });

// Default constants
const THROTTLE_MS = 50; // ~20 Hz - Faster updates for better responsiveness
const MAX_BACKOFF_MS = 8000;
const INITIAL_BACKOFF_MS = 1000;

// Helper to get current backend URL (dynamic)
const getHttpBase = () => getBackendURL().replace(/\/$/, "");

function getTelemetryGeneratedTime(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;

  const candidates = [data.generated_at, data.timestamp, data.created_at];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate < 1_000_000_000_000 ? candidate * 1000 : candidate;
    }

    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

// Verbose telemetry logging — disabled in production, enable locally for debugging.
// These are intentionally kept (not removed) so they can be re-enabled quickly.
const TELEMETRY_LOGS_ENABLED = false; // set true to enable
const telemLog = TELEMETRY_LOGS_ENABLED
  ? (...args: unknown[]) => console.log("[TELEMETRY]", ...args)
  : (..._args: unknown[]) => {
      /* no-op */
    };

// Default values for telemetry
const DEFAULT_STATE: TelemetryState = {
  armed: false,
  mode: "UNKNOWN",
  system_status: "STANDBY",
  heartbeat_ts: 0,
};

const DEFAULT_GLOBAL: TelemetryGlobal = {
  lat: 0,
  lon: 0,
  alt_rel: 0,
  vel: 0,
  satellites_visible: 0,
};

const DEFAULT_BATTERY: TelemetryBattery = {
  voltage: 0,
  current: 0,
  percentage: 0,
};

const DEFAULT_RTK: TelemetryRtk = {
  fix_type: 0,
  baseline_age: 0,
  base_linked: false,
};

const DEFAULT_MISSION: TelemetryMission = {
  total_wp: 0,
  current_wp: 0,
  status: "IDLE",
  progress_pct: 0,
};

const DEFAULT_SERVO: ServoStatus = {
  servo_id: 0,
  active: false,
  last_command_ts: 0,
};

const DEFAULT_NETWORK: NetworkData = {
  connection_type: "none",
  wifi_signal_strength: 0,
  wifi_rssi: -100,
  interface: "",
  wifi_connected: false,
  lora_connected: false,
};

const createDefaultTelemetry = (): RoverTelemetry => ({
  state: { ...DEFAULT_STATE },
  global: { ...DEFAULT_GLOBAL },
  battery: { ...DEFAULT_BATTERY },
  rtk: { ...DEFAULT_RTK },
  mission: { ...DEFAULT_MISSION },
  servo: { ...DEFAULT_SERVO },
  network: { ...DEFAULT_NETWORK },
  hrms: 0,
  vrms: 0,
  imu_status: "UNKNOWN",
  lastMessageTs: null,
  // New fields from Pixhawk NTUN
  wp_dist_cm: undefined,
  xtrack_cm: undefined,
  wp_brg: undefined,
  position_error_cm: undefined, // Total position error = sqrt(wp_dist² + xtrack²)
  distance_to_next_m: undefined, // Backend mission distance to next waypoint in meters
});

// Helper: POST to PX4 service endpoint through authenticated apiClient.
async function postService(
  path: string,
  body?: Record<string, unknown>
): Promise<ServiceResponse> {
  return apiPost<ServiceResponse>(path, body);
}

// Helper: GET from PX4 service endpoint through authenticated apiClient.
async function getService<T extends ServiceResponse = ServiceResponse>(
  path: string
): Promise<T> {
  return apiGet<T>(path);
}

// Map RTK status to fix type number
const mapRtkStatusToFixType = (status?: string | null): number => {
  const normalized = (status ?? "").toUpperCase();
  switch (normalized) {
    case "NO GPS":
    case "NOGPS":
    case "NO_SIGNAL":
      return 0;
    case "NO FIX":
    case "NOFIX":
      return 1;
    case "2D FIX":
    case "2D":
      return 2;
    case "3D FIX":
    case "3D":
    case "GPS FIX":
    case "GPS":
      return 3;
    case "DGPS":
      return 4;
    case "RTK FLOAT":
    case "FLOAT":
      return 5;
    case "RTK FIXED":
    case "FIX":
      return 6;
    default:
      return 0;
  }
};

// Convert rover data to telemetry envelope
const toTelemetryEnvelopeFromRoverData = (
  data: any
): TelemetryEnvelope | null => {
  if (!data || typeof data !== "object") {
    // console.log('[ROVER_DATA] ❌ Invalid data received:', data);
    return null;
  }

  // console.log('[ROVER_DATA] 🔍 Raw data received:', JSON.stringify(data, null, 2));

  const envelope: Partial<TelemetryEnvelope> = {
    timestamp: Date.now(),
  };
  let touched = false;

  // State
  if (data.mode || data.status || data.last_heartbeat != null) {
    const status = typeof data.status === "string" ? data.status : "UNKNOWN";
    // Translate MAVROS fallback "CMODEn" → named ArduRover mode string
    envelope.state = {
      armed: String(status).toLowerCase() === "armed",
      mode: normalizeRoverMode(data.mode),
      // Don't set system_status from rover_data status field - it should come from pixhawk_state
      // system_status represents MAVLink system status (STANDBY, ACTIVE, etc.), not armed state
      heartbeat_ts:
        typeof data.last_heartbeat === "number"
          ? Math.floor(data.last_heartbeat * 1000)
          : Date.now(),
    };
    touched = true;
  }

  // Global position
  if (data.position && typeof data.position === "object") {
    let { lat, lng } = data.position as {
      lat?: number | string;
      lng?: number | string;
    };
    const latNum = typeof lat === "string" ? parseFloat(lat) : lat;
    const lngNum = typeof lng === "string" ? parseFloat(lng) : lng;
    const hasValidLat =
      typeof latNum === "number" && isFinite(latNum) && latNum !== 0;
    const hasValidLng =
      typeof lngNum === "number" && isFinite(lngNum) && lngNum !== 0;

    if (hasValidLat && hasValidLng) {
      let velCandidate: number | undefined;
      if (typeof data.vel === "number") velCandidate = data.vel;
      else if (typeof data.velocity === "number") velCandidate = data.velocity;
      else if (typeof data.speed === "number") velCandidate = data.speed;
      else if (typeof data.groundspeed === "number")
        velCandidate = data.groundspeed;

      // Extract satellites from multiple possible field names - only update if data exists
      let satelliteCount: number | undefined;

      if (typeof data.satellites_visible === "number")
        satelliteCount = data.satellites_visible;
      else if (typeof data.satellites === "number")
        satelliteCount = data.satellites;
      else if (typeof data.numSatellites === "number")
        satelliteCount = data.numSatellites;
      else if (typeof data.gps_satellites === "number")
        satelliteCount = data.gps_satellites;
      else if (typeof data.num_satellites === "number")
        satelliteCount = data.num_satellites;
      else if (typeof data.sats === "number") satelliteCount = data.sats;

      // Extract altitude from multiple possible field names
      let altCandidate: number | undefined;
      if (typeof data.position.alt === "number")
        altCandidate = data.position.alt;
      else if (typeof data.position.altitude === "number")
        altCandidate = data.position.altitude;
      else if (typeof data.position.alt_rel === "number")
        altCandidate = data.position.alt_rel;
      else if (typeof data.position.relative_alt === "number")
        altCandidate = data.position.relative_alt;

      envelope.global = {
        lat: latNum,
        lon: lngNum,
        alt_rel:
          typeof altCandidate === "number" && isFinite(altCandidate)
            ? altCandidate
            : 0,
        vel:
          typeof velCandidate === "number" && isFinite(velCandidate)
            ? velCandidate
            : 0,
        ...(satelliteCount !== undefined && {
          satellites_visible: satelliteCount,
        }),
      };
      touched = true;
    }
  }

  // groundspeed as a top-level flat field (no position object) — backend CurrentState sends
  // groundspeed directly. Update vel on existing envelope.global so Step3 canProceed gate works.
  if (typeof data.groundspeed === "number" && isFinite(data.groundspeed)) {
    if (!envelope.global) {
      envelope.global = { ...DEFAULT_GLOBAL };
    }
    envelope.global.vel = data.groundspeed;
    touched = true;
  }

  // Battery
  // console.log('[ROVER_DATA] 🔋 Battery fields check:', {
  //   battery: data.battery,
  //   voltage: data.voltage,
  //   current: data.current,
  //   battery_percentage: data.battery_percentage,
  //   // Backend might send nested battery data
  //   battery_data: data.battery_data,
  //   pct: data.pct,  // Backend sends 'pct' for percentage
  //   volt: data.volt  // Backend sends 'volt' for voltage
  // });

  // Handle multiple battery data formats
  let batteryPercentage = 0;
  let batteryVoltage = 0;
  let batteryCurrent = 0;

  if (typeof data.battery === "number") batteryPercentage = data.battery;
  else if (typeof data.pct === "number")
    batteryPercentage = data.pct; // Backend sends 'pct'
  else if (typeof data.battery_percentage === "number")
    batteryPercentage = data.battery_percentage;

  if (typeof data.voltage === "number") batteryVoltage = data.voltage;
  else if (typeof data.volt === "number") batteryVoltage = data.volt; // Backend might send 'volt'

  if (typeof data.current === "number") batteryCurrent = data.current;

  if (batteryPercentage > 0 || batteryVoltage > 0 || batteryCurrent !== 0) {
    envelope.battery = {
      percentage: batteryPercentage,
      voltage: batteryVoltage,
      current: batteryCurrent,
    };
    // console.log('[ROVER_DATA] ✅ Battery parsed:', envelope.battery);
    touched = true;
  } else {
    // console.log('[ROVER_DATA] ❌ No battery data found');
  }

  // HRMS / VRMS / IMU
  if (data.hrms != null) {
    envelope.hrms =
      typeof data.hrms === "number" ? data.hrms : parseFloat(data.hrms) || 0;
    touched = true;
  }
  if (data.vrms != null) {
    envelope.vrms =
      typeof data.vrms === "number" ? data.vrms : parseFloat(data.vrms) || 0;
    touched = true;
  }
  if (data.imu_status != null || data.imuStatus != null) {
    const s = data.imu_status ?? data.imuStatus;
    envelope.imu_status = typeof s === "string" ? s : String(s);
    touched = true;
  }

  // RTK
  // console.log('[ROVER_DATA] 📡 RTK fields check:', {
  //   rtk_status: data.rtk_status,
  //   fix_type: data.fix_type,
  //   rtk_fix_type: data.rtk_fix_type,
  //   gps_fix_type: data.gps_fix_type
  // });

  if (data.rtk_status || data.fix_type != null || data.rtk_fix_type != null) {
    let fixType = 0;
    if (typeof data.rtk_fix_type === "number") {
      fixType = data.rtk_fix_type;
    } else if (typeof data.fix_type === "number") {
      fixType = data.fix_type;
    } else if (typeof data.gps_fix_type === "number") {
      fixType = data.gps_fix_type;
    } else if (data.rtk_status) {
      fixType = mapRtkStatusToFixType(data.rtk_status);
    }

    envelope.rtk = {
      fix_type: fixType,
      baseline_age:
        typeof data.rtk_baseline_age === "number"
          ? data.rtk_baseline_age
          : typeof data.baseline_age === "number"
          ? data.baseline_age
          : 0,
      base_linked:
        typeof data.rtk_base_linked === "boolean"
          ? data.rtk_base_linked
          : typeof data.base_linked === "boolean"
          ? data.base_linked
          : fixType >= 5,
    };
    // console.log('[ROVER_DATA] ✅ RTK parsed:', envelope.rtk);
    touched = true;
  } else {
    // console.log('[ROVER_DATA] ❌ No RTK data found');
  }

  // Mission
  const activeIndex =
    typeof data.activeWaypointIndex === "number" &&
    data.activeWaypointIndex >= 0
      ? data.activeWaypointIndex
      : null;
  const completedCount = Array.isArray(data.completedWaypointIds)
    ? data.completedWaypointIds.length
    : 0;
  const currentWp = activeIndex != null ? activeIndex + 1 : 0;
  const inferredTotal = Math.max(
    currentWp,
    completedCount,
    typeof data.current_waypoint_id === "number" ? data.current_waypoint_id : 0
  );

  if (activeIndex != null || completedCount > 0) {
    const total = inferredTotal || (currentWp > 0 ? currentWp : completedCount);
    const progress = total > 0 ? (currentWp / total) * 100 : 0;
    envelope.mission = {
      total_wp: total,
      current_wp: currentWp,
      // Do NOT set status here — it must come from mission_status events only.
      // Setting 'ACTIVE'/'IDLE' based on waypoint count was overwriting the real
      // backend mission state ('running', 'paused', etc.) on every telemetry tick.
      progress_pct: progress,
    };
    touched = true;
  }

  // Servo output
  if (data.servo_output && typeof data.servo_output === "object") {
    const servoOutput = data.servo_output;
    const servoPwmValues: Partial<ServoStatus> = {
      servo_id: 0,
      active: false,
      last_command_ts: 0,
    };

    if (Array.isArray(servoOutput.channels)) {
      servoPwmValues.pwm_values = servoOutput.channels;
      for (let i = 1; i <= 16; i++) {
        const key = `servo${i}_pwm` as keyof ServoStatus;
        if (servoOutput[key] !== undefined) {
          (servoPwmValues as any)[key] = servoOutput[key];
        }
      }
    }

    envelope.servo = servoPwmValues as ServoStatus;
    touched = true;
  }

  // Network
  if (data.network && typeof data.network === "object") {
    const network = data.network;
    envelope.network = {
      connection_type: network.connection_type || "none",
      wifi_signal_strength:
        typeof network.wifi_signal_strength === "number"
          ? network.wifi_signal_strength
          : 0,
      wifi_rssi:
        typeof network.wifi_rssi === "number" ? network.wifi_rssi : -100,
      interface: network.interface || "",
      wifi_connected: Boolean(network.wifi_connected),
      lora_connected: Boolean(network.lora_connected),
    };
    touched = true;
  }

  // Heading
  if (typeof data.heading === "number" && isFinite(data.heading)) {
    const yaw = ((data.heading % 360) + 360) % 360;
    (envelope as any).attitude = { yaw_deg: yaw };
    touched = true;
  }

  return touched ? (envelope as TelemetryEnvelope) : null;
};

// Convert bridge telemetry to envelope
const toTelemetryEnvelopeFromBridge = (data: any): TelemetryEnvelope | null => {
  if (!data || typeof data !== "object") {
    // console.log('[BRIDGE_DATA] ❌ Invalid data received:', data);
    return null;
  }

  // console.log('[BRIDGE_DATA] 🔍 Raw data received:', JSON.stringify(data, null, 2));

  const envelope: Partial<TelemetryEnvelope> = {
    timestamp: Date.now(),
  };
  let touched = false;

  // Handle mission_status events (this is where the actual GPS data is!)
  if (data.current_position || data.pixhawk_state) {
    // console.log('[BRIDGE_DATA] 🎯 Found mission_status with GPS data!');

    // Position data — do NOT include vel here; this source has no velocity info.
    // Omitting vel lets applyEnvelope preserve the real velocity from rover_data.
    if (data.current_position && typeof data.current_position === "object") {
      envelope.global = {
        lat:
          typeof data.current_position.lat === "number"
            ? data.current_position.lat
            : 0,
        lon:
          typeof data.current_position.lng === "number"
            ? data.current_position.lng
            : 0,
        alt_rel:
          typeof data.current_position.alt === "number"
            ? data.current_position.alt
            : 0,
        // ✅ FIX: Do NOT default satellites_visible to 0; omit it so applyEnvelope preserves the existing count
      } as any;
      // console.log('[BRIDGE_DATA] ✅ Position parsed from mission_status:', envelope.global);
      touched = true;
    }

    // Update satellites count if we have satellite data and position already exists
    if (typeof data.satellites === "number" && envelope.global) {
      envelope.global.satellites_visible = data.satellites;
      touched = true;
    }

    // Pixhawk state data
    if (data.pixhawk_state && typeof data.pixhawk_state === "object") {
      envelope.state = {
        armed: Boolean(data.pixhawk_state.armed),
        mode: normalizeRoverMode(data.pixhawk_state.mode),
        system_status:
          typeof data.pixhawk_state.system_status === "string"
            ? data.pixhawk_state.system_status.toUpperCase()
            : "UNKNOWN",
        heartbeat_ts: Date.now(),
      };
      touched = true;
    }

    // 🔍 DEBUG: Check if mission_status has battery or satellite data
    // console.log('[BRIDGE_DATA] 🔍 Checking for battery/satellite data in mission_status:', {
    //   battery: data.battery,
    //   voltage: data.voltage,
    //   current: data.current,
    //   satellites: data.satellites,
    //   sats: data.sats,
    //   fix_type: data.fix_type,
    //   rtk_fix_type: data.rtk_fix_type
    // });

    // 🔧 TEMPORARY FIX: Add dynamic mock battery/satellite data for testing
    // This should be removed when rover_data events start working
    // TEMPORARILY DISABLED TO TEST REAL rover_data EVENTS
    if (false && !data.battery && !data.voltage && !data.satellites) {
      // console.log('[BRIDGE_DATA] 🔧 Adding dynamic mock battery/satellite data for testing');

      // Generate dynamic values that change over time
      const now = Date.now();
      const batteryPercentage = 75 + Math.sin(now / 10000) * 15; // 60-90%
      const voltage = 12.0 + batteryPercentage / 100; // 12.0-12.9V
      const current = 1.5 + Math.sin(now / 8000) * 0.8; // 0.7-2.3A
      const satellites = Math.floor(6 + Math.abs(Math.sin(now / 5000)) * 6); // 6-12 satellites
      const fixType = Math.floor(Math.abs(Math.sin(now / 12000)) * 4) + 2; // 2-6 (2D fix to RTK fixed)

      // Ensure envelope.global exists before accessing it
      if (!envelope.global) {
        envelope.global = { ...DEFAULT_GLOBAL };
      }

      envelope.battery = {
        voltage: parseFloat(voltage.toFixed(1)),
        current: parseFloat(current.toFixed(1)),
        percentage: Math.floor(batteryPercentage),
      };
      envelope.global!.satellites_visible = satellites;
      envelope.rtk = {
        fix_type: fixType,
        baseline_age: 0,
        base_linked: fixType >= 5,
      };
      touched = true;

      // console.log('[BRIDGE_DATA] 🔄 Dynamic mock data applied:', {
      //   battery: envelope.battery,
      //   satellites: envelope.global.satellites_visible,
      //   rtk: envelope.rtk
      // });
    }
  }

  // Bridge position data — do NOT include vel; this source has no velocity info.
  // Omitting vel lets applyEnvelope preserve the real velocity from rover_data.
  if (data.position && typeof data.position === "object") {
    envelope.global = {
      lat:
        typeof data.position.latitude === "number" ? data.position.latitude : 0,
      lon:
        typeof data.position.longitude === "number"
          ? data.position.longitude
          : 0,
      alt_rel:
        typeof data.position.altitude === "number" ? data.position.altitude : 0,
      // ✅ FIX: Do NOT default satellites_visible to 0; omit it so applyEnvelope preserves the existing count
    } as any;
    touched = true;
  }

  if (data.global && typeof data.global === "object") {
    // ✅ FIX: Only include satellites_visible when satellite data actually exists in the message
    let satelliteCount: number | undefined;
    if (typeof data.global.satellites_visible === "number")
      satelliteCount = data.global.satellites_visible;
    else if (typeof data.global.satellites === "number")
      satelliteCount = data.global.satellites;
    else if (typeof data.global.numSatellites === "number")
      satelliteCount = data.global.numSatellites;

    envelope.global = {
      lat:
        typeof data.global.latitude === "number"
          ? data.global.latitude
          : envelope.global?.lat ?? 0,
      lon:
        typeof data.global.longitude === "number"
          ? data.global.longitude
          : envelope.global?.lon ?? 0,
      alt_rel:
        typeof data.global.altitude === "number"
          ? data.global.altitude
          : envelope.global?.alt_rel ?? 0,
      vel:
        typeof data.global.vel === "number"
          ? data.global.vel
          : envelope.global?.vel ?? 0,
      ...(satelliteCount !== undefined && {
        satellites_visible: satelliteCount,
      }),
    };
    touched = true;
  }

  if (data.rtk && typeof data.rtk === "object") {
    envelope.rtk = {
      fix_type: typeof data.rtk.fix_type === "number" ? data.rtk.fix_type : 0,
      baseline_age:
        typeof data.rtk.baseline_age === "number" ? data.rtk.baseline_age : 0,
      base_linked: Boolean(data.rtk.base_linked),
    };
    touched = true;
  }

  if (data.battery && typeof data.battery === "object") {
    envelope.battery = {
      voltage:
        typeof data.battery.voltage === "number" ? data.battery.voltage : 0,
      current:
        typeof data.battery.current === "number" ? data.battery.current : 0,
      percentage:
        typeof data.battery.percentage === "number"
          ? data.battery.percentage
          : 0,
    };
    touched = true;
  }

  if (typeof data.hrms === "number" || typeof data.hrms === "string") {
    envelope.hrms =
      typeof data.hrms === "number" ? data.hrms : parseFloat(data.hrms) || 0;
    touched = true;
  }
  if (typeof data.vrms === "number" || typeof data.vrms === "string") {
    envelope.vrms =
      typeof data.vrms === "number" ? data.vrms : parseFloat(data.vrms) || 0;
    touched = true;
  }
  if (data.imu_status || data.imuStatus) {
    envelope.imu_status = data.imu_status ?? data.imuStatus;
    touched = true;
  }

  // New fields from Pixhawk NTUN (CurrentState) - top level telemetry
  // DEBUG: Log distance-to-next from telemetry
  if (
    data.wp_dist_cm !== undefined ||
    data.distance_to_next !== undefined ||
    data.dist_to_wp !== undefined
  ) {
    console.log("[TELEMETRY] 📏 Distance to next WP raw:", {
      wp_dist_cm: data.wp_dist_cm,
      distance_to_next: data.distance_to_next,
      dist_to_wp: data.dist_to_wp,
    });
  }
  if (typeof data.wp_dist_cm === "number") {
    envelope.wp_dist_cm = data.wp_dist_cm;
    touched = true;
  }
  if (typeof data.xtrack_cm === "number") {
    envelope.xtrack_cm = data.xtrack_cm;
    touched = true;
  }
  if (typeof data.wp_brg === "number") {
    envelope.wp_brg = data.wp_brg;
    touched = true;
  }
  if (typeof data.position_error_cm === "number") {
    envelope.position_error_cm = data.position_error_cm;
    touched = true;
  }

  if (data.mission && typeof data.mission === "object") {
    envelope.mission = {
      total_wp:
        typeof data.mission.total_wp === "number" ? data.mission.total_wp : 0,
      current_wp:
        typeof data.mission.current_wp === "number"
          ? data.mission.current_wp
          : 0,
      // CRITICAL: Only set status when explicitly provided — defaulting to 'IDLE'
      // was overwriting the correct 'running' status set by mission_status events
      ...(typeof data.mission.status === "string"
        ? { status: data.mission.status }
        : {}),
      progress_pct:
        typeof data.mission.progress_pct === "number"
          ? data.mission.progress_pct
          : 0,
    };
    touched = true;
  }

  // GPS Failsafe data parsing - handle both nested object and flat fields
  if (data.gps_failsafe && typeof data.gps_failsafe === "object") {
    // Nested object format with new fields: wp_dist_cm, xtrack_cm, wp_brg, etc.
    (envelope as any).gps_failsafe = {
      mode: data.gps_failsafe.mode || "disable",
      triggered: Boolean(data.gps_failsafe.triggered),
      reason: data.gps_failsafe.reason,
      fix_type:
        typeof data.gps_failsafe.fix_type === "number"
          ? data.gps_failsafe.fix_type
          : undefined,
      wp_dist_cm:
        typeof data.gps_failsafe.wp_dist_cm === "number"
          ? data.gps_failsafe.wp_dist_cm
          : 0,
      xtrack_cm:
        typeof data.gps_failsafe.xtrack_cm === "number"
          ? data.gps_failsafe.xtrack_cm
          : undefined,
      wp_brg:
        typeof data.gps_failsafe.wp_brg === "number"
          ? data.gps_failsafe.wp_brg
          : undefined,
      requires_ack: Boolean(data.gps_failsafe.requires_ack),
      servo_suppressed: Boolean(data.gps_failsafe.servo_suppressed),
      action: data.gps_failsafe.action,
      timestamp: data.gps_failsafe.timestamp,
    };
    touched = true;
    // console.log('[useRoverTelemetry] 🛡️ GPS Failsafe data parsed (nested):', (envelope as any).gps_failsafe);
  } else if (
    data.gps_failsafe_mode !== undefined ||
    data.wp_dist_cm !== undefined
  ) {
    // Flat fields format with new fields
    (envelope as any).gps_failsafe = {
      mode: data.gps_failsafe_mode || "disable",
      triggered: Boolean(data.gps_failsafe_triggered),
      reason: data.gps_failsafe_reason,
      fix_type: typeof data.fix_type === "number" ? data.fix_type : undefined,
      wp_dist_cm: typeof data.wp_dist_cm === "number" ? data.wp_dist_cm : 0,
      xtrack_cm:
        typeof data.xtrack_cm === "number" ? data.xtrack_cm : undefined,
      wp_brg: typeof data.wp_brg === "number" ? data.wp_brg : undefined,
      requires_ack: Boolean(data.gps_failsafe_requires_ack),
      servo_suppressed: Boolean(data.gps_failsafe_servo_suppressed),
      action: data.gps_failsafe_action,
      timestamp: data.gps_failsafe_timestamp,
    };
    touched = true;
    // console.log('[useRoverTelemetry] 🛡️ GPS Failsafe data parsed (flat fields):', (envelope as any).gps_failsafe);
  }

  return touched ? (envelope as TelemetryEnvelope) : null;
};

interface MutableTelemetry {
  telemetry: RoverTelemetry;
  lastEnvelopeTs: number | null;
  // Timestamp until which incoming armed=false from telemetry is ignored.
  // Set after a successful ARM command to absorb the MAVROS race window.
  armedLockUntil: number | null;
}

export interface RoverServices {
  armVehicle: () => Promise<ServiceResponse>;
  disarmVehicle: () => Promise<ServiceResponse>;
  setMode: (mode: string) => Promise<ServiceResponse>;
  uploadMission: (waypoints: Waypoint[]) => Promise<ServiceResponse>;
  loadMissionToController: (
    waypoints: Waypoint[],
    servoConfig?: any
  ) => Promise<ServiceResponse>;
  downloadMission: () => Promise<ServiceResponse & { waypoints?: Waypoint[] }>;
  clearMission: () => Promise<ServiceResponse>;
  setCurrentWaypoint: (wpSeq: number) => Promise<ServiceResponse>;
  pauseMission: () => Promise<ServiceResponse>;
  resumeMission: () => Promise<ServiceResponse>;
  startMission: () => Promise<ServiceResponse>;
  stopMission: () => Promise<ServiceResponse>;
  restartMission: () => Promise<ServiceResponse>;
  nextMission: () => Promise<ServiceResponse>;
  skipMission: () => Promise<ServiceResponse>;
  bulkSkipRange: (skipFrom: number, skipTo: number) => Promise<ServiceResponse>;
  getMissionStatus: () => Promise<ServiceResponse>;
  resumeFailsafeMission: () => Promise<ServiceResponse>;
  restartFailsafeMission: () => Promise<ServiceResponse>;
  requestMissionLogs: () => Promise<ServiceResponse>;
  updateMissionParameters: (params: {
    mission_timeout?: number;
    accuracy_threshold_mm?: number;
    fallback_zone_timeout_seconds?: number;
  }) => Promise<ServiceResponse>;
  updateObstacleZones: (zones: {
    warning_min_mm?: number;
    warning_max_mm?: number;
    danger_min_mm?: number;
    danger_max_mm?: number;
  }) => Promise<ServiceResponse>;
  setObstacleDetection: (enabled: boolean) => Promise<ServiceResponse>;

  // Emergency & Manual Control
  emergencyStop: () => Promise<ServiceResponse>;
  sendManualControl: (command: any) => Promise<ServiceResponse>;
  stopManualControl: () => Promise<ServiceResponse>;

  // Activity & Logging
  getActivityLogs: () => Promise<ServiceResponse>;
  getActivityTypes: () => Promise<ServiceResponse>;
  downloadActivityLogs: () => Promise<ServiceResponse>;

  // System Status
  getNodes: () => Promise<ServiceResponse>;
  getNodeDetails: (nodeName: string) => Promise<ServiceResponse>;
  getServoStatus: () => Promise<ServiceResponse>;

  // Legacy RTK methods (deprecated)
  injectRTK: (ntripUrl: string) => Promise<ServiceResponse>;
  stopRTK: () => Promise<ServiceResponse>;

  // New RTK methods per documentation
  startNTRIPStream: (
    params: import("../types/rtk").NTRIPStartParams
  ) => Promise<import("../types/rtk").NTRIPStartResponse>;
  stopNTRIPStream: () => Promise<import("../types/rtk").NTRIPStopResponse>;
  startLoRaStream: () => Promise<import("../types/rtk").LoRaStartResponse>;
  stopLoRaStream: () => Promise<import("../types/rtk").LoRaStopResponse>;
  stopAllRTKStreams: () => Promise<import("../types/rtk").RTKStopAllResponse>;
  getRTKStatus: () => Promise<import("../types/rtk").RTKStatusResponse>;

  // Legacy LoRa Socket.IO methods (keeping for compatibility)
  startLoraRTKStream: () => Promise<ServiceResponse>;
  stopLoraRTKStream: () => Promise<ServiceResponse>;
  getLoraRTKStatus: () => Promise<ServiceResponse>;
  onLoraRTKStatus: (cb: (status: LoraRTKStatus) => void) => () => void;
  onUploadProgress: (
    cb: (progress: { percent: number; message?: string }) => void
  ) => () => void;
  onDownloadProgress: (
    cb: (progress: { percent: number; message?: string }) => void
  ) => () => void;
  controlServo: (servoId: number, angle: number) => Promise<ServiceResponse>;
  getTTSStatus: () => Promise<
    ServiceResponse & { enabled?: boolean; engine?: string; language?: string }
  >;
  controlTTS: (
    enabled: boolean
  ) => Promise<ServiceResponse & { enabled?: boolean }>;
  testTTS: (message?: string) => Promise<ServiceResponse>;
  setTTSLanguage: (language: string) => Promise<ServiceResponse>;
  getTTSGender: () => Promise<ServiceResponse & { gender?: string }>;
  setTTSGender: (gender: "male" | "female") => Promise<ServiceResponse>;
  getMissionServoConfig: () => Promise<
    ServiceResponse & {
      servo_channel?: number;
      servo_pwm_on?: number;
      servo_pwm_off?: number;
      servo_delay_before?: number;
      servo_spray_duration?: number;
      servo_delay_after?: number;
      servo_enabled?: boolean;
    }
  >;
  updateMissionServoConfig: (config: any) => Promise<ServiceResponse>;
  testMissionServoConfig: (
    config: any
  ) => Promise<ServiceResponse & { status?: string }>;

  // LED Controller
  setLEDController: (enabled: boolean) => Promise<ServiceResponse>;
  getLEDControllerStatus: () => Promise<
    ServiceResponse & {
      enabled?: boolean;
      state?: string;
      hardware_available?: boolean;
    }
  >;

  // MAVLink Param Control (Task 01)
  getParams: (
    group?: string
  ) => Promise<import("../types/params").ParamListResponse>;
  getParam: (
    name: string
  ) => Promise<import("../types/params").ParamGetResponse>;
  setParam: (
    name: string,
    value: number
  ) => Promise<import("../types/params").ParamSetResponse>;
  getParamGroups: () => Promise<import("../types/params").ParamGroupsResponse>;
  downloadParams: () => Promise<
    import("../types/params").ParamDownloadResponse
  >;
  uploadParams: (
    content: string,
    dryRun: boolean
  ) => Promise<import("../types/params").ParamUploadResponse>;
}

export interface UseRoverTelemetryResult {
  telemetry: RoverTelemetry;

  /**
   * True only after a new telemetry packet has arrived through Socket.IO
   * after the current connection was established.
   */
  hasLiveTelemetry: boolean;

  roverPosition: {
    lat: number;
    lng: number;
    timestamp: number;
  } | null;

  connectionState: ConnectionState;
  reconnect: () => void;
  services: RoverServices;
  onMissionEvent: (callback: (event: MissionEventData) => void) => () => void;

  socket: Socket | null;
}

/**
 * Main Hook: useRoverTelemetry
 *
 * Manages Socket.IO connection and telemetry updates
 */
export function useRoverTelemetry(): UseRoverTelemetryResult {
  const [telemetrySnapshot, setTelemetrySnapshot] = useState<RoverTelemetry>(
    createDefaultTelemetry
  );
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  const [hasLiveTelemetry, setHasLiveTelemetry] = useState(false);

  /**
   * Client time when the current Socket.IO connection was established.
   */
  const socketConnectedAtRef = useRef<number | null>(null);

  /**
   * Prevent any packet belonging to an older socket connection from updating UI.
   */
  const socketGenerationRef = useRef(0);

  const hasLiveTelemetryRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const manualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const connectDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missionEventCallbackRef = useRef<((event: MissionEventData) => void)[]>(
    []
  );
  const loraStatusCallbackRef = useRef<((status: LoraRTKStatus) => void)[]>([]);
  const uploadProgressCallbackRef = useRef<
    ((progress: { percent: number; message?: string }) => void)[]
  >([]);
  const downloadProgressCallbackRef = useRef<
    ((progress: { percent: number; message?: string }) => void)[]
  >([]);
  const mutableRef = useRef<MutableTelemetry>({
    telemetry: createDefaultTelemetry(),
    lastEnvelopeTs: null,
    armedLockUntil: null,
  });
  const lastDispatchRef = useRef<number>(0);
  const lastMissionStatusRef = useRef<string>("");
  const pendingDispatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missionStatusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const gpsFixTypeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastStableFixTypeRef = useRef<number>(0);
  const connectSocketRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);

  const clearVisibleTelemetry = useCallback((): void => {
    const emptyTelemetry = createDefaultTelemetry();

    mutableRef.current.telemetry = emptyTelemetry;

    mutableRef.current.lastEnvelopeTs = null;

    socketConnectedAtRef.current = null;

    hasLiveTelemetryRef.current = false;

    setTelemetrySnapshot(emptyTelemetry);

    setHasLiveTelemetry(false);
  }, []);

  const resetTelemetry = useCallback((): void => {
    clearVisibleTelemetry();

    if (!isOfflineMode()) {
      console.log("[useRoverTelemetry] Live telemetry cleared");
    }
  }, [clearVisibleTelemetry]);

  // Apply telemetry envelope
  const applyEnvelope = useCallback((envelope: TelemetryEnvelope) => {
    if (!mountedRef.current) return;

    const mutable = mutableRef.current;
    const next = { ...mutable.telemetry };

    if (envelope.state) {
      const incomingState = envelope.state;
      // Guard: if we're inside the ARM lock window, ignore armed=false from
      // incoming telemetry. The backend confirmed MAVROS heartbeats can write
      // status='disarmed' for up to 2s while the FC physically arms.
      // We preserve the current armed=true in mutableRef so the pending
      // dispatch timeout also reads the correct value.
      const lock = mutableRef.current.armedLockUntil;
      const isLocked = lock !== null && Date.now() < lock;
      if (isLocked && incomingState.armed === false) {
        // Merge everything except armed — keep the current armed value
        next.state = {
          ...next.state,
          ...incomingState,
          armed: mutableRef.current.telemetry.state.armed,
        };
      } else {
        // Lock expired or not locked — clear it and apply normally
        if (lock !== null && Date.now() >= lock) {
          mutableRef.current.armedLockUntil = null;
        }
        next.state = { ...next.state, ...incomingState };
      }
    }
    if (envelope.global) {
      // Only update satellites if data is present in this message
      if (envelope.global.satellites_visible !== undefined) {
        next.global = { ...next.global, ...envelope.global };
      } else {
        // Preserve existing satellite count when no satellite data in message
        const { satellites_visible, ...globalWithoutSats } = envelope.global;
        next.global = { ...next.global, ...globalWithoutSats };
      }
    }
    if (envelope.battery) {
      next.battery = { ...next.battery, ...envelope.battery };
    }
    if (envelope.rtk) {
      // ✅ TEMPORARILY DISABLED DEBOUNCING: For debugging, update immediately
      const newFixType = envelope.rtk.fix_type;
      // console.log('[TELEMETRY] 📡 Processing RTK fix_type update:', newFixType);

      // Update immediately for debugging
      next.rtk = { ...next.rtk, ...envelope.rtk };
      // console.log('[TELEMETRY] ✅ RTK fix_type updated immediately:', next.rtk.fix_type);
    }
    if (envelope.mission) {
      next.mission = { ...next.mission, ...envelope.mission };
    }
    if (envelope.servo) {
      next.servo = { ...next.servo, ...envelope.servo };
    }
    if (envelope.network) {
      next.network = { ...next.network, ...envelope.network };
    }
    if ((envelope as any).hrms !== undefined) {
      (next as any).hrms = (envelope as any).hrms;
    }
    if ((envelope as any).vrms !== undefined) {
      (next as any).vrms = (envelope as any).vrms;
    }
    if ((envelope as any).imu_status !== undefined) {
      (next as any).imu_status = (envelope as any).imu_status;
    }
    if ((envelope as any).attitude) {
      next.attitude = {
        ...(next.attitude || {}),
        ...(envelope as any).attitude,
      } as any;
    }
    // New fields from Pixhawk NTUN (CurrentState)
    if (envelope.wp_dist_cm !== undefined) {
      next.wp_dist_cm = envelope.wp_dist_cm;
    }
    if (envelope.xtrack_cm !== undefined) {
      next.xtrack_cm = envelope.xtrack_cm;
    }
    if (envelope.wp_brg !== undefined) {
      next.wp_brg = envelope.wp_brg;
    }
    if (envelope.position_error_cm !== undefined) {
      next.position_error_cm = envelope.position_error_cm;
    }
    if (envelope.distance_to_next_m !== undefined) {
      next.distance_to_next_m = envelope.distance_to_next_m;
    }
    if (envelope.fcu_connected !== undefined) {
      next.fcu_connected = envelope.fcu_connected;
    }
    if (envelope.gps_fix_name !== undefined) {
      next.gps_fix_name = envelope.gps_fix_name;
    }
    if (envelope.mission_state !== undefined) {
      next.mission_state = envelope.mission_state;
    }
    if (envelope.rpp_state_name !== undefined) {
      next.rpp_state_name = envelope.rpp_state_name;
    }
    if (envelope.rtk_stream_active !== undefined) {
      next.rtk_stream_active = envelope.rtk_stream_active;
    }
    if (envelope.rtk_ui_state !== undefined) {
      next.rtk_ui_state = envelope.rtk_ui_state;
    }
    if (envelope.measured_speed_m_s !== undefined) {
      next.measured_speed_m_s = envelope.measured_speed_m_s;
    }
    if (envelope.along_track_speed_mps !== undefined) {
      next.along_track_speed_mps = envelope.along_track_speed_mps;
    }
    if (envelope.cross_track_speed_mps !== undefined) {
      next.cross_track_speed_mps = envelope.cross_track_speed_mps;
    }
    if (envelope.joystick_state !== undefined) {
      next.joystick_state = envelope.joystick_state;
    }
    if (envelope.joystick_active !== undefined) {
      next.joystick_active = envelope.joystick_active;
    }
    if (envelope.joystick_last_valid_cmd_age_ms !== undefined) {
      next.joystick_last_valid_cmd_age_ms =
        envelope.joystick_last_valid_cmd_age_ms;
    }
    if (envelope.joystick_stop_reason !== undefined) {
      next.joystick_stop_reason = envelope.joystick_stop_reason;
    }
    if (envelope.control_owner !== undefined) {
      next.control_owner = envelope.control_owner;
    }

    next.lastMessageTs = envelope.timestamp ?? Date.now();

    // Shallow equality check to detect actual changes
    const prev = mutable.telemetry;
    let changed = false;
    const shallowEqual = (a: any, b: any): boolean => {
      if (a === b) return true;
      if (!a || !b) return false;
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (const k of aKeys) {
        if (a[k] !== b[k]) return false;
      }
      return true;
    };

    if (envelope.state)
      changed = changed || !shallowEqual(prev.state, next.state);
    if (envelope.global)
      changed = changed || !shallowEqual(prev.global, next.global);
    if (envelope.battery)
      changed = changed || !shallowEqual(prev.battery, next.battery);
    if (envelope.rtk) changed = changed || !shallowEqual(prev.rtk, next.rtk);
    if (envelope.mission)
      changed = changed || !shallowEqual(prev.mission, next.mission);
    if (envelope.servo)
      changed = changed || !shallowEqual(prev.servo, next.servo);
    if (envelope.network)
      changed = changed || !shallowEqual(prev.network, next.network);
    if ((envelope as any).hrms !== undefined)
      changed = changed || (prev as any).hrms !== (next as any).hrms;
    if ((envelope as any).vrms !== undefined)
      changed = changed || (prev as any).vrms !== (next as any).vrms;
    if ((envelope as any).imu_status !== undefined)
      changed =
        changed || (prev as any).imu_status !== (next as any).imu_status;
    if ((envelope as any).attitude)
      changed =
        changed ||
        !shallowEqual((prev as any).attitude, (next as any).attitude);
    // New fields from Pixhawk NTUN
    if (envelope.wp_dist_cm !== undefined)
      changed = changed || prev.wp_dist_cm !== next.wp_dist_cm;
    if (envelope.xtrack_cm !== undefined)
      changed = changed || prev.xtrack_cm !== next.xtrack_cm;
    if (envelope.wp_brg !== undefined)
      changed = changed || prev.wp_brg !== next.wp_brg;
    if (envelope.position_error_cm !== undefined)
      changed = changed || prev.position_error_cm !== next.position_error_cm;
    if (envelope.distance_to_next_m !== undefined)
      changed = changed || prev.distance_to_next_m !== next.distance_to_next_m;
    if (envelope.fcu_connected !== undefined)
      changed = changed || prev.fcu_connected !== next.fcu_connected;
    if (envelope.gps_fix_name !== undefined)
      changed = changed || prev.gps_fix_name !== next.gps_fix_name;
    if (envelope.mission_state !== undefined)
      changed = changed || prev.mission_state !== next.mission_state;
    if (envelope.rpp_state_name !== undefined)
      changed = changed || prev.rpp_state_name !== next.rpp_state_name;
    if (envelope.rtk_stream_active !== undefined)
      changed = changed || prev.rtk_stream_active !== next.rtk_stream_active;
    if (envelope.rtk_ui_state !== undefined)
      changed = changed || prev.rtk_ui_state !== next.rtk_ui_state;
    if (envelope.measured_speed_m_s !== undefined)
      changed = changed || prev.measured_speed_m_s !== next.measured_speed_m_s;
    if (envelope.along_track_speed_mps !== undefined)
      changed =
        changed || prev.along_track_speed_mps !== next.along_track_speed_mps;
    if (envelope.cross_track_speed_mps !== undefined)
      changed =
        changed || prev.cross_track_speed_mps !== next.cross_track_speed_mps;
    if (envelope.joystick_state !== undefined)
      changed = changed || prev.joystick_state !== next.joystick_state;
    if (envelope.joystick_active !== undefined)
      changed = changed || prev.joystick_active !== next.joystick_active;
    if (envelope.joystick_last_valid_cmd_age_ms !== undefined) {
      changed =
        changed ||
        prev.joystick_last_valid_cmd_age_ms !==
          next.joystick_last_valid_cmd_age_ms;
    }
    if (envelope.joystick_stop_reason !== undefined)
      changed =
        changed || prev.joystick_stop_reason !== next.joystick_stop_reason;
    if (envelope.control_owner !== undefined)
      changed = changed || prev.control_owner !== next.control_owner;

    if (!changed) {
      // No meaningful change; update timestamps but skip dispatch to prevent loops
      // Reduced logging - only log occasionally
      if (TELEMETRY_LOGS_ENABLED && Math.random() < 0.05)
        telemLog("[TELEMETRY] No change detected");
      mutable.lastEnvelopeTs = Date.now();
      return;
    }

    // ✅ CRITICAL FIX: Update mutable ref immediately
    // telemLog('[TELEMETRY] ✅ Change detected, updating UI');
    mutable.telemetry = next;
    mutable.lastEnvelopeTs = Date.now();

    const now = performance.now();
    const elapsed = now - lastDispatchRef.current;

    // ✅ CRITICAL FIX: Check if we already have a pending dispatch to prevent accumulation
    if (pendingDispatchRef.current) {
      // Already have a pending update scheduled, just update the ref
      // The pending timeout will pick up the latest data when it fires
      return;
    }

    // ✅ Throttle UI updates to prevent excessive re-renders
    if (elapsed >= THROTTLE_MS) {
      lastDispatchRef.current = now;
      // Only update if component is still mounted
      if (mountedRef.current) {
        // Use reference directly — applyEnvelope already creates new objects via spread,
        // so React will see new references for changed fields. Deep clone was costing
        // 1-5ms per tick × 20Hz = 20-100ms/sec of JS thread time.
        setTelemetrySnapshot(next);
      }
    } else {
      // Schedule update only if not already scheduled (using a flag to prevent re-entry)
      const delay = THROTTLE_MS - elapsed;
      const timeoutId = setTimeout(() => {
        // Double-check the timeout hasn't been cleared
        if (pendingDispatchRef.current === timeoutId) {
          pendingDispatchRef.current = null; // Clear FIRST to prevent race conditions
          if (mountedRef.current) {
            lastDispatchRef.current = performance.now();
            setTelemetrySnapshot(mutableRef.current.telemetry);
          }
        }
      }, delay);
      pendingDispatchRef.current = timeoutId;
    }
  }, []); // ✅ Empty dependency array - this function is stable and uses refs for all external values

  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const robotStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const pollRobotStatus = useCallback(async () => {
    if (!mountedRef.current || isOfflineMode()) return;

    try {
      const prevNetwork =
        mutableRef.current.telemetry.network ?? DEFAULT_NETWORK;
      const [networkRaw, rtkRaw, healthRaw] = await Promise.all([
        apiGet(PX4_SYSTEM.NETWORK).catch(() => null),
        apiGet<RtkStatusResponse>(PX4_RTK.STATUS).catch(() => null),
        apiGet<Px4HealthzResponse>(PX4_SYSTEM.HEALTHZ).catch(() => null),
      ]);

      const envelope: TelemetryEnvelope = { timestamp: Date.now() };

      if (networkRaw) {
        envelope.network = toNetworkData(
          networkRaw as Parameters<typeof toNetworkData>[0],
          prevNetwork
        );
      }
      if (rtkRaw) {
        const rtkEnv = rtkStatusToEnvelope(rtkRaw);
        envelope.network = {
          ...(envelope.network ?? prevNetwork),
          ...rtkEnv.network,
        };
        if (rtkEnv.rtk) envelope.rtk = rtkEnv.rtk;
        if (rtkEnv.rtk_stream_active !== undefined) {
          envelope.rtk_stream_active = rtkEnv.rtk_stream_active;
        }
        // Derive the discrete RTK UI state (off/starting/streaming/float/fixed/error).
        envelope.rtk_ui_state = toRtkUiState(rtkRaw);
      }
      if (healthRaw) {
        envelope.fcu_connected = Boolean(healthRaw.fcu_connected);
        if (healthRaw.mission_state != null) {
          envelope.mission_state = String(healthRaw.mission_state);
        }
        envelope.state = {
          system_status: healthRaw.fcu_connected ? "ACTIVE" : "STANDBY",
        };
      }

      applyEnvelopeRef.current(envelope);

      patchRobotStatusDebug({
        lastSource: "rest_poll",
        socketConnected: Boolean(socketRef.current?.connected),
      });
      telemetryDiagLog("REST poll OK", {
        fcu: healthRaw?.fcu_connected,
        network: Boolean(networkRaw),
        rtk: Boolean(rtkRaw),
        sock: socketRef.current?.connected ?? false,
      });
    } catch (err) {
      telemetryDiagLog("REST poll failed", {
        err: err instanceof Error ? err.message : String(err),
        sock: socketRef.current?.connected ?? false,
      });
    }
  }, []);

  const fetchTelemetrySnapshot = useCallback(async () => {
    if (!mountedRef.current || isOfflineMode()) return;
    try {
      const latest = await apiGet(PX4_TELEMETRY.LATEST);
      if (!isPx4Payload(latest)) {
        telemetryDiagLog("REST /telemetry/latest — payload not PX4", {
          keys:
            latest && typeof latest === "object"
              ? Object.keys(latest as object).slice(0, 8)
              : "non-object",
        });
        return;
      }
      const adapted = toRoverTelemetry(
        latest as Parameters<typeof toRoverTelemetry>[0]
      );
      applyEnvelopeRef.current({
        timestamp: Date.now(),
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
        attitude: adapted.attitude,
        fcu_connected: adapted.fcu_connected,
        gps_fix_name: adapted.gps_fix_name,
        rpp_state_name: adapted.rpp_state_name,
        measured_speed_m_s: adapted.measured_speed_m_s,
        along_track_speed_mps: adapted.along_track_speed_mps,
        cross_track_speed_mps: adapted.cross_track_speed_mps,
        joystick_state: adapted.joystick_state,
        joystick_active: adapted.joystick_active,
        joystick_last_valid_cmd_age_ms: adapted.joystick_last_valid_cmd_age_ms,
        joystick_stop_reason: adapted.joystick_stop_reason,
        control_owner: adapted.control_owner,
      });
      patchRobotStatusDebug({
        lastSource: "rest_telemetry",
        px4Detected: true,
        rawPayload: pickRawRobotFields(
          latest as unknown as Record<string, unknown>
        ),
        adapted: {
          battery_pct: adapted.battery.percentage,
          battery_v: adapted.battery.voltage,
          gps_fix: adapted.rtk.fix_type,
          gps_sat: adapted.global.satellites_visible,
          hrms: adapted.hrms,
          vrms: adapted.vrms,
          mode: adapted.state.mode,
          fcu_connected: adapted.fcu_connected,
        },
      });
      telemetryDiagLog("REST /telemetry/latest OK", {
        battery: adapted.battery.percentage,
        gps_fix: adapted.rtk.fix_type,
        fcu: adapted.fcu_connected,
      });
    } catch (err) {
      telemetryDiagLog("REST /telemetry/latest failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const teardownSocket = useCallback(() => {
    clearReconnectTimer();

    if (connectDelayRef.current) {
      clearTimeout(connectDelayRef.current);
      connectDelayRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (socketRef.current) {
      manualDisconnectRef.current = true;
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      setTimeout(() => {
        manualDisconnectRef.current = false;
      }, 0);
      socketRef.current = null;
    }

    if (pendingDispatchRef.current) {
      clearTimeout(pendingDispatchRef.current);
      pendingDispatchRef.current = null;
    }

    socketGenerationRef.current += 1;
    socketConnectedAtRef.current = null;
    hasLiveTelemetryRef.current = false;

    const defaultTelemetry = createDefaultTelemetry();

    mutableRef.current.telemetry = defaultTelemetry;
    mutableRef.current.lastEnvelopeTs = null;

    setTelemetrySnapshot(defaultTelemetry);
    setHasLiveTelemetry(false);
  }, [clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      return;
    }
    const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      backoffRef.current = Math.min(
        Math.floor(backoffRef.current * 1.5),
        MAX_BACKOFF_MS
      );
      connectSocketRef.current();
    }, delay);
  }, []);

  const applyEnvelopeRef = useRef(applyEnvelope);

  useEffect(() => {
    applyEnvelopeRef.current = applyEnvelope;
  }, [applyEnvelope]);

  // ✅ CRITICAL FIX: Use refs for socket handlers to prevent infinite loops
  // These handlers are defined ONCE and use refs internally to access latest state
  const handleBridgeTelemetry = useRef((payload: any) => {
    // console.log('[BRIDGE_DATA] 📡 RAW PAYLOAD RECEIVED:', JSON.stringify(payload, null, 2));
    // Reduced logging - only log periodically (10% of the time)
    // if (TELEMETRY_LOGS_ENABLED && Math.random() < 0.1) telemLog('[TELEMETRY] Receiving bridge data...');
    const envelope = toTelemetryEnvelopeFromBridge(payload);
    if (envelope) {
      applyEnvelopeRef.current(envelope);
    }
  });

  const handleRoverData = useRef((payload: any) => {
    // console.log('[ROVER_DATA] 🚨 handleRoverData CALLED!');
    // console.log('[ROVER_DATA] 📡 RAW PAYLOAD RECEIVED:', JSON.stringify(payload, null, 2));
    // Reduced logging - only log periodically (10% of the time)
    // if (TELEMETRY_LOGS_ENABLED && Math.random() < 0.1) telemLog('[ROVER_DATA] Receiving data...');
    const envelope = toTelemetryEnvelopeFromRoverData(payload);
    if (envelope) {
      applyEnvelopeRef.current(envelope);
    }
  });

  const handleLoraRTKStatus = useRef((payload: LoraRTKStatus) => {
    try {
      loraStatusCallbackRef.current.forEach((cb) => cb(payload));

      // Update network lora_connected flag when provided
      if (payload && typeof payload.is_connected === "boolean") {
        const envelope: TelemetryEnvelope = {
          timestamp: Date.now(),
          network: {
            ...(mutableRef.current.telemetry.network || DEFAULT_NETWORK),
            lora_connected: Boolean(payload.is_connected),
          },
        } as any;
        applyEnvelopeRef.current(envelope);
      }
    } catch (err) {
      console.error("[LORA_RTK_STATUS] Error:", err);
    }
  });

  const connectSocket = useCallback(() => {
    teardownSocket();

    if (connectDelayRef.current) {
      clearTimeout(connectDelayRef.current);
    }

    setConnectionState("connecting");

    connectDelayRef.current = setTimeout(async () => {
      connectDelayRef.current = null;

      if (!mountedRef.current) {
        return;
      }

      try {
        const backendUrl = getHttpBase();

        // Auth token must be present before socket.connect() when AUTH_ENABLED.
        const session = AUTH_ENABLED
          ? await loadSession().catch(() => null)
          : null;
        const hasToken = Boolean(session?.token);
        const socketConfig: any = {
          ...SOCKET_CONFIG,
          auth: hasToken ? { token: session!.token } : undefined,
        };

        telemetryDiagLog("Socket connect attempt", {
          url: backendUrl,
          authEnabled: AUTH_ENABLED,
          hasToken,
        });

        if (AUTH_ENABLED && !hasToken) {
          telemetryDiagLog(
            "WARNING: no auth token — backend will refuse socket (login first on discovery screen)"
          );
        }

        const socket = io(
          backendUrl,
          socketConfig as Partial<ManagerOptions & SocketOptions>
        );
        socketRef.current = socket;

        let connectionGeneration: number | null = null;

        socket.on("connect", () => {
          telemetryDiagLog("Socket connected", {
            id: socket.id,

            transport: socket.io.engine?.transport?.name ?? "unknown",
          });

          clearReconnectTimer();

          backoffRef.current = INITIAL_BACKOFF_MS;

          /*
           * New connection generation.
           * Packets from a previous socket connection must not update the UI.
           */
          socketGenerationRef.current += 1;

          /*
           * Store the generation belonging to this successfully connected socket.
           */
          connectionGeneration = socketGenerationRef.current;
          console.log("[SOCKET] ✅ Connected successfully", {
            id: socket.id,
            backendUrl,
            generation: connectionGeneration,
            transport: socket.io.engine?.transport?.name ?? "unknown",
          });
          socketConnectedAtRef.current = Date.now();

          hasLiveTelemetryRef.current = false;

          /*
           * Clear all previously displayed telemetry.
           */
          const emptyTelemetry = createDefaultTelemetry();

          mutableRef.current.telemetry = emptyTelemetry;

          mutableRef.current.lastEnvelopeTs = null;

          setTelemetrySnapshot(emptyTelemetry);

          setHasLiveTelemetry(false);

          setConnectionState("connected");

          if (isRobotStatusDebugEnabled()) {
            patchRobotStatusDebug({
              connectionState: "connected",

              socketConnected: true,

              rejectReason: null,

              lastSource: "socket_telemetry",
            });
          }

          /*
           * Do not call REST telemetry here.
           *
           * Removed:
           * void fetchTelemetrySnapshot();
           * void pollRobotStatus();
           */
        });

        // NRP_ROS LEGACY DISABLED — custom ping/pong and subscription ack events.
        // socket.on('pong', () => {});
        // socket.on('mission_status_subscribed', (data: any) => { ... });

        socket.on("connect_error", (error: any) => {
          const message =
            error instanceof Error ? error.message : String(error);

          telemetryDiagLog("Socket connect_error", {
            message,
            code: error?.code,
            url: backendUrl,
            hasToken,
          });

          console.error("[SOCKET] Connection error:", message);

          if (
            message.toLowerCase().includes("unauthorized") ||
            message.toLowerCase().includes("unauthorised")
          ) {
            console.error(
              "[SOCKET] Authentication rejected. Log out and log in again."
            );
          }

          patchRobotStatusDebug({
            connectionState: "error",
            socketConnected: false,
            rejectReason: message,
          });

          resetTelemetry();
          setConnectionState("error");

          /*
           * Destroy this failed socket completely.
           * The next connection will load the latest saved authentication token.
           */
          socket.removeAllListeners();
          socket.disconnect();

          if (socketRef.current === socket) {
            socketRef.current = null;
          }

          scheduleReconnect();
        });

        socket.on("disconnect", (reason: string) => {
          telemetryDiagLog("Socket disconnected", {
            reason,
          });

          socketGenerationRef.current += 1;
          socketConnectedAtRef.current = null;
          hasLiveTelemetryRef.current = false;
          connectionGeneration = null;

          const emptyTelemetry = createDefaultTelemetry();

          mutableRef.current.telemetry = emptyTelemetry;

          mutableRef.current.lastEnvelopeTs = null;

          setTelemetrySnapshot(emptyTelemetry);
          setHasLiveTelemetry(false);

          if (manualDisconnectRef.current) {
            manualDisconnectRef.current = false;
            return;
          }

          setConnectionState("disconnected");

          if (socketRef.current === socket) {
            socketRef.current = null;
          }

          /*
           * Do not call socket.connect() here.
           * Create a fresh authenticated socket instead.
           */
          scheduleReconnect();
        });

        socket.on("error", (error: any) => {
          if (!isOfflineMode()) {
            console.error("[SOCKET] Error:", error);
          }
          setConnectionState("error");
        });

        // NRP_ROS LEGACY DISABLED — nested envelope + alias telemetry listeners.
        // socket.on(SOCKET_EVENTS.TELEMETRY, handleBridgeTelemetry.current);
        // socket.on(SOCKET_EVENTS.ROVER_DATA, handleRoverData.current);
        // socket.on('lora_rtk_status', handleLoraRTKStatus.current);
        // socket.on('rover_data_telemetry', handleRoverData.current);
        // socket.on('telemetry_data', handleBridgeTelemetry.current);
        // socket.on('gps_data', handleRoverData.current);
        // socket.on('battery_data', handleBridgeTelemetry.current);
        // socket.on('satellite_data', handleBridgeTelemetry.current);
        // socket.on('rtk_data', handleRoverData.current);
        // socket.on('vehicle_telemetry', handleBridgeTelemetry.current);

        // 4WD_SERVER — flat telemetry socket contract

        socket.on(SOCKET_EVENTS.TELEMETRY, (payload: unknown) => {
          /*
           * Reject packets handled by an older socket connection.
           */
          if (
            connectionGeneration === null ||
            connectionGeneration !== socketGenerationRef.current
          ) {
            return;
          }

          if (!socket.connected) {
            return;
          }

          const connectedAt = socketConnectedAtRef.current;

          if (connectedAt === null) {
            return;
          }

          const backendGeneratedAt = getTelemetryGeneratedTime(payload);

          /*
           * A packet received through the currently connected socket is treated as live.
           * When the backend later supplies generated_at, that backend timestamp is used.
           */
          const generatedAt = backendGeneratedAt ?? Date.now();

          const CLOCK_TOLERANCE_MS = 500;

          /*
           * Reject telemetry generated before this connection.
           */
          if (
            backendGeneratedAt !== null &&
            backendGeneratedAt < connectedAt - CLOCK_TOLERANCE_MS
          ) {
            telemetryDiagLog("Telemetry rejected: packet predates connection", {
              backendGeneratedAt,
              connectedAt,
            });

            return;
          }

          console.log("[TELEMETRY] Live packet received", {
            generation: connectionGeneration,
            currentGeneration: socketGenerationRef.current,
            hasBackendTimestamp: getTelemetryGeneratedTime(payload) !== null,
            keys:
              payload && typeof payload === "object"
                ? Object.keys(payload as Record<string, unknown>).slice(0, 20)
                : [],
          });

          const raw =
            payload && typeof payload === "object"
              ? pickRawRobotFields(payload as Record<string, unknown>)
              : null;

          const px4 = isPx4Payload(payload);

          const dbg = getRobotStatusDebug();

          if (!px4) {
            patchRobotStatusDebug({
              lastSource: "rejected",

              rejectReason: "telemetry payload failed isPx4Payload()",

              px4Detected: false,

              rawPayload: raw,

              telemetryEventCount: dbg.telemetryEventCount + 1,

              rejectedEventCount: dbg.rejectedEventCount + 1,

              socketConnected: true,

              connectionState: "connected",
            });

            return;
          }

          const adapted = toRoverTelemetry(
            payload as Parameters<typeof toRoverTelemetry>[0]
          );

          console.log("[TELEMETRY] Adapted values", {
            lat: adapted.global.lat,
            lon: adapted.global.lon,
            battery: adapted.battery.percentage,
            satellites: adapted.global.satellites_visible,
            fixType: adapted.rtk.fix_type,
            mode: adapted.state.mode,
            fcuConnected: adapted.fcu_connected,
          });

          const envelope: TelemetryEnvelope = {
            timestamp: generatedAt,

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

            attitude: adapted.attitude,

            fcu_connected: adapted.fcu_connected,

            gps_fix_name: adapted.gps_fix_name,

            rpp_state_name: adapted.rpp_state_name,

            measured_speed_m_s: adapted.measured_speed_m_s,

            along_track_speed_mps: adapted.along_track_speed_mps,

            cross_track_speed_mps: adapted.cross_track_speed_mps,

            joystick_state: adapted.joystick_state,

            joystick_active: adapted.joystick_active,

            joystick_last_valid_cmd_age_ms:
              adapted.joystick_last_valid_cmd_age_ms,

            joystick_stop_reason: adapted.joystick_stop_reason,

            control_owner: adapted.control_owner,
          };

          /*
           * First valid packet received after this socket connected.
           */
          if (!hasLiveTelemetryRef.current) {
            hasLiveTelemetryRef.current = true;

            setHasLiveTelemetry(true);
          }

          applyEnvelopeRef.current(envelope);

          if (isRobotStatusDebugEnabled()) {
            patchRobotStatusDebug({
              lastSource: "socket_telemetry",

              rejectReason: null,

              px4Detected: true,

              rawPayload: raw,

              telemetryEventCount: dbg.telemetryEventCount + 1,

              socketConnected: true,

              connectionState: "connected",

              lastMessageTs: generatedAt,

              adapted: {
                battery_pct: adapted.battery.percentage,

                battery_v: adapted.battery.voltage,

                gps_fix: adapted.rtk.fix_type,

                gps_fix_name: adapted.gps_fix_name,

                gps_sat: adapted.global.satellites_visible,

                hrms: adapted.hrms,

                vrms: adapted.vrms,

                mode: adapted.state.mode,

                armed: adapted.state.armed,

                fcu_connected: adapted.fcu_connected,

                rpp_state_name: adapted.rpp_state_name,

                imu_status: adapted.imu_status,

                lat: adapted.global.lat,

                lon: adapted.global.lon,
              },
            });
          }
        });

        // console.log('[SOCKET] ✅ Event listeners registered successfully');

        // 🔍 DEBUG: Add catch-all listener to see all events
        // socket.onAny((eventName, ...args) => {
        //   console.log('[SOCKET] 📨 ANY EVENT RECEIVED:', eventName, args);
        //   if (eventName === 'rover_data') {
        //     console.log('[SOCKET] 🚨 rover_data event detected by onAny!');
        //   }
        // });

        // NRP_ROS LEGACY DISABLED — mission_event / server_activity / nested mission_status parsers.
        // socket.on('mission_event', ...);
        // socket.on('mission_logs_snapshot', ...);
        // socket.on('server_activity', ...);
        // socket.on('mission_status', (data) => { data.mission_state, data.current_waypoint ... });

        // 4WD_SERVER — flat mission_status socket contract
        socket.on(SOCKET_EVENTS.MISSION_STATUS, (data: any) => {
          if (isRobotStatusDebugEnabled()) {
            const mdbg = getRobotStatusDebug();
            patchRobotStatusDebug({
              lastSource: "socket_mission_status",
              missionStatusEventCount: mdbg.missionStatusEventCount + 1,
              socketConnected: true,
              rawPayload: pickRawRobotFields(data),
            });
          }

          const statusKey = `${data.state}-${data.rpp_state}-${data.dist_to_goal}`;
          if (statusKey !== lastMissionStatusRef.current) {
            lastMissionStatusRef.current = statusKey;
            const base = mutableRef.current.telemetry;
            const merged = mergeMissionStatus(base, {
              state: data.state,
              rpp_state: data.rpp_state,
              rpp_state_name: data.rpp_state_name,
              dist_to_goal: data.dist_to_goal,
              speed: data.speed,
              xtrack: data.xtrack,
            });
            const envelope: TelemetryEnvelope = {
              timestamp: Date.now(),
              mission: merged.mission,
              global: merged.global,
              distance_to_next_m: merged.distance_to_next_m,
              xtrack_cm: merged.xtrack_cm,
            };
            if (missionStatusDebounceRef.current) {
              clearTimeout(missionStatusDebounceRef.current);
            }
            missionStatusDebounceRef.current = setTimeout(() => {
              applyEnvelopeRef.current(envelope);
              missionStatusDebounceRef.current = null;
            }, 100);
          }
          try {
            missionEventCallbackRef.current.forEach((cb) => cb(data as any));
          } catch (err) {
            console.error("[MISSION_STATUS] Error:", err);
          }
        });

        // point_mission_event is owned exclusively by usePointMissionEvents (MissionReportScreen).

        socket.on(SOCKET_EVENTS.MISSION_COMPLETED, (data: any) => {
          missionEventCallbackRef.current.forEach((cb) =>
            cb({ type: "mission_completed", ...data })
          );
        });

        socket.on(SOCKET_EVENTS.MISSION_COMPLETION_DEGRADED, (data: any) => {
          missionEventCallbackRef.current.forEach((cb) =>
            cb({ type: "mission_completion_degraded", ...data })
          );
        });

        socket.on(SOCKET_EVENTS.MISSION_ERROR, (data: { error: string }) => {
          console.error("[MISSION_ERROR]", data.error);
          missionEventCallbackRef.current.forEach((cb) =>
            cb({
              type: "mission_error",
              message: data.error,
              timestamp: Date.now(),
            } as any)
          );
        });

        // NRP_ROS LEGACY DISABLED — mission_command_ack, upload/download progress, failsafe_*, obstacle, LED.
        // socket.on('mission_command_ack', ...);
        // socket.on('mission_upload_progress', ...);
        // socket.on('failsafe_resumed', ...);
        // socket.on('obstacle_detection_changed', ...);
        // socket.on('led_controller_changed', ...);
        // socket.on('emergency_stop_ack', ...);
        // socket.on('manual_control_error', ...);

        // 4WD_SERVER — estop_result (replaces emergency_stop_ack)
        socket.on(SOCKET_EVENTS.ESTOP_RESULT, (data: any) => {
          console.log("[ESTOP_RESULT] PX4 e-stop result:", data);
          missionEventCallbackRef.current.forEach((cb) =>
            cb({
              type: "emergency_stop",
              message: data?.message || "E-stop executed",
              timestamp: Date.now(),
              data: data,
            } as any)
          );
        });

        // 4WD_SERVER — joystick errors (replaces manual_control_error)
        socket.on(
          SOCKET_EVENTS.JOYSTICK_ERROR,
          (data: { message?: string; code?: string }) => {
            console.error("[JOYSTICK_ERROR]", data);
            missionEventCallbackRef.current.forEach((cb) =>
              cb({
                type: "joystick_error",
                message: data.message || "Joystick error",
                timestamp: Date.now(),
                data,
              } as any)
            );
          }
        );

        socket.on(SOCKET_EVENTS.ROVER_DISCONNECTED, () => {
          console.warn("[ROVER_DISCONNECTED] FCU link lost");
        });

        socket.connect();

        // NRP_ROS LEGACY DISABLED — periodic ping emit
        // const pingInterval = setInterval(() => { socket.emit('ping'); }, 5000);
        pingIntervalRef.current = null;
      } catch (error) {
        if (!isOfflineMode()) {
          console.error("[SOCKET] Initialization failed:", error);
        }
        setConnectionState("error");
        scheduleReconnect();
      }
    }, 100);
    // ✅ CRITICAL: Removed handleBridgeTelemetry and handleRoverData from dependencies
    // They are now refs and won't cause re-registrations
  }, [clearReconnectTimer, resetTelemetry, scheduleReconnect, teardownSocket]);

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    backoffRef.current = INITIAL_BACKOFF_MS;
    connectSocketRef.current();
  }, [clearReconnectTimer]);

  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  // Single initialization effect - no dependencies to prevent infinite loops
  useEffect(() => {
    mountedRef.current = true;
    telemetryDiagLog("useRoverTelemetry mounted", {
      backend: getHttpBase(),
      authEnabled: AUTH_ENABLED,
      offline: isOfflineMode(),
    });
    connectSocketRef.current();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectDelayRef.current) {
        clearTimeout(connectDelayRef.current);
        connectDelayRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (gpsFixTypeDebounceRef.current) {
        clearTimeout(gpsFixTypeDebounceRef.current);
        gpsFixTypeDebounceRef.current = null;
      }
      if (missionStatusDebounceRef.current) {
        clearTimeout(missionStatusDebounceRef.current);
        missionStatusDebounceRef.current = null;
      }
      if (socketRef.current) {
        manualDisconnectRef.current = true;
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (pendingDispatchRef.current) {
        clearTimeout(pendingDispatchRef.current);
        pendingDispatchRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushStatePatch = useCallback((patch: Partial<TelemetryState>) => {
    const baseState = mutableRef.current.telemetry.state;
    const envelope: TelemetryEnvelope = {
      timestamp: Date.now(),
      state: {
        ...baseState,
        ...patch,
        heartbeat_ts: patch.heartbeat_ts ?? Date.now(),
      },
    };
    applyEnvelopeRef.current(envelope);
  }, []);

  const services = useMemo<RoverServices>(
    () => ({
      armVehicle: async () => {
        // PX4 fix: payload is { arm: true } not { value: true }
        const armPayload = { arm: true };
        const response = await postService(API_ENDPOINTS.ARM, armPayload);
        if (response.success && !isPx4DxpEnabled()) {
          // Legacy ArduRover optimistic arm lock (NOT used in PX4 — wait for telemetry)
          mutableRef.current.armedLockUntil = Date.now() + 3000;
          mutableRef.current.telemetry = {
            ...mutableRef.current.telemetry,
            state: {
              ...mutableRef.current.telemetry.state,
              armed: true,
              system_status: "ARMED",
            },
          };
          pushStatePatch({ armed: true, system_status: "ARMED" });
        }
        return response;
      },
      disarmVehicle: async () => {
        // PX4 fix: payload is { arm: false } not { value: false }
        const armPayload = { arm: false };
        const response = await postService(API_ENDPOINTS.ARM, armPayload);
        if (response.success) {
          mutableRef.current.armedLockUntil = null;
        }
        return response;
      },
      setMode: (mode: string) => {
        if (mode !== "MANUAL") {
          return Promise.resolve({
            success: false,
            message: `NRP_ROS legacy mode '${mode}' disabled — PX4 REST mode control only supports MANUAL`,
          } as ServiceResponse);
        }
        return postService(API_ENDPOINTS.SET_MODE, { mode });
      },

      // Mission CSV upload is handled directly by missionApi.ts.
      uploadMission: () =>
        nrpRosLegacyDisabled("uploadMission: use uploadMissionCsv"),

      loadMissionToController: () =>
        nrpRosLegacyDisabled(
          "loadMissionToController: CSV upload prepares automatically"
        ),

      downloadMission: () =>
        nrpRosLegacyDisabled(
          "downloadMission: use active mission.csv endpoint"
        ),

      clearMission: async () => {
        const response = await clearBackendMission();

        return response as unknown as ServiceResponse;
      },

      setCurrentWaypoint: () => nrpRosLegacyDisabled("setCurrentWaypoint"),

      startMission: async () => {
        const response = await startBackendMission();

        return response as unknown as ServiceResponse;
      },

      pauseMission: async () => {
        const response = await pauseBackendMission();

        return response as unknown as ServiceResponse;
      },

      resumeMission: async () => {
        const response = await resumeBackendMission();

        return response as unknown as ServiceResponse;
      },

      nextMission: async () => {
        const response = await nextMissionPoint();

        return response as unknown as ServiceResponse;
      },

      skipMission: async () => {
        const response = await skipMissionPoint();

        return response as unknown as ServiceResponse;
      },

      stopMission: async () => {
        const response = await stopBackendMission();

        return response as unknown as ServiceResponse;
      },

      /*
       * Restart is intentionally disabled.
       *
       * Production flow:
       * Stop → Start
       */
      restartMission: () =>
        nrpRosLegacyDisabled("restartMission: use Stop followed by Start"),

      bulkSkipRange: () => nrpRosLegacyDisabled("bulkSkipRange"),

      getMissionStatus: async () => {
        const response = await getBackendMissionStatus();

        return response as unknown as ServiceResponse;
      },

      // NRP_ROS LEGACY DISABLED — socket mission logs + failsafe emits + RTK inject URL
      requestMissionLogs: () => nrpRosLegacyDisabled("requestMissionLogs"),
      resumeFailsafeMission: () =>
        nrpRosLegacyDisabled("resumeFailsafeMission"),
      restartFailsafeMission: () =>
        nrpRosLegacyDisabled("restartFailsafeMission"),
      injectRTK: () => nrpRosLegacyDisabled("injectRTK"),
      stopRTK: async () => {
        console.log("[RTK DEBUG] Sending RTK stop request", {
          endpoint: API_ENDPOINTS.RTK_STOP,
        });
        try {
          const res = await postService(API_ENDPOINTS.RTK_STOP);
          console.log("[RTK DEBUG] RTK stop response", res);
          return res;
        } catch (err) {
          console.error("[RTK DEBUG] RTK stop error", err);
          throw err;
        }
      },
      getRTKStatus: () => getService(API_ENDPOINTS.RTK_STATUS),

      // New RTK methods per documentation
      startNTRIPStream: async (params) => {
        console.log("[RTK DEBUG] Starting NTRIP stream with params", params);
        try {
          const res = await postService(API_ENDPOINTS.RTK_NTRIP_START, params);
          console.log("[RTK DEBUG] NTRIP start response", res);
          return res as import("../types/rtk").NTRIPStartResponse;
        } catch (err) {
          console.error("[RTK DEBUG] NTRIP start error", err);
          throw err;
        }
      },

      // PX4: no separate NTRIP stop — use RTK_STOP
      stopNTRIPStream: async () => {
        const res = await postService(API_ENDPOINTS.RTK_STOP);
        return res as import("../types/rtk").NTRIPStopResponse;
      },

      startLoRaStream: async () =>
        nrpRosLegacyDisabled("startLoRaStream") as Promise<
          import("../types/rtk").LoRaStartResponse
        >,

      stopLoRaStream: async () => {
        console.log("[RTK DEBUG] Stopping LoRa stream via REST");
        try {
          const res = await postService(API_ENDPOINTS.RTK_LORA_STOP);
          console.log("[RTK DEBUG] LoRa stop response", res);
          return res as import("../types/rtk").LoRaStopResponse;
        } catch (err) {
          console.error("[RTK DEBUG] LoRa stop error", err);
          throw err;
        }
      },

      stopAllRTKStreams: async () => {
        console.log("[RTK DEBUG] Stopping all RTK streams");
        try {
          const res = await postService(API_ENDPOINTS.RTK_STOP);
          console.log("[RTK DEBUG] Stop all response", res);
          return res as import("../types/rtk").RTKStopAllResponse;
        } catch (err) {
          console.error("[RTK DEBUG] Stop all error", err);
          throw err;
        }
      },

      // NRP_ROS LEGACY DISABLED — LoRa socket emits (use rtkService REST on PX4)
      startLoraRTKStream: () => nrpRosLegacyDisabled("startLoraRTKStream"),
      stopLoraRTKStream: () => nrpRosLegacyDisabled("stopLoraRTKStream"),
      getLoraRTKStatus: () => nrpRosLegacyDisabled("getLoraRTKStatus"),
      onLoraRTKStatus: (cb: (status: LoraRTKStatus) => void) => {
        loraStatusCallbackRef.current.push(cb);
        return () => {
          const idx = loraStatusCallbackRef.current.indexOf(cb);
          if (idx >= 0) {
            loraStatusCallbackRef.current.splice(idx, 1);
          }
        };
      },
      onUploadProgress: (
        cb: (progress: { percent: number; message?: string }) => void
      ) => {
        uploadProgressCallbackRef.current.push(cb);
        return () => {
          const idx = uploadProgressCallbackRef.current.indexOf(cb);
          if (idx >= 0) {
            uploadProgressCallbackRef.current.splice(idx, 1);
          }
        };
      },
      onDownloadProgress: (
        cb: (progress: { percent: number; message?: string }) => void
      ) => {
        downloadProgressCallbackRef.current.push(cb);
        return () => {
          const idx = downloadProgressCallbackRef.current.indexOf(cb);
          if (idx >= 0) {
            downloadProgressCallbackRef.current.splice(idx, 1);
          }
        };
      },
      // NRP_ROS LEGACY DISABLED — servo PWM, TTS, mission config socket, LED, bulk MAVLink params
      controlServo: () => nrpRosLegacyDisabled("controlServo"),
      getTTSStatus: () => nrpRosLegacyDisabled("getTTSStatus"),
      controlTTS: () => nrpRosLegacyDisabled("controlTTS"),
      testTTS: () => nrpRosLegacyDisabled("testTTS"),
      setTTSLanguage: () => nrpRosLegacyDisabled("setTTSLanguage"),
      getTTSGender: () => nrpRosLegacyDisabled("getTTSGender"),
      setTTSGender: () => nrpRosLegacyDisabled("setTTSGender"),
      updateMissionParameters: () =>
        nrpRosLegacyDisabled("updateMissionParameters"),
      updateObstacleZones: () => nrpRosLegacyDisabled("updateObstacleZones"),
      setObstacleDetection: () => nrpRosLegacyDisabled("setObstacleDetection"),
      setLEDController: () => nrpRosLegacyDisabled("setLEDController"),
      getLEDControllerStatus: () =>
        nrpRosLegacyDisabled("getLEDControllerStatus"),
      getParams: () =>
        nrpRosLegacyDisabled("getParams") as Promise<
          import("../types/params").ParamListResponse
        >,
      getParam: () =>
        nrpRosLegacyDisabled("getParam") as Promise<
          import("../types/params").ParamGetResponse
        >,
      setParam: () =>
        nrpRosLegacyDisabled("setParam") as Promise<
          import("../types/params").ParamSetResponse
        >,
      getParamGroups: () =>
        nrpRosLegacyDisabled("getParamGroups") as Promise<
          import("../types/params").ParamGroupsResponse
        >,
      downloadParams: () =>
        nrpRosLegacyDisabled("downloadParams") as Promise<
          import("../types/params").ParamDownloadResponse
        >,
      uploadParams: () =>
        nrpRosLegacyDisabled("uploadParams") as Promise<
          import("../types/params").ParamUploadResponse
        >,

      // 4WD_SERVER — E-stop (socket primary, /api/estop REST fallback)
      emergencyStop: async () => {
        if (socketRef.current?.connected) {
          socketRef.current.emit(SOCKET_EVENTS.EMERGENCY_STOP);
          return {
            success: true,
            message: "Emergency stop sent",
          } as ServiceResponse;
        }
        try {
          return await postService(API_ENDPOINTS.ESTOP);
        } catch (err) {
          console.error("[EMERGENCY_STOP] REST failed:", err);
          return {
            success: false,
            message: "Emergency stop failed",
          } as ServiceResponse;
        }
      },

      // NRP_ROS LEGACY DISABLED — PWM manual_control socket emits (use joystickLeaseService)
      sendManualControl: () => nrpRosLegacyDisabled("sendManualControl"),
      stopManualControl: () => nrpRosLegacyDisabled("stopManualControl"),

      getActivityLogs: () => getService(API_ENDPOINTS.ACTIVITY_LOGS),
      // NRP_ROS LEGACY DISABLED — activity types/download, ROS nodes, servo config
      getActivityTypes: () => nrpRosLegacyDisabled("getActivityTypes"),
      downloadActivityLogs: () => nrpRosLegacyDisabled("downloadActivityLogs"),
      getNodes: () => nrpRosLegacyDisabled("getNodes"),
      getNodeDetails: () => nrpRosLegacyDisabled("getNodeDetails"),
      getServoStatus: () => getService(API_ENDPOINTS.SPRAY_STATUS),
      getMissionServoConfig: () =>
        nrpRosLegacyDisabled("getMissionServoConfig"),
      updateMissionServoConfig: () =>
        nrpRosLegacyDisabled("updateMissionServoConfig"),
      testMissionServoConfig: () =>
        nrpRosLegacyDisabled("testMissionServoConfig"),
    }),
    [pushStatePatch]
  );

  const onMissionEvent = useCallback(
    (callback: (event: MissionEventData) => void) => {
      missionEventCallbackRef.current.push(callback);
      return () => {
        const index = missionEventCallbackRef.current.indexOf(callback);
        if (index > -1) {
          missionEventCallbackRef.current.splice(index, 1);
        }
      };
    },
    []
  );

  useEffect(() => {
    if (isRobotStatusDebugEnabled()) {
      patchRobotStatusDebug({
        connectionState,
        socketConnected: Boolean(socketRef.current?.connected),
      });
    }
  }, [connectionState]);

  // ✅ CRITICAL FIX: Use ref to track previous position and only create new object when values actually change
  // This prevents infinite loops caused by creating new object references on every render
  const lastPositionRef = useRef<{
    lat: number;
    lng: number;
    timestamp: number;
  } | null>(null);

  const roverPosition = useMemo(() => {
    if (!hasLiveTelemetry) {
      lastPositionRef.current = null;

      return null;
    }

    const lat = telemetrySnapshot.global?.lat ?? 0;

    const lng = telemetrySnapshot.global?.lon ?? 0;

    const timestamp = telemetrySnapshot.lastMessageTs;

    if (
      !timestamp ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat === 0 ||
      lng === 0
    ) {
      lastPositionRef.current = null;

      return null;
    }

    const previous = lastPositionRef.current;

    if (
      previous &&
      previous.lat === lat &&
      previous.lng === lng &&
      previous.timestamp === timestamp
    ) {
      return previous;
    }

    const newPosition = {
      lat,
      lng,
      timestamp,
    };

    lastPositionRef.current = newPosition;

    return newPosition;
  }, [
    hasLiveTelemetry,
    telemetrySnapshot.global?.lat,
    telemetrySnapshot.global?.lon,
    telemetrySnapshot.lastMessageTs,
  ]);

  return {
    telemetry: telemetrySnapshot,

    hasLiveTelemetry,

    roverPosition,

    connectionState,

    reconnect,

    services,

    onMissionEvent,

    socket: socketRef.current,
  };
}

export default useRoverTelemetry;
