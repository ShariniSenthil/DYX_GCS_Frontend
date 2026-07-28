/**
 * Backend Configuration for React Native Mobile App
 *
 * Environment variables:
 * - VITE_ROS_HTTP_BASE: Backend HTTP base URL (e.g., http://192.168.1.101:5001)
 * - VITE_ROS_WS_URL: WebSocket URL (e.g., ws://192.168.1.101:5001/ws/telemetry)
 *
 * Dynamic URL Configuration:
 * - Backend URL can be set at runtime via setBackendURL()
 * - Saved URL is loaded from AsyncStorage on app start
 * - Falls back to environment variables or defaults
 */

import { getSavedBackendURL } from "./utils/backendStorage";

// Default fallback values (supports multiple env variable names).
// The hardcoded IP is a last-resort development fallback only — in production
// the URL is always set via env vars or runtime setBackendURL().
// Do NOT rely on this value in production builds.
// Default DYX rover backend address.
// A rover selected through discovery or manual entry overrides this value.
const DEFAULT_BACKEND_URL =
  process.env.REACT_APP_ROS_HTTP_BASE ||
  process.env.EXPO_PUBLIC_ROS_HTTP_BASE ||
  process.env.VITE_ROS_HTTP_BASE ||
  "http://192.168.3.101:5001";

const DEFAULT_WS_URL =
  process.env.REACT_APP_ROS_WS_URL ||
  process.env.EXPO_PUBLIC_ROS_WS_URL ||
  process.env.VITE_ROS_WS_URL ||
  "ws://192.168.3.101:5001";

// Runtime-selected backend address.
let dynamicBackendURL: string | null = null;
let dynamicWsURL: string | null = null;
let _offlineMode = false;

/**
 * Remove trailing slashes so endpoint construction remains consistent.
 */
