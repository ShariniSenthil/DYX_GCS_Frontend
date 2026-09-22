/**
 * Mission lifecycle comparison and authority helpers.
 *
 * Pure, React-free. Two sources describe the same backend mission state:
 *
 *   - REST `MissionRuntimeState` (command responses, status polling)
 *   - Socket.IO `mission_status` pushed on every backend telemetry tick
 *
 * Both are built by the backend's `build_mission_status_payload()`, so they
 * share field names. Dedupe must never hide a lifecycle change (e.g. PAUSED
 * with resume_available false -> true), and a socket snapshot may only drive
 * Resume when it describes the same mission run as the REST snapshot.
 */

/** Lifecycle fields that must invalidate a REST `backendMission` snapshot. */
export const MISSION_RUNTIME_LIFECYCLE_KEYS = [
  "state",
  "loaded",
  "ready",
  "execution_mode",
  "mission_id",
  "mission_run_id",
  "current_point_index",
  "active_point_index",
  "active_point_id",
  "trajectory_ready",
  "progress_pct",
  "progress_percent",
  "resume_available",
  "pause_reason",
  "rtk_motion_ok",
  "rtk_reason",
  "mission_enable",
  "emergency_stop",
  "px4_mode",
  "px4_armed",
  "start_stage",
  "start_failed_stage",
  "resume_stage",
  "stop_stage",
  "message",
  "error",
] as const;

type LifecycleRecord = Record<string, unknown>;

function sameOnKeys(
  previous: LifecycleRecord,
  next: LifecycleRecord,
  keys: readonly string[],
): boolean {
  for (const key of keys) {
    if (!Object.is(previous[key], next[key])) {
      return false;
    }
  }
  return true;
}

/**
 * True when two REST mission snapshots agree on every lifecycle field, so
 * the previous React state object can be kept. High-rate telemetry fields
 * are deliberately ignored.
 */
export function isSameMissionRuntimeLifecycle(
  previous: LifecycleRecord | null | undefined,
  next: LifecycleRecord | null | undefined,
): boolean {
  if (!previous || !next) {
    return previous === next;
  }
  return sameOnKeys(previous, next, MISSION_RUNTIME_LIFECYCLE_KEYS);
}

/** Socket.IO lifecycle slice shared through TelemetryContext. */
export interface MissionLifecycleSlice {
  state?: string;
  state_lower?: string;
  mission_id?: string | null;
  mission_run_id?: string | null;
  start_stage?: string | null;
  start_failed_stage?: string | null;
  resume_stage?: string | null;
  stop_stage?: string | null;
  resume_available?: boolean;
  pause_reason?: string | null;
  rtk_motion_ok?: boolean;
  rtk_reason?: string | null;
  mission_enable?: boolean;
  emergency_stop?: boolean;
  px4_mode?: string | null;
  px4_armed?: boolean;
  /** Local monotonic-ish receive time (Date.now()); not compared. */
  received_at_ms?: number;
}

export const MISSION_LIFECYCLE_SLICE_KEYS = [
  "state",
  "state_lower",
  "mission_id",
  "mission_run_id",
  "start_stage",
  "start_failed_stage",
  "resume_stage",
  "stop_stage",
  "resume_available",
  "pause_reason",
  "rtk_motion_ok",
  "rtk_reason",
  "mission_enable",
  "emergency_stop",
  "px4_mode",
  "px4_armed",
] as const satisfies readonly (keyof MissionLifecycleSlice)[];

