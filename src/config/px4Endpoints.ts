/**
 * DYX 4WD Rover Backend endpoint catalog.
 *
 * Backend:
 * http://192.168.3.101:5001
 *
 * All protected routes use:
 * X-Rover-Token: <token>
 */

// ── Authentication ────────────────────────────────────────────────────────────

export const PX4_AUTH = {
  LOGIN: "/api/auth/login",
  SESSION: "/api/auth/session",
  LOGOUT: "/api/auth/logout",

  // Retained only for existing frontend compatibility.
  // The current production backend does not expose this route.
  CHANGE_PASSWORD: "/api/auth/change-password",
} as const;

// ── System status ─────────────────────────────────────────────────────────────

export const PX4_SYSTEM = {
  PING: "/api/ping",
  HEALTHZ: "/api/healthz",
  NETWORK: "/api/network",
  SAFETY_STATUS: "/api/safety/status",

  // Old frontend compatibility constants.
  DISCOVER: "/api/discover",
  HEALTH_BRIDGE: "/api/health/bridge",
} as const;

// ── Telemetry ─────────────────────────────────────────────────────────────────

export const PX4_TELEMETRY = {
  LATEST: "/api/telemetry/latest",
} as const;

// ── Safety ────────────────────────────────────────────────────────────────────

export const PX4_VEHICLE = {
  ESTOP: "/api/estop",
  ESTOP_RELEASE: "/api/estop/release",

  /*
   * These legacy direct PX4 routes are not part of the current product
   * backend. Mission Start owns mission enable and rover movement.
   */
  ARM: "/api/arm",
  SET_MODE: "/api/set_mode",
} as const;

// ── Mission ───────────────────────────────────────────────────────────────────

export const PX4_MISSION = {
  // Multipart CSV upload.
  UPLOAD: "/api/mission/upload",

  // Recalculate trajectory from the stored mission.csv.
  PREPARE: "/api/mission/prepare",

  // Mission information.
  STATUS: "/api/mission/status",
  LOADED_PATH: "/api/mission/loaded-path",

  // Active mission.csv.
  FILE: "/api/mission/file",

  // Mission controls.
  START: "/api/mission/start",
  PAUSE: "/api/mission/pause",
  RESUME: "/api/mission/resume",
  NEXT_POINT: "/api/mission/next-point",
  SKIP_POINT: "/api/mission/skip-point",
  STOP: "/api/mission/stop",
  CLEAR: "/api/mission/clear",

  /*
   * Compatibility aliases for existing frontend files.
   * We will migrate their callers in the following steps.
   */
  POINT_CONTINUE: "/api/mission/next-point",
  POINT_SKIP: "/api/mission/skip-point",

  // Not available in the current backend.
  ABORT: "/api/mission/abort",
  RESTART: "/api/mission/restart",
  POINT_EVENTS: "/api/mission/point/events",
  POINT_STATUS: "/api/mission/point/status",
  OBSTACLE: "/api/mission/obstacle",
  DEBUG_CAPTURE_STATUS: "/api/mission/debug-capture/status",
} as const;

// ── Legacy path-staging compatibility ─────────────────────────────────────────

/**
 * The current backend does not use named-path staging.
 *
 * It keeps one active mission.csv and trajectory_generator prepares the path.
 * These constants remain temporarily so older files continue compiling while
 * we migrate the upload workflow.
 */
export const PX4_PATH = {
  LIST: "/api/paths",

  PLAN: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/plan`,

  PLAN_AND_STAGE: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/plan-and-stage`,

  STAGED: (missionId: string) =>
    `/api/path/staged/${encodeURIComponent(missionId)}`,

  ALIGN: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/align`,

  LOAD_TO_CONTROLLER:
    "/api/path/load-to-controller",

  PARSE_DXF:
    "/api/path/parse-dxf",

  PARSE_POINT_CSV:
    "/api/path/parse-point-csv",

  SPRAY_MODE_GET: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/spray-mode`,

  SPRAY_MODE_CONTINUOUS: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/spray-mode/continuous`,

  SPRAY_MODE_DASH: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/spray-mode/dash`,

  SPRAY_MODE_POINT: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/spray-mode/point`,

  SPRAY_MODE_DELETE: (name: string) =>
    `/api/path/${encodeURIComponent(name)}/spray-mode`,
} as const;

// ── RTK ───────────────────────────────────────────────────────────────────────

export const PX4_RTK = {
  STATUS: "/api/rtk/status",
  CONFIG: "/api/rtk/config",
  RECONNECT: "/api/rtk/reconnect",
} as const;

// ── Legacy spray compatibility ────────────────────────────────────────────────

export const PX4_SPRAY = {
  STATUS: "/api/spray/status",
  ON: "/api/spray/on",
  OFF: "/api/spray/off",
  ENABLE: "/api/spray/enable",
  DISABLE: "/api/spray/disable",
  TEST: "/api/spray/test",

  PARAMS: (name: string) =>
    `/api/spray/params/${encodeURIComponent(name)}`,

  PARAMS_BASE:
    "/api/spray/params",
} as const;

// ── Legacy RPP compatibility ──────────────────────────────────────────────────

export const PX4_RPP = {
  PARAMS: (name: string) =>
    `/api/rpp/params/${encodeURIComponent(name)}`,
} as const;

// ── Activity compatibility ────────────────────────────────────────────────────

export const PX4_ACTIVITY = {
  LIST: "/api/activity",
} as const;

// ── Socket.IO server events ───────────────────────────────────────────────────

export const PX4_SOCKET_EVENTS = {
  TELEMETRY: "telemetry",
  MISSION_STATUS: "mission_status",
  MISSION_PROGRESS: "mission_progress",
  MISSION_STATE: "mission_state",
  MISSION_COMPLETED: "mission_completed",

  SAFETY_STATE: "safety_state",
  SOCKET_READY: "socket_ready",

  POINT_EVENT: "point_event",
  POINT_COMPLETED: "point_completed",
  POINT_SKIPPED: "point_skipped",
  POINT_FAILED: "point_failed",

  AUTH_REVOKED: "auth_revoked",

  // Client liveness event.
  CLIENT_PING: "client_ping",

  /*
   * Existing legacy UI compatibility events.
   * Current backend mission controls use REST.
   */
  ESTOP_RESULT: "estop_result",
  ARM_RESULT: "arm_result",
  GPS_SAFETY_ABORT: "gps_safety_abort",
  SAFETY_ABORT: "safety_abort",
  MISSION_COMPLETION_DEGRADED:
    "mission_completion_degraded",
  POINT_MISSION_EVENT:
    "point_mission_event",
  JOYSTICK_ACQUIRED:
    "joystick_acquired",
  JOYSTICK_RELEASED:
    "joystick_released",
  JOYSTICK_ERROR:
    "joystick_error",
  EMERGENCY_STOP:
    "emergency_stop",
  JOYSTICK_ACQUIRE:
    "joystick_acquire",
  JOYSTICK_COMMAND:
    "joystick_command",
  JOYSTICK_RELEASE:
    "joystick_release",
} as const;

export type Px4SocketEvent =
  typeof PX4_SOCKET_EVENTS[
    keyof typeof PX4_SOCKET_EVENTS
  ];

export default {
  PX4_AUTH,
  PX4_SYSTEM,
  PX4_TELEMETRY,
  PX4_VEHICLE,
  PX4_MISSION,
  PX4_PATH,
  PX4_RTK,
  PX4_SPRAY,
  PX4_RPP,
  PX4_ACTIVITY,
  PX4_SOCKET_EVENTS,
};