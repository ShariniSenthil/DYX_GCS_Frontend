/**
 * 4-Wheel Verified Mission Types
 *
 * Frontend types for the verified-GPS mission flow. Reconciled against the
 * implemented 4WD_SERVER contract (server/models.py, server/routes/
 * verified_mission.py, server/verified_mission/*):
 *
 *   POST /api/mission/verified-waypoints  → UploadVerifiedMissionResponse
 *   GET  /api/mission/verified/{id}       → GetVerifiedMissionResponse
 *   POST /api/mission/start { mission_id } → VerifiedMissionStartResponse
 *   POST /api/mission/clear                → VerifiedMissionClearResponse
 *   socket `target_event`                  → VerifiedTargetEvent
 *
 * No imports from src/types/px4/ — intentionally independent.
 */

// ── Verified Waypoint ──────────────────────────────────────────────────────────

/**
 * One GPS target in the verified mission request.
 * All waypoints in an UploadVerifiedMissionRequest must be fully valid —
 * the upload is rejected if any validation errors exist.
 */
export interface VerifiedWaypoint {
  /** 0-based ordered position within the mission. */
  index: number;
  lat: number;
  lon: number;
  /** Ellipsoidal altitude in metres. 0 when not surveyed. */
  alt: number;
  /**
   * Whether the rover must perform a mark/spray action at this point.
   * REQUIRED — this field is never undefined in an uploadable VerifiedWaypoint.
   * Value is preserved exactly from the source PathPlanWaypoint.mark.
   */
  mark: boolean;
  /** Per-point dwell override in seconds. Omit to use global mission setting. */
  dwell_s?: number;
  /** Source metadata — preserved from parser output for progress display. */
  block?: string;
  row?: string;
  pile?: string;
  /** Human-readable combined label, e.g. "B1-R3-P7". */
  label?: string;
}

// ── Upload request / response ──────────────────────────────────────────────────

/** Body for POST /api/mission/verified-waypoints (FOURWD_MISSION.UPLOAD_WAYPOINTS) */
export interface UploadVerifiedMissionRequest {
  mission_name: string;
  /** Ordered GPS targets. Every waypoint must pass validation before upload. */
  waypoints: VerifiedWaypoint[];
  settings?: VerifiedMissionSettings;
}

export interface VerifiedMissionSettings {
  /** Travel speed in m/s. Backend uses default if omitted. */
  speed_ms?: number;
  /** Global dwell time at each mark point in seconds. */
  dwell_s?: number;
  /** Mission execution mode, e.g. 'DGPS Mark' | 'Auto' | 'Manual'. */
  mode?: string;
}

/**
 * Response from POST /api/mission/verified-waypoints.
 * Confirmed shape: server/models.py::UploadVerifiedMissionResponse.
 */
export interface UploadVerifiedMissionResponse {
  success: boolean;
  mission_id: string;
  total_targets: number;
  mission_name?: string;
  message?: string;
}

// ── GET /api/mission/verified/{mission_id} ─────────────────────────────────────

/**
 * Live state of a stored verified mission.
 * Confirmed enum: server/models.py::GetVerifiedMissionResponse.state.
 */
export type VerifiedMissionState =
  | 'stored'
  | 'loaded'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Response from GET /api/mission/verified/{mission_id}.
 * Confirmed shape: server/models.py::GetVerifiedMissionResponse.
 */
export interface GetVerifiedMissionResponse {
  mission_id: string;
  mission_name: string;
  total_targets: number;
  waypoints?: VerifiedWaypoint[];
  created_at?: string;
  state: VerifiedMissionState;
}

// ── Start ─────────────────────────────────────────────────────────────────────

/** Body for POST /api/mission/start when starting a verified mission. */
export interface StartVerifiedMissionRequest {
  mission_id: string;
}

/**
 * Response from POST /api/mission/start for a verified mission.
 * Confirmed shape: server/routes/mission.py::start_mission returns
 *   { state: MissionState, message: string }
 * on HTTP 200. There is NO `success` field — a 200 response with a non-error
 * `state` is success; failures are raised as HTTP 404/409/422/503.
 * `success` is kept optional only to tolerate alternate transports.
 */
export interface VerifiedMissionStartResponse {
  /** MissionState value, e.g. "running" | "arming" | "switching_offboard". */
  state?: string;
  message?: string;
  success?: boolean;
}