function normalizeBackendURL(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Convert an HTTP backend address into a WebSocket address.
 */
function createWebSocketURL(backendURL: string): string {
  return normalizeBackendURL(backendURL)
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");
}

/**
 * Restore the previously selected rover address from AsyncStorage.
 *
 * Failure to read storage does not clear the saved authentication session.
 */
export async function initializeBackendURL(): Promise<void> {
  try {
    const savedURL = await getSavedBackendURL();

    if (savedURL) {
      const normalizedURL = normalizeBackendURL(savedURL);

      dynamicBackendURL = normalizedURL;

      dynamicWsURL = createWebSocketURL(normalizedURL);

      _offlineMode =
        normalizedURL.includes("localhost") ||
        normalizedURL.includes("127.0.0.1");

      return;
    }
  } catch (error) {
    console.warn("[config] Could not restore saved backend URL:", error);
  }

  dynamicBackendURL = normalizeBackendURL(DEFAULT_BACKEND_URL);

  dynamicWsURL = createWebSocketURL(DEFAULT_WS_URL);

  _offlineMode = false;
}

/**
 * Set the active rover backend address.
 */
export function setBackendURL(url: string): void {
  const normalizedURL = normalizeBackendURL(url);

  dynamicBackendURL = normalizedURL;

  dynamicWsURL = createWebSocketURL(normalizedURL);

  _offlineMode =
    normalizedURL.includes("localhost") || normalizedURL.includes("127.0.0.1");
}

/**
 * Check whether the application is using offline preview mode.
 */
export function isOfflineMode(): boolean {
  return _offlineMode;
}

/**
 * Return the currently selected backend HTTP address.
 */
export function getBackendURL(): string {
  return dynamicBackendURL || normalizeBackendURL(DEFAULT_BACKEND_URL);
}

/**
 * Return the currently selected backend WebSocket address.
 *
 * Socket.IO still uses the configured `/socket.io/` path separately.
 */
export function getWsURL(): string {
  return dynamicWsURL || createWebSocketURL(DEFAULT_WS_URL);
}

/**
 * The full URL for the backend API (Socket.IO and HTTP endpoints)
 * @deprecated Use getBackendURL() instead for dynamic URL support
 */
export const BACKEND_URL = DEFAULT_BACKEND_URL;

/**
 * WebSocket URL for real-time telemetry
 * @deprecated Use getWsURL() instead for dynamic URL support
 */
export const WS_URL = DEFAULT_WS_URL;

/**
 * Socket.IO configuration options
 * Optimized for high-frequency telemetry data
 */
export const SOCKET_CONFIG = {
  /*
   * Establish a reliable HTTP polling connection first,
   * then upgrade to WebSocket automatically.
   */
  transports: ["polling", "websocket"],

  reconnection: false,

  timeout: 10000,

  autoConnect: false,

  path: "/socket.io/",

  upgrade: true,

  /*
   * Do not reuse an earlier failed WebSocket decision.
   */
  rememberUpgrade: false,

  /*
   * Do not reuse a manager containing an old authentication token.
   */
  forceNew: true,
  multiplex: false,
};
/**
 * NRP_ROS / ArduRover legacy API catalog — DISABLED (reference only).
 * Do not call these routes; use PX4_API_ENDPOINTS / px4Endpoints.ts instead.
 *
 * MISSION_UPLOAD: '/api/mission/upload',
 * MISSION_LOAD: '/api/mission/load',              // client waypoint upload
 * MISSION_LOAD_CONTROLLER: '/api/mission/load_controller',
 * MISSION_DOWNLOAD: '/api/mission/download',
 * MISSION_NEXT: '/api/mission/next',
 * MISSION_COMMAND: '/api/mission/command',        // bulk_skip
 * MISSION_SET_CURRENT: '/api/mission/set_current',
 * RTK_NTRIP_START: '/api/rtk/ntrip_start',
 * RTK_NTRIP_STOP: '/api/rtk/ntrip_stop',
 * RTK_LORA_START: '/api/rtk/lora_start',
 * RTK_LORA_STOP: '/api/rtk/lora_stop',
 * RTK_INJECT: '/api/rtk/inject',
 * SERVO_CONTROL: '/api/servo/control',
 * SERVO_EMERGENCY_STOP: '/servo/emergency_stop',
 * SERVO_STATUS: '/servo/status',
 * MISSION_SERVO_CONFIG: '/api/mission/servo_config',
 * ACTIVITY_TYPES: '/api/activity/types',
 * ACTIVITY_DOWNLOAD: '/api/activity/download',
 * NODES_LIST: '/api/nodes',
 * NODE_DETAILS: '/api/node/{name}',
 * TTS_*: '/api/tts/*',
 * LED_STATUS: '/api/led/status',
 * PARAMS_GROUPS: '/api/params/groups',
 * PARAMS_DOWNLOAD: '/api/params/download',
 * PARAMS_UPLOAD: '/api/params/upload',
 * QUICKTUNE_*: '/api/quicktune/*',
 * MISSION_CONFIG: '/api/mission/config',
 * SPRAYER_CONFIG: '/api/config/sprayer',
 */

/**
 * Active API catalog — 4WD_SERVER canonical paths.
 * Alias kept as API_ENDPOINTS for backward-compatible imports.
 */
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: "/api/auth/login",
  AUTH_LOGOUT: "/api/auth/logout",
  AUTH_CHANGE_PASSWORD: "/api/auth/change-password",
  // System
  PING: "/api/ping",
  HEALTHZ: "/api/healthz",
  // Telemetry
  TELEMETRY_LATEST: "/api/telemetry/latest",
  // Vehicle
  ARM: "/api/arm",
  SET_MODE: "/api/set_mode",
  ESTOP: "/api/estop",
  // Mission
  MISSION_START: "/api/mission/start",
  MISSION_STOP: "/api/mission/stop",
  MISSION_ABORT: "/api/mission/abort",
  MISSION_PAUSE: "/api/mission/pause",
  MISSION_RESUME: "/api/mission/resume",
  MISSION_RESTART: "/api/mission/restart",
  MISSION_CLEAR: "/api/mission/clear",
  MISSION_STATUS: "/api/mission/status",
  MISSION_LOADED_PATH: "/api/mission/loaded-path",
  POINT_CONTINUE: "/api/mission/point/continue",
  POINT_SKIP: "/api/mission/point/skip",
  POINT_EVENTS: "/api/mission/point/events",
  POINT_STATUS: "/api/mission/point/status",
  // Path staging
  PATHS_LIST: "/api/paths",
  PATH_LOAD_TO_CONTROLLER: "/api/path/load-to-controller",
  // RTK (slash-separated paths)
  RTK_STATUS: "/api/rtk/status",
  RTK_STOP: "/api/rtk/stop",
  RTK_NTRIP_START: "/api/rtk/ntrip/start",
  RTK_LORA_START: "/api/rtk/lora/start",
  RTK_LORA_STOP: "/api/rtk/lora/stop",
  // Spray
  SPRAY_STATUS: "/api/spray/status",
  // Activity
  ACTIVITY_LOGS: "/api/activity",
  ACTIVITY: "/api/activity",
};

