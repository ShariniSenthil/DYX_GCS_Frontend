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
  "LOADED",
  "EMPTY",
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

function hasStoredMissionIdentity(mission: {
  mission_id?: string | null;
  filename?: string | null;
}): boolean {
  return (
    (typeof mission.mission_id === "string" &&
      mission.mission_id.trim() !== "") ||
    (typeof mission.filename === "string" && mission.filename.trim() !== "")
  );
}

/**
 * After COMPLETED the rover auto-stop may report EMPTY / loaded=false
 * even though mission.csv is still on disk. Do not force another upload.
 */
export function isMissionStoredOnRover(mission: {
  loaded?: boolean;
  accepted_for_start?: boolean;
  state?: string | null;
  mission_id?: string | null;
  filename?: string | null;
} | null | undefined): boolean {
  if (!mission) {
    return false;
  }

  if (mission.loaded === true || mission.accepted_for_start === true) {
    return true;
  }

  if (!hasStoredMissionIdentity(mission)) {
    return false;
  }

  const state = normalizeState(mission.state);
  return (
    isRerunPrepareState(state) ||
    state === "READY" ||
    state === "PREPARING" ||
    isActiveMissionState(state)
  );
}

export function getMissionStartEligibility(input: {
  connected: boolean;
  loaded: boolean;
  state: string | null | undefined;
}): MissionStartEligibility {
  const state = normalizeState(input.state);

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
      reason: "Upload a mission before starting.",
    };
  }

  return {
    canPressStart: true,
    needsPrepare: isRerunPrepareState(state),
    reason: null,
  };
}

export function shouldSkipExecutionModePost(
  currentMode: string | null | undefined,
  requestedMode: "AUTO" | "MANUAL",
): boolean {
  return normalizeMode(currentMode) === requestedMode;
}

/**
 * START result as the operator should see it. There is deliberately no
 * automatic RESUME: a PAUSED result is authoritative (RTK, odometry, a
 * latched stop, ...) and needs the normal Resume contract.
 */
export type MissionStartOutcome =
  | { kind: "running" }
  | { kind: "paused"; pauseReason: string | null }
  | { kind: "other"; state: string };

export function classifyMissionStartOutcome(input: {
  state: string | null | undefined;
  pauseReason?: string | null;
}): MissionStartOutcome {
  const state = normalizeState(input.state);
  if (state === "PAUSED") {
    const reason = normalizeState(input.pauseReason);
    return { kind: "paused", pauseReason: reason || null };
  }
  if (state === "RUNNING") {
    return { kind: "running" };
  }
  return { kind: "other", state };
}
