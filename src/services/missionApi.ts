/**
 * DYX 4WD Rover mission API.
 *
 * Backend responsibilities:
 * - Validate and store one active mission.csv
 * - Prepare the trajectory automatically after upload
 * - Control Start, Pause, Resume, Next, Skip, Stop and Clear
 *
 * The frontend never calculates dummy points or interpolation points.
 */

import type {
  DocumentPickerAsset,
} from "expo-document-picker";

import {
  PX4_MISSION,
} from "../config/px4Endpoints";

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPostMultipart,
} from "./apiClient";

// ── Extension settings ────────────────────────────────────────────────────────

export type MissionExtensionMode =
  | "ENABLE"
  | "DISABLE";

export type MissionExecutionMode =
  | "AUTO"
  | "MANUAL";

export interface MissionUploadOptions {
  file: DocumentPickerAsset;

  extensionMode:
    MissionExtensionMode;

  /**
   * Used only when extensionMode is ENABLE.
   *
   * When omitted, the backend uses its configured production default,
   * currently 3.5 metres.
   */
  dummyPointDistanceM?: number;
}

// ── Backend response types ────────────────────────────────────────────────────

export interface MissionUploadMetadata {
  schema_version: number;
  mission_id: string;
  active_filename: string;
  original_filename: string;
  checksum_sha256: string;

  coordinate_mode:
    | "gps"
    | "local"
    | string;

  extension_mode:
    MissionExtensionMode;

  dummy_point_distance_m:
    number | null;

  row_transition_threshold_m:
    number;

  total_points:
    number;

  uploaded_at:
    string;
}

export interface MissionRuntimeState {
  state?: string;
  loaded?: boolean;
  ready?: boolean;

  /**
   * True once trajectory_generator has committed the fixed surveyed
   * P1->Pn /nav_path. This is independent of mission-manager READY/START.
   */
  trajectory_ready?: boolean;

  message?: string;
  error?: string | null;

  pause_reason?: string | null;
resume_available?: boolean;

gps_fix_type?: number;

rtk_state?: string | null;
rtk_fixed?: boolean;
rtk_healthy?: boolean;
rtk_motion_ok?: boolean;
rtk_reason?: string | null;
rtk_correction_age_sec?: number | null;

backend_heartbeat_healthy?: boolean;

mission_enable?: boolean;
emergency_stop?: boolean;

arrival_settle_elapsed_sec?: number;
arrival_settle_required_sec?: number;

  mission_id?: string;
  filename?: string;

  coordinate_mode?: string;

  extension_mode?:
    MissionExtensionMode;

  execution_mode?: MissionExecutionMode;

  dummy_point_distance_m?:
    number | null;

  total_points?: number;

  completed_points?: number;
  failed_points?: number;
  skipped_points?: number;
  remaining_points?: number;

  current_point_index?: number;
  next_point_index?: number;

  progress_pct?: number;

  navigation_point_count?: number;
  path_frame_id?: string;

  [key: string]: unknown;
}

export interface MissionUploadResponse {
  success: boolean;
  message: string;

  upload:
    MissionUploadMetadata;

  mission:
    MissionRuntimeState;
}

export interface MissionControlResponse {
  success: boolean;

  operation:
    | "prepare"
    | "start"
    | "pause"
    | "resume"
    | "next-point"
    | "skip-point"
    | "stop"
    | "clear"
    | string;

  mission:
    MissionRuntimeState;
}

export interface MissionStatusResponse {
  success: boolean;
  mission: MissionRuntimeState;
}

// ── Canonical Mission Report ──────────────────────────────────────────────────

export type MissionReportPointStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type RppTerminalOutcome =
  | "CAPTURED"
  | "MISSED"
  | null;

export interface MissionReportAccuracy {
  /**
   * RPP is the ONLY final marking-accuracy authority.
   */
  measurement_source:
    "RPP_TERMINAL_RESULT";

