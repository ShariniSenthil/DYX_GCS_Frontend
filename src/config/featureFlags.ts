/**
 * Feature flags for the DYX 4WD Rover frontend.
 *
 * The PX4/ROS 2 rover backend is the default backend for this application.
 * Authentication is enabled unless it is explicitly disabled through an
 * environment variable.
 */

function isTrue(
  value: string | undefined,
): boolean {
  if (!value) {
    return false;
  }

  const normalized =
    value.trim().toLowerCase();

  return (
    normalized === "true" ||
    normalized === "1"
  );
}

function isFalse(
  value: string | undefined,
): boolean {
  if (!value) {
    return false;
  }

  const normalized =
    value.trim().toLowerCase();

  return (
    normalized === "false" ||
    normalized === "0"
  );
}

// ── Main rover backend ────────────────────────────────────────────────────────

/**
 * The DYX ROS 2/PX4 rover backend is enabled by default.
 *
 * It can be disabled only by explicitly setting:
 * EXPO_PUBLIC_ROVER_ENABLED=false
 */
export const ROVER_ENABLED: boolean =
  !isFalse(
    process.env
      .EXPO_PUBLIC_ROVER_ENABLED,
  );

/**
 * Legacy ArduRover mode is disabled whenever the current rover backend is active.
 */
export const LEGACY_ARDUROVER_ENABLED: boolean =
  !ROVER_ENABLED;

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Authentication is enabled by default with the DYX rover backend.
 *
 * It can be disabled only by explicitly setting:
 * EXPO_PUBLIC_AUTH_DISABLED=true
 */
export const AUTH_ENABLED: boolean =
  !isTrue(
    process.env
      .EXPO_PUBLIC_AUTH_DISABLED,
  ) &&
  (
    ROVER_ENABLED ||
    isTrue(
      process.env
        .EXPO_PUBLIC_AUTH_ENABLED,
    )
  );

// ── Mission features ──────────────────────────────────────────────────────────

export const MISSION_STAGING_ENABLED: boolean =
  ROVER_ENABLED ||
  isTrue(
    process.env
      .EXPO_PUBLIC_MISSION_STAGING_ENABLED,
  );

export const SPRAY_MODE_SIDECAR_ENABLED: boolean =
  ROVER_ENABLED ||
  isTrue(
    process.env
      .EXPO_PUBLIC_SPRAY_MODE_SIDECAR_ENABLED,
  );

export const POINT_MISSION_ENABLED: boolean =
  !isTrue(
    process.env
      .EXPO_PUBLIC_POINT_MISSION_DISABLED,
  );

export const MISSION_ABORT_ENABLED: boolean =
  ROVER_ENABLED ||
  isTrue(
    process.env
      .EXPO_PUBLIC_MISSION_ABORT_ENABLED,
  );

// ── Joystick ──────────────────────────────────────────────────────────────────

export const JOYSTICK_V2_ENABLED: boolean =
  ROVER_ENABLED ||
  isTrue(
    process.env
      .EXPO_PUBLIC_JOYSTICK_V2_ENABLED,
  );

/**
 * Existing offline joystick-preview setting retained for now.
 */
export const JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS =
  true;

// ── RTK ───────────────────────────────────────────────────────────────────────

export const RTK_PX4_PATHS_ENABLED: boolean =
  ROVER_ENABLED ||
  isTrue(
    process.env
      .EXPO_PUBLIC_RTK_PX4_PATHS_ENABLED,
  );

// ── Helper functions ──────────────────────────────────────────────────────────

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
  JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS,
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