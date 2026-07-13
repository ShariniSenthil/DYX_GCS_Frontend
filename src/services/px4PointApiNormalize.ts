/**
 * Normalize 4WD_SERVER point-mission REST payloads to mobile contract shapes.
 */

import type {
  PointContinueResponse,
  PointMissionStatusResponse,
  PointSkipResponse,
} from '../types/px4/mission';

type RawPointStatus = Record<string, unknown>;

export function normalizePointMissionStatus(raw: RawPointStatus): PointMissionStatusResponse {
  return {
    point_index: Number(raw.point_index ?? raw.current_point_index ?? 0),
    total_points: Number(raw.total_points ?? 0),
    expected_generation: Number(raw.expected_generation ?? raw.point_mission_generation ?? 0),
    state: String(raw.state ?? raw.point_mission_state ?? 'idle'),
    waiting_for_continue: Boolean(raw.waiting_for_continue ?? false),
  };
}

export function normalizePointContinueResponse(raw: RawPointStatus): PointContinueResponse {
  const status = raw.status as RawPointStatus | undefined;
  return {
    success: Boolean(raw.success ?? raw.continued),
    message: typeof raw.message === 'string' ? raw.message : undefined,
    point_index: typeof raw.point_index === 'number'
      ? raw.point_index
      : typeof status?.current_point_index === 'number'
        ? status.current_point_index
        : undefined,
  };
}

export function normalizePointSkipResponse(raw: RawPointStatus): PointSkipResponse {
  const status = raw.status as RawPointStatus | undefined;
  return {
    success: Boolean(raw.success ?? raw.skipped),
    message: typeof raw.message === 'string' ? raw.message : undefined,
    skipped_index: typeof raw.skipped_index === 'number'
      ? raw.skipped_index
      : typeof status?.last_skipped_point_index === 'number'
        ? status.last_skipped_point_index
        : undefined,
    next_index: typeof raw.next_index === 'number'
      ? raw.next_index
      : typeof status?.next_point_index === 'number'
        ? status.next_point_index
        : undefined,
  };
}