  /**
   * True only when an RPP terminal result exists
   * for this marking point.
   *
   * PENDING / SKIPPED normally return false.
   */
  available: boolean;

  /**
   * Signed lateral error from RPP.
   */
  cross_track_error_mm:
    number | null;

  /**
   * Signed front/back error from RPP.
   */
  along_track_error_mm:
    number | null;

  /**
   * Exact radial/overall terminal error from RPP.
   */
  overall_accuracy_mm:
    number | null;

  /**
   * Compatibility alias from backend.
   * Frontend Mission Report should use
   * overall_accuracy_mm.
   */
  total_accuracy_mm?:
    number | null;

  tolerance_mm:
    number | null;

  /**
   * Copied from RPP terminal result.
   * Frontend must not calculate this.
   */
  within_tolerance?:
    boolean | null;

  rpp_outcome?:
    RppTerminalOutcome;

  captured_at:
    string | null;
}

export interface MissionReportSpray {
  attempted: boolean;

  outcome: string;

  confirmed:
    boolean | null;

  reason:
    string | null;

  elapsed_sec:
    number | null;
}

export interface MissionReportPoint {
  point_id: string;

  point_index: number;

  /**
   * 1-based point number.
   * P1 = sequence 1.
   */
  sequence: number;

  status:
    MissionReportPointStatus;

  is_active: boolean;

  accuracy:
    MissionReportAccuracy;

  spray:
    MissionReportSpray;

  reason:
    string | null;

  updated_at:
    string | null;

  target:
    Record<string, unknown>;
}

export interface MissionReportSummary {
  total_points: number;

  pending_points: number;

  completed_points: number;

  failed_points: number;

  skipped_points: number;

  resolved_points: number;

  progress_percent: number;
}

export interface CanonicalMissionReport {
  schema_version: number;

  source: string;

  lifecycle: string;

  report_id: string;

  mission_id: string;

  mission_run_id:
    string | null;

  generated_at: string;

  state: string;

  summary:
    MissionReportSummary;

  points:
    MissionReportPoint[];

  [key: string]:
    unknown;
}

export interface MissionReportResponse {
  success: boolean;

  available: boolean;

  report:
    CanonicalMissionReport | null;
}


export interface LoadedPathPoint {
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;

  [key: string]: unknown;
}

export interface LoadedPathResponse {
  success: boolean;

  frame_id:
    string | null;

  navigation_point_count:
    number;

  preview_truncated:
    boolean;

  points:
    LoadedPathPoint[];
}

export interface DeleteMissionResponse {
  success: boolean;
  deleted: boolean;
  message: string;
  mission: MissionRuntimeState;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateCsvFile(
  file: DocumentPickerAsset,
): void {
  const filename =
    file.name?.trim() ?? "";

  if (!file.uri) {
    throw new Error(
      "The selected CSV file has no readable URI.",
    );
  }

  if (
    !filename ||
    !filename
      .toLowerCase()
      .endsWith(".csv")
  ) {
    throw new Error(
      "Please select a valid CSV mission file.",
    );
  }
}

function validateDummyDistance(
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      "Dummy-point distance must be a valid number.",
    );
  }

  if (
    value < 0.1 ||
    value > 20
  ) {
    throw new Error(
      "Dummy-point distance must be between 0.10 m and 20.00 m.",
    );
  }
}

// ── Mission upload ────────────────────────────────────────────────────────────

