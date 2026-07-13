/**
 * px4MissionStatusAdapter — Map PX4 mission_status to UI progress model.
 *
 * The PX4 backend does not track waypoints by index; it tracks RPP state +
 * distance-to-goal. This adapter maps to the existing MissionProgress shape
 * used by MissionProgressCard and similar components.
 */

import type { Px4MissionStatus, MissionState } from '../types/px4/telemetry';

export interface MissionProgress {
  /** Server-side mission state string. */
  state: MissionState;
  /** Human-readable state label for UI. */
  stateLabel: string;
  /** Progress 0–100 (derived from RPP state / dist_to_goal when total unknown). */
  progressPct: number;
  /** Distance to next goal in meters. */
  distToGoalM: number;
  /** Cross-track error in meters. */
  xtrackM: number;
  /** Current speed in m/s. */
  speedMps: number;
  /** RPP state integer (for diagnostics). */
  rppState: number;
  /** RPP state name string. */
  rppStateName: string;
  /** Point index (point missions only). */
  pointIndex: number | null;
  /** Total points (point missions only). */
  totalPoints: number | null;
  /** Whether mission is actively running. */
  isRunning: boolean;
  /** Whether mission is paused. */
  isPaused: boolean;
  /** Whether mission has completed. */
  isCompleted: boolean;
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  loading: 'Loading…',
  arming: 'Arming…',
  switching_offboard: 'Switching OFFBOARD…',
  running: 'Running',
  paused: 'Paused',
  stopping: 'Stopping…',
  stopped: 'Stopped',
  completed: 'Completed',
  error: 'Error',
};

/**
 * Convert a `mission_status` socket payload to UI progress model.
 */
export function toMissionProgress(status: Partial<Px4MissionStatus>): MissionProgress {
  const state: MissionState = status.state ?? 'idle';
  const stateLabel = STATE_LABELS[state] ?? state;

  const distToGoalM = typeof status.dist_to_goal === 'number' ? status.dist_to_goal : 0;
  const xtrackM = typeof status.xtrack === 'number' ? status.xtrack : 0;
  const speedMps = typeof status.speed === 'number' ? status.speed : 0;
  const rppState = typeof status.rpp_state === 'number' ? status.rpp_state : 0;
  const rppStateName = status.rpp_state_name ?? '';

  const pointIndex =
    typeof status.point_index === 'number' ? status.point_index : null;
  const totalPoints =
    typeof status.total_points === 'number' ? status.total_points : null;

  // Derive progress percentage
  let progressPct = 0;
  if (state === 'completed') {
    progressPct = 100;
  } else if (pointIndex !== null && totalPoints !== null && totalPoints > 0) {
    progressPct = Math.round((pointIndex / totalPoints) * 100);
  } else if (state === 'running' || state === 'paused') {
    // No per-point data — show indeterminate state as small indicator
    progressPct = rppState > 0 ? Math.min(95, rppState * 10) : 5;
  }

  return {
    state,
    stateLabel,
    progressPct,
    distToGoalM,
    xtrackM,
    speedMps,
    rppState,
    rppStateName,
    pointIndex,
    totalPoints,
    isRunning: state === 'running',
    isPaused: state === 'paused',
    isCompleted: state === 'completed',
  };
}

/**
 * Map mission state to a badge color.
 */
export function missionStateBadgeColor(state: MissionState): string {
  switch (state) {
    case 'running':           return '#4ADE80'; // green
    case 'paused':            return '#F59E0B'; // amber
    case 'arming':
    case 'switching_offboard':
    case 'loading':           return '#60A5FA'; // blue — transitioning
    case 'completed':         return '#818CF8'; // indigo
    case 'error':             return '#EF4444'; // red
    case 'stopping':
    case 'stopped':           return '#94A3B8'; // slate
    default:                  return '#334155'; // dark slate — idle
  }
}
