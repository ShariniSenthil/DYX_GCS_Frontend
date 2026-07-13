/**
 * FOURWD_GCS Endpoint Constants — 4-wheel verified mission flow.
 *
 * All REST paths and socket event names for the verified-mission flow live here.
 * Change endpoint or event strings in this one file after 4WD_SERVER is finalized.
 *
 * Rules:
 * - Paths are path-only (no host). apiClient prepends getBackendURL().
 * - Nothing in this file imports from px4Endpoints.ts.
 * - Nothing in px4Endpoints.ts imports from this file.
 */

// ── REST endpoints ────────────────────────────────────────────────────────────

export const FOURWD_MISSION = {
  /** POST — upload ordered GPS waypoints for 4-wheel execution.
   *  Body: UploadVerifiedMissionRequest
   *  Response: UploadVerifiedMissionResponse */
  UPLOAD_WAYPOINTS: '/api/mission/verified-waypoints',

  /** GET — confirm a stored verified mission by ID.
   *  Response: GetVerifiedMissionResponse */
  GET: (missionId: string) =>
    `/api/mission/verified/${encodeURIComponent(missionId)}`,

  /** POST — start the loaded verified mission.
   *  Body: StartVerifiedMissionRequest
   *  Response: VerifiedMissionStartResponse — { state, message } on HTTP 200. */
  START: '/api/mission/start',

  /** POST — clear the loaded verified mission from the controller.
   *  Response: VerifiedMissionClearResponse — { cleared, status }. 409 if running. */
  CLEAR: '/api/mission/clear',

  /** POST — stop a running mission. */
  STOP: '/api/mission/stop',

  /** POST — pause a running mission. */
  PAUSE: '/api/mission/pause',

  /** POST — resume a paused mission. */
  RESUME: '/api/mission/resume',
} as const;

// ── Socket event names ────────────────────────────────────────────────────────

export const FOURWD_SOCKET_EVENTS = {
  /**
   * Per-target lifecycle event emitted by 4WD_SERVER.
   * Payload shape: VerifiedTargetEvent (src/types/fourwd/mission.ts).
   * Confirmed: server/verified_mission/adapter.py emits via the target-event
   * journal under this exact event name.
   */
  TARGET_EVENT: 'target_event',

  /**
   * Confirmed: 4WD_SERVER does NOT emit a separate mission-level terminal
   * event. Mission-terminal state is encoded inside a TARGET_EVENT payload via
   * `terminal === true` together with `mission_outcome`. Kept null intentionally.
   */
  MISSION_TERMINAL_EVENT: null as string | null,
} as const;
