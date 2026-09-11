/**
 * Start eligibility after a mission is already stored on the rover.
 *
 * LOAD/upload stores the CSV. COMPLETED/STOPPED must not force another
 * upload. If mission-manager dropped `ready`, GCS may PREPARE the stored
 * CSV and then START.
 */

export const ACTIVE_MISSION_STATES = [
  "RUNNING",
  "PAUSED",
  "WAITING_FOR_NEXT",
  "ARMING",
  "SWITCHING_OFFBOARD",
  "LOADING",
] as const;

export const RERUN_PREPARE_STATES = [
  "COMPLETED",
  "STOPPED",
  "FAILED",
  "ERROR",
  "READY",
] as const;

export type MissionStartEligibility = {
  canPressStart: boolean;
  needsPrepare: boolean;
  reason: string | null;
};

function normalizeState(state: string | null | undefined): string {
  return String(state ?? "")
    .trim()
    .toUpperCase();
}

function normalizeMode(mode: string | null | undefined): string {
  return String(mode ?? "")
    .trim()
    .toUpperCase();
}

export function isActiveMissionState(
  state: string | null | undefined,
): boolean {
  return (ACTIVE_MISSION_STATES as readonly string[]).includes(
    normalizeState(state),
  );
}

export function isRerunPrepareState(
  state: string | null | undefined,
): boolean {
  const normalized = normalizeState(state);
  return (
    normalized === "" ||
    (RERUN_PREPARE_STATES as readonly string[]).includes(normalized)
  );
}

export function getMissionStartEligibility(input: {
  connected: boolean;
  loaded: boolean;
  ready: boolean;
  state: string | null | undefined;
  mode: string | null | undefined;
  joystickActive?: boolean;
  controlOwner?: string | null;
}): MissionStartEligibility {
  const mode = normalizeMode(input.mode);
  const state = normalizeState(input.state);
  const joystickOwns =
    input.joystickActive === true ||
    String(input.controlOwner ?? "")
      .trim()
      .toLowerCase() === "joystick";

  if (!input.connected) {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "Rover is not connected.",
    };
  }

  if (!input.loaded) {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "Upload and prepare a mission before starting.",
    };
  }

  if (mode !== "AUTO" && mode !== "MANUAL") {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "Select AUTO or MANUAL before starting.",
    };
  }

  if (joystickOwns) {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "Release manual drive before starting the mission.",
    };
  }

  if (isActiveMissionState(state)) {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "Mission is already running.",
    };
  }

  if (state === "PREPARING") {
    return {
      canPressStart: false,
      needsPrepare: false,
      reason: "The mission trajectory is still preparing.",
    };
  }

  if (input.ready === true) {
    return {
      canPressStart: true,
      needsPrepare: false,
      reason: null,
    };
  }

  if (isRerunPrepareState(state)) {
    return {
      canPressStart: true,
      needsPrepare: true,
      reason: null,
    };
  }

  return {
    canPressStart: false,
    needsPrepare: false,
    reason: "The mission file is stored, but its trajectory is not ready.",
  };
}

export function shouldSkipExecutionModePost(
  currentMode: string | null | undefined,
  requestedMode: "AUTO" | "MANUAL",
): boolean {
  return normalizeMode(currentMode) === requestedMode;
}

const SAFETY_PAUSE_REASON =
  /RTK|ODOM|GPS|FAILSAFE|GEOFENCE/;

/**
 * After Start, the rover can sit in PAUSED because a previous
 * Complete/Stop latched the shared STOP contract. That leftover
 * pause is cleared with Resume. Safety pauses must stay paused.
 */
export function shouldAutoResumeAfterStart(input: {
  state: string | null | undefined;
  resumeAvailable?: boolean | null;
  pauseReason?: string | null;
  emergencyStop?: boolean | null;
}): boolean {
  if (normalizeState(input.state) !== "PAUSED") {
    return false;
  }

  if (input.emergencyStop === true) {
    return false;
  }

  if (input.resumeAvailable !== true) {
    return false;
  }

  const reason = normalizeState(input.pauseReason);
  if (reason && SAFETY_PAUSE_REASON.test(reason)) {
    return false;
  }

  return true;
}
