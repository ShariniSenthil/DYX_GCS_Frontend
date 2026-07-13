/**
 * verifiedMissionService — 4-wheel verified mission REST calls.
 *
 * All endpoint names come from FOURWD_MISSION in fourwdEndpoints.ts.
 * No imports from px4Endpoints.ts.
 *
 * Confirmed contract (4WD_SERVER server/routes/{verified_mission,mission}.py):
 *   POST FOURWD_MISSION.UPLOAD_WAYPOINTS  → UploadVerifiedMissionResponse
 *   GET  FOURWD_MISSION.GET(id)           → GetVerifiedMissionResponse (404 if absent)
 *   POST FOURWD_MISSION.START             → VerifiedMissionStartResponse { state, message }
 *   POST FOURWD_MISSION.CLEAR             → VerifiedMissionClearResponse { cleared, status }
 */

import { apiGet, apiPost } from './apiClient';
import { FOURWD_MISSION } from '../config/fourwdEndpoints';
import type {
  UploadVerifiedMissionRequest,
  UploadVerifiedMissionResponse,
  GetVerifiedMissionResponse,
  StartVerifiedMissionRequest,
  VerifiedMissionStartResponse,
  VerifiedMissionClearResponse,
} from '../types/fourwd/mission';

/**
 * Upload a verified GPS waypoint mission to the 4WD server.
 * The server validates and stores a mission artifact keyed by mission_id.
 */
export async function uploadVerifiedMission(
  request: UploadVerifiedMissionRequest,
): Promise<UploadVerifiedMissionResponse> {
  return apiPost<UploadVerifiedMissionResponse>(FOURWD_MISSION.UPLOAD_WAYPOINTS, request);
}

/**
 * Confirm the server stored the mission correctly.
 * Checks mission_id exists and total_targets matches the uploaded count.
 * Throws NotFoundError (404) when the mission is not resident on the server.
 */
export async function getVerifiedMission(
  missionId: string,
): Promise<GetVerifiedMissionResponse> {
  return apiGet<GetVerifiedMissionResponse>(FOURWD_MISSION.GET(missionId));
}

/**
 * Start a verified mission by its server-assigned mission_id.
 * Uses POST /api/mission/start with mission_id in the body.
 */
export async function startVerifiedMission(
  missionId: string,
): Promise<VerifiedMissionStartResponse> {
  const body: StartVerifiedMissionRequest = { mission_id: missionId };
  return apiPost<VerifiedMissionStartResponse>(FOURWD_MISSION.START, body);
}

/**
 * Clear the loaded verified mission from the controller.
 * Returns 409 if a mission is currently running — caller must stop first.
 */
export async function clearVerifiedMission(): Promise<VerifiedMissionClearResponse> {
  return apiPost<VerifiedMissionClearResponse>(FOURWD_MISSION.CLEAR);
}
