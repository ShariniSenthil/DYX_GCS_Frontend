/**
 * sprayModeService — 4WD_SERVER spray-mode sidecar API.
 *
 * Replaces the legacy `POST /api/mission/mode` with per-path sidecar calls.
 * Must have a staged path_name (from MissionStagingContext) before calling PUT.
 *
 * Flow: stage path → PUT spray mode → load-to-controller → start mission
 */

import { apiGet, apiPut, apiDelete } from './apiClient';
import { PX4_PATH } from '../config/px4Endpoints';
import type {
  SprayModeType,
  SprayModeResponse,
  ContinuousModeRequest,
  DashModeRequest,
  PointModeRequest,
} from '../types/px4/sprayMode';

// ── Read current spray mode ───────────────────────────────────────────────────

/** Get the spray mode sidecar for a staged path. */
export async function getSprayMode(pathName: string): Promise<SprayModeResponse> {
  return apiGet<SprayModeResponse>(PX4_PATH.SPRAY_MODE_GET(pathName));
}

// ── Set spray mode ────────────────────────────────────────────────────────────

/**
 * Configure continuous spray mode.
 * Spray activates continuously along the path.
 */
export async function setContinuousMode(
  pathName: string,
  config: ContinuousModeRequest = {},
): Promise<SprayModeResponse> {
  return apiPut<SprayModeResponse>(PX4_PATH.SPRAY_MODE_CONTINUOUS(pathName), config);
}

/**
 * Configure dash (intermittent) spray mode.
 * Spray activates for `dash_on_run_m` meters, then off for `dash_off_gap_m` meters.
 */
export async function setDashMode(
  pathName: string,
  config: DashModeRequest,
): Promise<SprayModeResponse> {
  return apiPut<SprayModeResponse>(PX4_PATH.SPRAY_MODE_DASH(pathName), config);
}

/**
 * Configure point (DGPS Mark) spray mode.
 * Spray activates at each waypoint according to dwell/auto-mark config.
 */
export async function setPointMode(
  pathName: string,
  config: PointModeRequest = {},
): Promise<SprayModeResponse> {
  return apiPut<SprayModeResponse>(PX4_PATH.SPRAY_MODE_POINT(pathName), config);
}

/**
 * Generic set — dispatches to the correct PUT based on mode type.
 */
export async function setSprayMode(
  pathName: string,
  mode: SprayModeType,
  config: ContinuousModeRequest | DashModeRequest | PointModeRequest = {},
): Promise<SprayModeResponse> {
  switch (mode) {
    case 'continuous': return setContinuousMode(pathName, config as ContinuousModeRequest);
    case 'dash':       return setDashMode(pathName, config as DashModeRequest);
    case 'point':      return setPointMode(pathName, config as PointModeRequest);
    default:
      throw new Error(`Unknown spray mode: ${mode}`);
  }
}

/**
 * Map the legacy UI mode label to a PX4 SprayModeType.
 * Used when migrating from old missionModeService.
 */
export function uiModeToSprayType(uiMode: string): SprayModeType {
  const lower = uiMode.toLowerCase();
  if (lower === 'dgps mark' || lower === 'point') return 'point';
  if (lower === 'continuous') return 'continuous';
  if (lower === 'dash') return 'dash';
  return 'continuous'; // Safe default
}

// ── Delete spray mode ─────────────────────────────────────────────────────────

/** Remove the spray-mode sidecar from a path (resets to no spray config). */
export async function deleteSprayMode(pathName: string): Promise<{ success: boolean }> {
  return apiDelete(PX4_PATH.SPRAY_MODE_DELETE(pathName));
}

export default {
  getSprayMode,
  setContinuousMode,
  setDashMode,
  setPointMode,
  setSprayMode,
  uiModeToSprayType,
  deleteSprayMode,
};
