/**
 * missionStagingService — Server-side path staging pipeline.
 *
 * Encapsulates the full staging flow:
 *   align → plan-and-stage → GET staged/{id} → load-to-controller → confirm loaded-path
 *
 * All methods use apiClient with operator token injection.
 */

import { apiGet, apiPost, apiPut } from './apiClient';
import { PX4_PATH } from '../config/px4Endpoints';
import type {
  AlignRequest,
  AlignResponse,
  PathPlanRequest,
  PathPlanResponse,
  StagedMissionResponse,
  LoadToControllerRequest,
  LoadToControllerResponse,
} from '../types/px4/mission';
import type { LoadedPathResponse } from '../types/px4/telemetry';

// ── Path listing ──────────────────────────────────────────────────────────────

export interface PathListItem {
  name: string;
  created_at?: string;
  has_spray_mode?: boolean;
  total_points?: number;
}

export interface PathListResponse {
  paths: PathListItem[];
}

/** List all available server-side paths. */
export async function listPaths(): Promise<PathListResponse> {
  return apiGet<PathListResponse>(PX4_PATH.LIST);
}

// ── Align ─────────────────────────────────────────────────────────────────────

/**
 * Apply CAD alignment transform to a named path.
 * Must be called before plan-and-stage when using DXF coordinate system.
 */
export async function alignPath(
  pathName: string,
  request: AlignRequest,
): Promise<AlignResponse> {
  return apiPost<AlignResponse>(PX4_PATH.ALIGN(pathName), request);
}

// ── Plan and stage ────────────────────────────────────────────────────────────

/**
 * Plan a path and atomically stage it as a mission artifact.
 * Returns a `mission_id` that identifies the staged artifact.
 */
export async function planAndStage(
  pathName: string,
  request: PathPlanRequest = {},
): Promise<PathPlanResponse> {
  return apiPost<PathPlanResponse>(PX4_PATH.PLAN_AND_STAGE(pathName), request);
}

/** Plan only — does not stage. */
export async function planPath(
  pathName: string,
  request: PathPlanRequest = {},
): Promise<PathPlanResponse> {
  return apiPost<PathPlanResponse>(PX4_PATH.PLAN(pathName), request);
}

// ── Get staged mission ────────────────────────────────────────────────────────

/**
 * Retrieve a staged mission artifact by ID.
 * Use to verify staging before load-to-controller.
 */
export async function getStaged(missionId: string): Promise<StagedMissionResponse> {
  return apiGet<StagedMissionResponse>(PX4_PATH.STAGED(missionId));
}

// ── Load to controller ────────────────────────────────────────────────────────

/**
 * Commit a staged mission to the flight controller.
 * Must be called after planAndStage and (optionally) after spray-mode PUT.
 */
export async function loadToController(
  missionId: string,
): Promise<LoadToControllerResponse> {
  return apiPost<LoadToControllerResponse>(PX4_PATH.LOAD_TO_CONTROLLER, {
    mission_id: missionId,
  } satisfies LoadToControllerRequest);
}

// ── Confirm loaded path ───────────────────────────────────────────────────────

/**
 * Retrieve the currently loaded path summary from the server.
 * Used to verify the "mission loaded" indicator before start.
 */
export async function getLoadedPath(): Promise<LoadedPathResponse> {
  return apiGet<LoadedPathResponse>('/api/mission/loaded-path');
}

// ── DXF / CSV parsing ─────────────────────────────────────────────────────────

export interface ParseDxfResponse {
  success: boolean;
  path_name: string;
  total_points?: number;
  message?: string;
}

/** Upload a DXF file for parsing on the server. */
export async function parseDxf(formData: FormData): Promise<ParseDxfResponse> {
  // For multipart uploads, skip Content-Type (let fetch set boundary)
  const base = (await import('../config')).getBackendURL().replace(/\/$/, '');
  const token = ''; // Will be set by actual caller using getToken
  const url = `${base}${PX4_PATH.PARSE_DXF}`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DXF parse failed (${response.status}): ${text}`);
  }

  return response.json();
}

export default {
  listPaths,
  alignPath,
  planAndStage,
  planPath,
  getStaged,
  loadToController,
  getLoadedPath,
  parseDxf,
};