/** Receive time is excluded: a repeated packet is not a lifecycle change. */
export function isSameMissionLifecycleSlice(
  previous: MissionLifecycleSlice,
  next: MissionLifecycleSlice,
): boolean {
  return sameOnKeys(
    previous as LifecycleRecord,
    next as LifecycleRecord,
    MISSION_LIFECYCLE_SLICE_KEYS,
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Build a lifecycle slice from a Socket.IO `mission_status` payload. */
export function buildMissionLifecycleSlice(
  event: LifecycleRecord,
  receivedAtMs: number,
): MissionLifecycleSlice {
  const state = typeof event.state === "string" ? event.state : undefined;
  const stateLower =
    typeof event.state_lower === "string"
      ? event.state_lower
      : state?.toLowerCase();
  return {
    state,
    state_lower: stateLower,
    mission_id: optionalString(event.mission_id),
    mission_run_id: optionalString(event.mission_run_id),
    start_stage: optionalString(event.start_stage),
    start_failed_stage: optionalString(event.start_failed_stage),
    resume_stage: optionalString(event.resume_stage),
    stop_stage: optionalString(event.stop_stage),
    resume_available: optionalBoolean(event.resume_available),
    pause_reason: optionalString(event.pause_reason),
    rtk_motion_ok: optionalBoolean(event.rtk_motion_ok),
    rtk_reason: optionalString(event.rtk_reason),
    mission_enable: optionalBoolean(event.mission_enable),
    emergency_stop: optionalBoolean(event.emergency_stop),
    px4_mode: optionalString(event.px4_mode),
    px4_armed: optionalBoolean(event.px4_armed),
    received_at_ms: receivedAtMs,
  };
}

function normalizedIdentity(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A socket slice describes the active REST mission only when mission_id
 * matches and mission_run_id matches exactly (both absent counts as equal).
 * A socket run id without a REST run id — or the reverse — is not a match:
 * a stale event from an earlier run of the same mission must not authorize
 * Resume.
 */
export function socketLifecycleMatchesMission(
  slice: MissionLifecycleSlice | null | undefined,
  mission: LifecycleRecord | null | undefined,
): boolean {
  if (!slice || !mission) {
    return false;
  }
  const socketMissionId = normalizedIdentity(slice.mission_id);
  if (!socketMissionId) {
    return false;
  }
  if (socketMissionId !== normalizedIdentity(mission.mission_id)) {
    return false;
  }
  return (
    normalizedIdentity(slice.mission_run_id) ===
    normalizedIdentity(mission.mission_run_id)
  );
}

export interface EffectiveMissionLifecycle {
  source: "socket" | "rest" | "none";
  state: string | null;
  resumeAvailable: boolean;
  /** Upper-cased, trimmed; null when absent. */
  pauseReason: string | null;
  rtkReason: string | null;
  rtkMotionOk: boolean | null;
  startStage: string | null;
  resumeStage: string | null;
  stopStage: string | null;
}

function upperOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function nonEmptyOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

/**
 * One authoritative lifecycle view for Mission Report buttons.
 *
 * The whole view comes from a single source, never a field-wise mix, so
 * `state` and `resumeAvailable` cannot disagree. The socket slice wins when
 * its identity matches the REST mission and it is at least as recent as the
 * last REST snapshot; otherwise REST is used. A REST command response that
 * arrives after the last push (e.g. RESUME -> RUNNING) therefore is not
 * overridden by an older PAUSED push.
 */
export function resolveEffectiveMissionLifecycle(
  slice: MissionLifecycleSlice | null | undefined,
  mission: LifecycleRecord | null | undefined,
  missionReceivedAtMs: number | null | undefined,
): EffectiveMissionLifecycle {
  const socketUsable =
    socketLifecycleMatchesMission(slice, mission) &&
    (missionReceivedAtMs == null ||
      (slice?.received_at_ms ?? -Infinity) >= missionReceivedAtMs);

  if (socketUsable && slice) {
    return {
      source: "socket",
      state: upperOrNull(slice.state),
      resumeAvailable: slice.resume_available === true,
      pauseReason: upperOrNull(slice.pause_reason),
      rtkReason: nonEmptyOrNull(slice.rtk_reason),
      rtkMotionOk:
        typeof slice.rtk_motion_ok === "boolean" ? slice.rtk_motion_ok : null,
      startStage: upperOrNull(slice.start_stage),
      resumeStage: upperOrNull(slice.resume_stage),
      stopStage: upperOrNull(slice.stop_stage),
    };
  }

  if (!mission) {
    return {
      source: "none",
      state: null,
      resumeAvailable: false,
      pauseReason: null,
      rtkReason: null,
      rtkMotionOk: null,
      startStage: null,
      resumeStage: null,
      stopStage: null,
    };
  }

  return {
    source: "rest",
    state: upperOrNull(mission.state),
    resumeAvailable: mission.resume_available === true,
    pauseReason: upperOrNull(mission.pause_reason),
    rtkReason: nonEmptyOrNull(mission.rtk_reason),
    rtkMotionOk:
      typeof mission.rtk_motion_ok === "boolean" ? mission.rtk_motion_ok : null,
    startStage: upperOrNull(mission.start_stage),
    resumeStage: upperOrNull(mission.resume_stage),
    stopStage: upperOrNull(mission.stop_stage),
  };
}