/**
 * NRP_ROS / ArduRover legacy Socket.IO events — DISABLED (reference only).
 *
 * ROVER_DATA: 'rover_data',
 * MISSION_EVENT: 'mission_event',              // waypoint_reached, etc.
 * MISSION_COMMAND_ACK: 'mission_command_ack',
 * MISSION_CONTROLLER_STATUS: 'mission_controller_status',
 * MISSION_UPLOAD_PROGRESS: 'mission_upload_progress',
 * MISSION_DOWNLOAD_PROGRESS: 'mission_download_progress',
 * FAILSAFE_RESUME_MISSION: 'failsafe_resume_mission',
 * FAILSAFE_RESTART_MISSION: 'failsafe_restart_mission',
 * FAILSAFE_RESUMED: 'failsafe_resumed',
 * FAILSAFE_RESTARTED: 'failsafe_restarted',
 * SERVER_ACTIVITY: 'server_activity',
 * MISSION_LOGS_SNAPSHOT: 'mission_logs_snapshot',
 * QUICKTUNE_LOG: 'quicktune_log',
 * subscribe_mission_status / subscribe_telemetry / subscribe_rover_data (client emits)
 * subscribe / join / subscribe_to_* / ping (client emits)
 * manual_control / stop_manual_control (client emits)
 * start_lora_rtk_stream / stop_lora_rtk_stream / get_lora_rtk_status (client emits)
 * lora_rtk_status (server listen)
 * set_obstacle_detection / set_led_controller (client emits)
 * obstacle_detection_changed / led_controller_changed (server listen)
 * emergency_stop_ack / manual_control_error (server listen)
 * set_gps_failsafe_mode / failsafe_acknowledge / request_gps_failsafe_mode (client emits)
 * servo_suppressed / failsafe_mode_changed (server listen)
 * request_mission_logs (client emit)
 */

/** Active Socket.IO event names (4WD_SERVER + shared transport). */
export const SOCKET_EVENTS = {
  TELEMETRY: "telemetry",
  MISSION_STATUS: "mission_status",
  MISSION_ERROR: "mission_error",
  POINT_MISSION_EVENT: "point_mission_event",
  MISSION_COMPLETED: "mission_completed",
  MISSION_COMPLETION_DEGRADED: "mission_completion_degraded",
  GPS_SAFETY_ABORT: "gps_safety_abort",
  SAFETY_ABORT: "safety_abort",
  ESTOP_RESULT: "estop_result",
  ARM_RESULT: "arm_result",
  AUTH_REVOKED: "auth_revoked",
  ROVER_DISCONNECTED: "rover_disconnected",
  JOYSTICK_ACQUIRED: "joystick_acquired",
  JOYSTICK_RELEASED: "joystick_released",
  JOYSTICK_ERROR: "joystick_error",
  EMERGENCY_STOP: "emergency_stop",
  JOYSTICK_ACQUIRE: "joystick_acquire",
  JOYSTICK_COMMAND: "joystick_command",
  JOYSTICK_RELEASE: "joystick_release",
};