/**
 * Post-clear controller snapshot (subset of LoadedPathResponse).
 * Confirmed shape: server/models.py::LoadedPathResponse.
 */
export interface VerifiedLoadedPathSummary {
  loaded: boolean;
  name?: string | null;
  mission_id?: string | null;
  state?: string;
  num_waypoints?: number;
}

/**
 * Response from POST /api/mission/clear.
 * Confirmed shape: server/models.py::MissionClearResponse →
 *   { cleared: boolean, status: LoadedPathResponse }
 * There is NO `success` field. A 409 (ConflictError) is raised when a mission
 * is running and must be stopped first.
 */
export interface VerifiedMissionClearResponse {
  cleared: boolean;
  status: VerifiedLoadedPathSummary;
}

// ── Per-target socket events ───────────────────────────────────────────────────

/**
 * Event type strings in the `target_event` socket payload.
 * These correspond to the ORIGINAL stop/mark targets, not travel waypoints.
 * Confirmed enum: server/models.py::VerifiedTargetEvent.event_type.
 */
export type VerifiedTargetEventType =
  | 'target_active'     // rover started leg toward this target
  | 'target_arrived'    // rover inside proximity threshold
  | 'target_settling'   // waiting for RTK accuracy to stabilise
  | 'target_marking'    // spray/mark action executing
  | 'target_completed'  // target fully finished, rover advances
  | 'target_failed'     // rover could not reach or mark target
  | 'target_skipped'    // operator-requested skip
  | 'target_stopped'    // mission stopped mid-target
  | 'target_aborted';   // mission hard-aborted

/**
 * Payload of a single `target_event` socket emission.
 * Confirmed shape: server/models.py::VerifiedTargetEvent.
 */
export interface VerifiedTargetEvent {
  /**
   * Monotonic, 1-based event id assigned by the backend journal on append.
   * Used for ordering / idempotency / terminal-wins guards.
   * Defaults to 0 in the backend model before assignment.
   */
  event_id?: number;
  /** 0-based index into the original uploaded VerifiedWaypoint array. */
  target_index: number;
  /** Same mission_id returned by upload. Used to discard stale events. */
  mission_id: string;
  event_type: VerifiedTargetEventType;
  /** ISO timestamp from backend. */
  timestamp: string;
  /**
   * TRUE when this event signals the end of the entire mission.
   * This is the gate for mission-terminal detection. The frontend NEVER infers
   * mission completion from target_index alone.
   */
  terminal?: boolean;
  /**
   * Authoritative mission outcome on a terminal event. Confirmed field:
   * server/models.py::VerifiedTargetEvent.mission_outcome. When present this is
   * preferred over the event_type→outcome mapping; an unknown value fails closed.
   */
  mission_outcome?: VerifiedMissionTerminalOutcome;
  /** Achieved GPS position — present on arrived / completed / failed events. */
  lat?: number;
  lon?: number;
  /** Human-readable error or context string. */
  reason?: string;
  message?: string;
}

// ── Per-target status (in-memory) ─────────────────────────────────────────────

/**
 * Per-target status values maintained by useVerifiedMissionProgress.
 * Each is semantically distinct — failed/aborted/stopped are NEVER collapsed.
 */
export type VerifiedTargetStatusKey =
  | 'pending'
  | 'active'
  | 'arrived'
  | 'settling'
  | 'marking'
  | 'completed'
  | 'failed'    // hard failure — distinct from skipped
  | 'skipped'   // operator-requested skip
  | 'stopped'   // mission stopped while this target was active — distinct from passed
  | 'aborted';  // hard abort — distinct from skipped

export interface VerifiedTargetStatusEntry {
  status: VerifiedTargetStatusKey;
  timestamp: string;
  lat_achieved?: number;
  lon_achieved?: number;
  reason?: string;
  message?: string;
  /** The raw event type that produced this status — preserved for debugging. */
  eventType: VerifiedTargetEventType;
  /** Backend journal event_id that produced this entry (ordering/idempotency). */
  eventId?: number;
}

// ── Mission terminal outcome ───────────────────────────────────────────────────

/**
 * Terminal outcome for the WHOLE mission. Each value is distinct.
 * Never map failed or aborted to any other value before acting on it.
 */
export type VerifiedMissionTerminalOutcome =
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'stopped';
