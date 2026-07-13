/**
 * Feature Flags — 4WD_SERVER Migration
 *
 * Controls which backend contract the app uses at runtime.
 * Set EXPO_PUBLIC_ROVER_ENABLED=true in your .env to activate PX4 mode.
 *
 * Usage:
 *   import { isPx4DxpEnabled } from './featureFlags';
 *   if (isPx4DxpEnabled()) { ... }
 */

const boolEnv = (key: string): boolean => {
  const val = process.env[key];
  if (val === undefined || val === null) return false;
  return val.toLowerCase() === 'true' || val === '1';
};

// ── Primary gate ─────────────────────────────────────────────────────────────
/** True when the 4WD_SERVER backend contract is active. */
export const ROVER_ENABLED: boolean = boolEnv('EXPO_PUBLIC_ROVER_ENABLED');

/** True when legacy ArduRover paths should be used (mutually exclusive with PX4). */
export const LEGACY_ARDUROVER_ENABLED: boolean = !ROVER_ENABLED;

// ── Per-feature gates (all follow ROVER_ENABLED by default) ───────────────

/**
 * Auth gate — show password on connect + inject X-Rover-Token.
 * Only active when ROVER_ENABLED=true or EXPO_PUBLIC_AUTH_ENABLED=true.
 * In 4WD_CLIENT (ROVER_ENABLED=false) auth is skipped — no auth backend available.
 */
export const AUTH_ENABLED: boolean =
  process.env.EXPO_PUBLIC_AUTH_DISABLED?.toLowerCase() !== 'true' &&
  (ROVER_ENABLED || boolEnv('EXPO_PUBLIC_AUTH_ENABLED'));

/** Server-side mission staging pipeline (plan → stage → load). */
export const MISSION_STAGING_ENABLED: boolean =
  ROVER_ENABLED || boolEnv('EXPO_PUBLIC_MISSION_STAGING_ENABLED');

/** Spray-mode sidecar API (continuous / dash / point via path name). */
export const SPRAY_MODE_SIDECAR_ENABLED: boolean =
  ROVER_ENABLED || boolEnv('EXPO_PUBLIC_SPRAY_MODE_SIDECAR_ENABLED');

/**
 * Point lifecycle API (continue / skip / event journal).
 * Default ON on this branch (NRP handlers disabled); set EXPO_PUBLIC_POINT_MISSION_DISABLED=true to off.
 */
export const POINT_MISSION_ENABLED: boolean =
  process.env.EXPO_PUBLIC_POINT_MISSION_DISABLED?.toLowerCase() !== 'true';

/** Joystick V2 lease protocol (acquire → command → release). */
export const JOYSTICK_V2_ENABLED: boolean =
  ROVER_ENABLED || boolEnv('EXPO_PUBLIC_JOYSTICK_V2_ENABLED');

/**
 * TEMP — offline joystick UI preview bypass.
 * When true + isOfflineMode(), manual drive opens without backend arm/lease.
 * Remove or set false after UI verification.
 */
export const JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS = true;

/** Hard mission abort endpoint. */
export const MISSION_ABORT_ENABLED: boolean =
  ROVER_ENABLED || boolEnv('EXPO_PUBLIC_MISSION_ABORT_ENABLED');

/** RTK path fixes (slash-separated URL segments). */
export const RTK_PX4_PATHS_ENABLED: boolean =
  ROVER_ENABLED || boolEnv('EXPO_PUBLIC_RTK_PX4_PATHS_ENABLED');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convenience accessor (for callers that prefer function call syntax). */
export function isPx4DxpEnabled(): boolean {
  return ROVER_ENABLED;
}

export function isAuthEnabled(): boolean {
  return AUTH_ENABLED;
}

export function isMissionStagingEnabled(): boolean {
  return MISSION_STAGING_ENABLED;
}

export function isSprayModeSidecarEnabled(): boolean {
  return SPRAY_MODE_SIDECAR_ENABLED;
}

export function isPointMissionEnabled(): boolean {
  return POINT_MISSION_ENABLED;
}

export function isJoystickV2Enabled(): boolean {
  return JOYSTICK_V2_ENABLED;
}

export function isMissionAbortEnabled(): boolean {
  return MISSION_ABORT_ENABLED;
}

export default {
  ROVER_ENABLED,
  LEGACY_ARDUROVER_ENABLED,
  AUTH_ENABLED,
  MISSION_STAGING_ENABLED,
  SPRAY_MODE_SIDECAR_ENABLED,
  POINT_MISSION_ENABLED,
  JOYSTICK_V2_ENABLED,
  MISSION_ABORT_ENABLED,
  RTK_PX4_PATHS_ENABLED,
  isPx4DxpEnabled,
  isAuthEnabled,
  isMissionStagingEnabled,
  isSprayModeSidecarEnabled,
  isPointMissionEnabled,
  isJoystickV2Enabled,
  isMissionAbortEnabled,
};