/**
 * 4WD_SERVER Socket.IO Events (PX4 catalog — used when ROVER_ENABLED=true)
 *
 * Import from config/px4Endpoints.ts (PX4_SOCKET_EVENTS) for typed access.
 * This alias is here for convenience in files that already import from config.ts.
 */
export const PX4_SOCKET_EVENTS_COMPAT = {
  TELEMETRY: "telemetry",
  MISSION_STATUS: "mission_status",
  POINT_MISSION_EVENT: "point_mission_event",
  MISSION_COMPLETED: "mission_completed",
  MISSION_COMPLETION_DEGRADED: "mission_completion_degraded",
  GPS_SAFETY_ABORT: "gps_safety_abort",
  SAFETY_ABORT: "safety_abort",
  ESTOP_RESULT: "estop_result",
  ARM_RESULT: "arm_result",
  AUTH_REVOKED: "auth_revoked",
  JOYSTICK_ACQUIRED: "joystick_acquired",
  JOYSTICK_RELEASED: "joystick_released",
  JOYSTICK_ERROR: "joystick_error",
  EMERGENCY_STOP: "emergency_stop",
  JOYSTICK_ACQUIRE: "joystick_acquire",
  JOYSTICK_COMMAND: "joystick_command",
  JOYSTICK_RELEASE: "joystick_release",
};

/**
 * 4WD_SERVER API endpoints (canonical).
 * Use getApiCatalog() to select the correct catalog based on feature flag.
 */
export const PX4_API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: "/api/auth/login",
  AUTH_LOGOUT: "/api/auth/logout",
  AUTH_CHANGE_PASSWORD: "/api/auth/change-password",
  // System
  PING: "/api/ping",
  HEALTHZ: "/api/healthz",
  // Telemetry
  TELEMETRY_LATEST: "/api/telemetry/latest",
  // Vehicle
  ARM: "/api/arm",
  SET_MODE: "/api/set_mode",
  ESTOP: "/api/estop",
  // Mission
  MISSION_START: "/api/mission/start",
  MISSION_STOP: "/api/mission/stop",
  MISSION_ABORT: "/api/mission/abort",
  MISSION_PAUSE: "/api/mission/pause",
  MISSION_RESUME: "/api/mission/resume",
  MISSION_RESTART: "/api/mission/restart",
  MISSION_CLEAR: "/api/mission/clear",
  MISSION_STATUS: "/api/mission/status",
  MISSION_LOADED_PATH: "/api/mission/loaded-path",
  POINT_CONTINUE: "/api/mission/point/continue",
  POINT_SKIP: "/api/mission/point/skip",
  POINT_EVENTS: "/api/mission/point/events",
  POINT_STATUS: "/api/mission/point/status",
  // Path staging
  PATHS_LIST: "/api/paths",
  PATH_LOAD_TO_CONTROLLER: "/api/path/load-to-controller",
  // RTK
  RTK_STATUS: "/api/rtk/status",
  RTK_STOP: "/api/rtk/stop",
  RTK_NTRIP_START: "/api/rtk/ntrip/start",
  RTK_LORA_START: "/api/rtk/lora/start",
  RTK_LORA_STOP: "/api/rtk/lora/stop",
  // Spray
  SPRAY_STATUS: "/api/spray/status",
  // Activity
  ACTIVITY: "/api/activity",
};

/**
 * getApiCatalog — return the correct API endpoint set based on feature flag.
 * Legacy code that imports API_ENDPOINTS should switch to this selector.
 */
/** Always returns the 4WD_SERVER catalog (NRP_ROS legacy catalog disabled). */
export function getApiCatalog(): typeof API_ENDPOINTS {
  return API_ENDPOINTS;
}

export default {
  BACKEND_URL,
  WS_URL,
  SOCKET_CONFIG,
  API_ENDPOINTS,
  SOCKET_EVENTS,
};
