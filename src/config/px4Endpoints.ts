/**
 * 4WD_SERVER Canonical Endpoint Constants
 *
 * All REST paths for the 4WD_SERVER backend. When ROVER_ENABLED is true,
 * apiClient uses these instead of the legacy API_ENDPOINTS in config.ts.
 *
 * Rules:
 * - Paths are path-only (no host). apiClient prepends getBackendURL().
 * - Dynamic segments are documented; callers substitute at call site.
 */

// ── Auth ─────────────────────────────────────────────────────────────────────
export const PX4_AUTH = {
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  CHANGE_PASSWORD: '/api/auth/change-password',
} as const;

// ── System / Discovery ────────────────────────────────────────────────────────
export const PX4_SYSTEM = {
  PING: '/api/ping',
  HEALTHZ: '/api/healthz',
  DISCOVER: '/api/discover',
  HEALTH_BRIDGE: '/api/health/bridge',
  NETWORK: '/api/network',
} as const;

// ── Telemetry ─────────────────────────────────────────────────────────────────
export const PX4_TELEMETRY = {
  LATEST: '/api/telemetry/latest',
} as const;

// ── Vehicle Control ───────────────────────────────────────────────────────────
export const PX4_VEHICLE = {
  ARM: '/api/arm',                     // POST { arm: boolean }
  SET_MODE: '/api/set_mode',           // POST { mode: 'MANUAL' } — OFFBOARD via mission/start only
  ESTOP: '/api/estop',                 // POST — hard e-stop
} as const;

// ── Mission Lifecycle ─────────────────────────────────────────────────────────
export const PX4_MISSION = {
  START: '/api/mission/start',
  STOP: '/api/mission/stop',
  ABORT: '/api/mission/abort',
  PAUSE: '/api/mission/pause',
  RESUME: '/api/mission/resume',
  RESTART: '/api/mission/restart',
  CLEAR: '/api/mission/clear',
  STATUS: '/api/mission/status',
  LOADED_PATH: '/api/mission/loaded-path',
  // Point mission
  POINT_CONTINUE: '/api/mission/point/continue',
  POINT_SKIP: '/api/mission/point/skip',
  POINT_EVENTS: '/api/mission/point/events',  // GET ?since_event_id=
  POINT_STATUS: '/api/mission/point/status',
  // Obstacle
  OBSTACLE: '/api/mission/obstacle',
  // Debug
  DEBUG_CAPTURE_STATUS: '/api/mission/debug-capture/status',
} as const;

// ── Path (staging pipeline) ───────────────────────────────────────────────────
export const PX4_PATH = {
  LIST: '/api/paths',
  PLAN: (name: string) => `/api/path/${encodeURIComponent(name)}/plan`,
  PLAN_AND_STAGE: (name: string) => `/api/path/${encodeURIComponent(name)}/plan-and-stage`,
  STAGED: (missionId: string) => `/api/path/staged/${encodeURIComponent(missionId)}`,
  ALIGN: (name: string) => `/api/path/${encodeURIComponent(name)}/align`,
  LOAD_TO_CONTROLLER: '/api/path/load-to-controller',
  PARSE_DXF: '/api/path/parse-dxf',
  PARSE_POINT_CSV: '/api/path/parse-point-csv',
  // Spray mode sidecar
  SPRAY_MODE_GET: (name: string) => `/api/path/${encodeURIComponent(name)}/spray-mode`,
  SPRAY_MODE_CONTINUOUS: (name: string) => `/api/path/${encodeURIComponent(name)}/spray-mode/continuous`,
  SPRAY_MODE_DASH: (name: string) => `/api/path/${encodeURIComponent(name)}/spray-mode/dash`,
  SPRAY_MODE_POINT: (name: string) => `/api/path/${encodeURIComponent(name)}/spray-mode/point`,
  SPRAY_MODE_DELETE: (name: string) => `/api/path/${encodeURIComponent(name)}/spray-mode`,
} as const;

// ── RTK ───────────────────────────────────────────────────────────────────────
export const PX4_RTK = {
  STATUS: '/api/rtk/status',
  STOP: '/api/rtk/stop',
  NTRIP_START: '/api/rtk/ntrip/start',  // Note: slash-separated (not ntrip_start)
  LORA_START: '/api/rtk/lora/start',
  LORA_STOP: '/api/rtk/lora/stop',
} as const;

// ── Spray / Servo ─────────────────────────────────────────────────────────────
export const PX4_SPRAY = {
  STATUS: '/api/spray/status',
  ON: '/api/spray/on',
  OFF: '/api/spray/off',
  ENABLE: '/api/spray/enable',
  DISABLE: '/api/spray/disable',
  TEST: '/api/spray/test',
  PARAMS: (name: string) => `/api/spray/params/${encodeURIComponent(name)}`,
  PARAMS_BASE: '/api/spray/params',
} as const;

// ── RPP Params ────────────────────────────────────────────────────────────────
export const PX4_RPP = {
  PARAMS: (name: string) => `/api/rpp/params/${encodeURIComponent(name)}`,
} as const;

// ── Activity ──────────────────────────────────────────────────────────────────
export const PX4_ACTIVITY = {
  LIST: '/api/activity',
} as const;

// ── Socket.IO Events (PX4 catalog) ────────────────────────────────────────────
export const PX4_SOCKET_EVENTS = {
  // Server → Client
  TELEMETRY: 'telemetry',
  MISSION_STATUS: 'mission_status',
  POINT_MISSION_EVENT: 'point_mission_event',
  MISSION_COMPLETED: 'mission_completed',
  MISSION_COMPLETION_DEGRADED: 'mission_completion_degraded',
  GPS_SAFETY_ABORT: 'gps_safety_abort',
  SAFETY_ABORT: 'safety_abort',
  ESTOP_RESULT: 'estop_result',
  ARM_RESULT: 'arm_result',
  AUTH_REVOKED: 'auth_revoked',
  JOYSTICK_ACQUIRED: 'joystick_acquired',
  JOYSTICK_RELEASED: 'joystick_released',
  JOYSTICK_ERROR: 'joystick_error',
  // Client → Server
  EMERGENCY_STOP: 'emergency_stop',
  JOYSTICK_ACQUIRE: 'joystick_acquire',
  JOYSTICK_COMMAND: 'joystick_command',
  JOYSTICK_RELEASE: 'joystick_release',
} as const;

export type Px4SocketEvent = typeof PX4_SOCKET_EVENTS[keyof typeof PX4_SOCKET_EVENTS];

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