export async function uploadMissionCsv(
  options: MissionUploadOptions,
): Promise<MissionUploadResponse> {
  const {
    file,
    extensionMode,
    dummyPointDistanceM,
  } = options;

  validateCsvFile(file);

  if (
    extensionMode !== "ENABLE" &&
    extensionMode !== "DISABLE"
  ) {
    throw new Error(
      "Extension mode must be ENABLE or DISABLE.",
    );
  }

  if (
    extensionMode === "ENABLE" &&
    dummyPointDistanceM !== undefined
  ) {
    validateDummyDistance(
      dummyPointDistanceM,
    );
  }

  const formData =
    new FormData();

  /**
   * React Native fetch accepts this URI-based file object.
   * The `any` cast is required because browser FormData typings expect Blob,
   * while React Native accepts uri/name/type.
   */
  formData.append(
    "file",
    {
      uri: file.uri,
      name:
        file.name ||
        "mission.csv",
      type:
        file.mimeType ||
        "text/csv",
    } as any,
  );

  formData.append(
    "extension_mode",
    extensionMode,
  );

  if (
    extensionMode === "ENABLE" &&
    dummyPointDistanceM !== undefined
  ) {
    formData.append(
      "dummy_point_distance_m",
      String(
        dummyPointDistanceM,
      ),
    );
  }

  return apiPostMultipart<MissionUploadResponse>(
    PX4_MISSION.UPLOAD,
    formData,
    {
      timeoutMs: 60_000,
    },
  );
}

// ── Mission information ───────────────────────────────────────────────────────

export async function getMissionStatus():
Promise<MissionStatusResponse> {
  return apiGet<MissionStatusResponse>(
    PX4_MISSION.STATUS,
  );
}
/**
 * Canonical Mission Report.
 *
 * Accuracy values are already calculated by RPP.
 * This function only retrieves them.
 *
 * Frontend must NOT calculate:
 * - cross-track
 * - along-track
 * - overall accuracy
 */
export async function getMissionReport():
Promise<MissionReportResponse> {
  return apiGet<MissionReportResponse>(
    PX4_MISSION.REPORT,
  );
}

export async function getLoadedMissionPath():
Promise<LoadedPathResponse> {
  return apiGet<LoadedPathResponse>(
    PX4_MISSION.LOADED_PATH,
  );
}

export function getMissionDownloadUrl(
  backendURL: string,
): string {
  return (
    `${backendURL.replace(/\/+$/, "")}` +
    PX4_MISSION.FILE
  );
}

// ── Mission controls ──────────────────────────────────────────────────────────

export async function prepareMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.PREPARE,
  );
}

export async function setMissionExecutionMode(
  executionMode: MissionExecutionMode,
): Promise<MissionControlResponse> {
  if (
    executionMode !== "AUTO" &&
    executionMode !== "MANUAL"
  ) {
    throw new Error(
      "Mission execution mode must be AUTO or MANUAL.",
    );
  }

  return apiPost<MissionControlResponse>(
    PX4_MISSION.EXECUTION_MODE,
    {
      execution_mode: executionMode,
    },
  );
}

export async function startMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.START,
    undefined,
    { timeoutMs: 35_000 },
  );
}

export async function pauseMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.PAUSE,
  );
}

export async function resumeMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.RESUME,
    undefined,
    { timeoutMs: 35_000 },
  );
}

export async function nextMissionPoint():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.NEXT_POINT,
    undefined,
    { timeoutMs: 35_000 },
  );
}

export async function skipMissionPoint():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.SKIP_POINT,
  );
}

export async function stopMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.STOP,
    undefined,
    { timeoutMs: 25_000 },
  );
}

/**
 * Clears generated path and runtime mission progress.
 * The active mission.csv remains stored.
 */
export async function clearMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.CLEAR,
  );
}

/**
 * Deletes the active mission.csv completely.
 * This is different from Clear.
 */
export async function deleteMissionCsv():
Promise<DeleteMissionResponse> {
  return apiDelete<DeleteMissionResponse>(
    PX4_MISSION.FILE,
  );
}

export default {
  uploadMissionCsv,

  getMissionStatus,
  getMissionReport,
  getLoadedMissionPath,
  getMissionDownloadUrl,

  prepareMission,
  setMissionExecutionMode,

  startMission,
  pauseMission,
  resumeMission,
  nextMissionPoint,
  skipMissionPoint,
  stopMission,
  clearMission,

  deleteMissionCsv,
};