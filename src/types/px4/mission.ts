/**
 * 4WD_SERVER Mission types — staging pipeline, lifecycle, point events.
 */

import type { MissionState } from './telemetry';

// ── Staging pipeline ──────────────────────────────────────────────────────────

export interface AlignRequest {
  origin_lat: number;
  origin_lon: number;
  heading_deg: number;
}

export interface AlignResponse {
  success: boolean;
  message?: string;
  transform?: {
    tx: number;
    ty: number;
    scale: number;
    rotation_deg: number;
  };
}

export interface PathPlanRequest {
  origin_lat?: number;
  origin_lon?: number;
  auto_origin?: boolean;
  config?: Record<string, unknown>;
}

export interface PathPlanResponse {
  success: boolean;
  path_name: string;
  mission_id: string;
  total_points: number;
  message?: string;
}

export interface StagedMissionResponse {
  mission_id: string;
  path_name: string;
  total_points: number;
  points?: Array<{ lat: number; lon: number; alt?: number }>;
  spray_mode?: string;
  created_at?: string;
}

export interface LoadToControllerRequest {
  mission_id: string;
}

export interface LoadToControllerResponse {
  success: boolean;
  message?: string;
  path_name?: string;
  spray_config_status?: string;
}

// ── Mission lifecycle ─────────────────────────────────────────────────────────

export interface MissionStartRequest {
  path_name?: string;
  mission_file?: string;
  mission_id?: string;
  auto_origin?: boolean;
}

export interface MissionStartResponse {
  state: MissionState;
  message?: string;
}

export interface MissionStopResponse {
  success: boolean;
  action?: string;
  stop_position?: { lat: number; lon: number };
  spray_off_confirmed?: boolean;
  message?: string;
}

export interface MissionClearResponse {
  cleared: boolean;
  status?: {
    path_name: string | null;
    mission_id: string | null;
  };
}

export interface MissionRestartRequest {
  stop_first?: boolean;
  auto_start?: boolean;
}

export interface MissionRestartResponse {
  success: boolean;
  state?: MissionState;
  message?: string;
}

export interface MissionStatusResponse {
  state: MissionState;
  rpp_state?: number;
  rpp_state_name?: string;
  path_name?: string;
  mission_id?: string;
  point?: PointMissionStatusResponse;
  spray_mode?: string;
}

// ── Point mission lifecycle ───────────────────────────────────────────────────

export interface PointContinueResponse {
  success: boolean;
  point_index?: number;
  message?: string;
}

export interface PointSkipRequest {
  point_index: number;
  expected_generation?: number;
  reason?: string;
}

export interface PointSkipResponse {
  success: boolean;
  skipped_index?: number;
  next_index?: number;
  message?: string;
}

export interface PointPauseResponse {
  success: boolean;
  message?: string;
}

export interface PointResumeResponse {
  success: boolean;
  message?: string;
}

export interface PointMissionStatusResponse {
  point_index: number;
  total_points: number;
  expected_generation: number;
  state: string;
  waiting_for_continue: boolean;
}

// ── Point events ──────────────────────────────────────────────────────────────

export type PointEventType =
  | 'point_leg_started'
  | 'point_arrived'
  | 'point_dwell_started'
  | 'point_marked'
  | 'point_waiting_for_continue'
  | 'point_paused'
  | 'point_resumed'
  | 'point_skipped'
  | 'point_completed'
  | 'point_failed'
  | 'point_aborted';

export interface PointMissionEvent {
  event_id: number;
  event_type: PointEventType;
  point_index: number;
  generation: number;
  timestamp: string;
  terminal?: boolean;
  lat?: number;
  lon?: number;
  reason?: string;
  message?: string;
}

export interface PointEventHistoryResponse {
  events: PointMissionEvent[];
  last_event_id: number;
}

// ── Vehicle control ───────────────────────────────────────────────────────────

export interface ArmRequest {
  arm: boolean;
}

export interface ArmResponse {
  success: boolean;
  armed?: boolean;
  spray_off_confirmed?: boolean;
  message?: string;
}

export interface SetModeRequest {
  mode: 'MANUAL';
}

export interface SetModeResponse {
  success: boolean;
  mode?: string;
  message?: string;
}

export interface EstopResponse {
  success: boolean;
  message?: string;
}

// ── GPS safety abort ──────────────────────────────────────────────────────────

export interface GpsSafetyAbortEvent {
  reason: string;
  dist_to_goal_m?: number;
  manual_resume_required: boolean;
  timestamp?: string;
}
