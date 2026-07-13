/**
 * missionStatusPresentation — single source of truth for how a waypoint UI
 * status is shown to the operator (label, color, remark, export label).
 *
 * Every mission-report surface (WaypointsTable, MissionProgressCard,
 * MissionReportExport, MissionCompletionDialog) must use these helpers so a
 * status can never silently fall through to a "Pending" default.
 */

import type { WaypointUiStatus } from '../types/missionWaypointStatus';

export interface StatusPresentation {
  /** Short on-screen label, e.g. "Failed". */
  label: string;
  /** Operator-facing color (hex). */
  color: string;
  /** Longer label for exported reports. */
  exportLabel: string;
  /** True for failed / aborted / stopped (unsuccessful terminal). */
  isError: boolean;
  /** True for any terminal status the rover will not revisit. */
  isTerminal: boolean;
}

const GREEN = '#10B981';
const BLUE = '#3B82F6';
const AMBER = '#F59E0B';
const YELLOW = '#FBBF24';
const TEAL = '#2DD4BF';
const GREY = '#94A3B8';
const RED = '#EF4444';
const ORANGE = '#F97316';
const PURPLE = '#A855F7';

const PRESENTATION: Record<WaypointUiStatus, StatusPresentation> = {
  completed:   { label: 'Completed',  exportLabel: 'Completed',   color: GREEN,  isError: false, isTerminal: true },
  loading:     { label: 'Loading',    exportLabel: 'Loading',     color: YELLOW, isError: false, isTerminal: false },
  skipped:     { label: 'Skipped',    exportLabel: 'Skipped',     color: GREY,   isError: false, isTerminal: true },
  reached:     { label: 'Reached',    exportLabel: 'Reached',     color: AMBER,  isError: false, isTerminal: false },
  marked:      { label: 'Marked',     exportLabel: 'Marked',      color: BLUE,   isError: false, isTerminal: false },
  pending:     { label: 'Pending',    exportLabel: 'Pending',     color: GREY,   isError: false, isTerminal: false },
  spray_on:    { label: 'Spray ON',   exportLabel: 'Spray ON',    color: BLUE,   isError: false, isTerminal: false },
  spray_off:   { label: 'Spray OFF',  exportLabel: 'Spray OFF',   color: BLUE,   isError: false, isTerminal: false },
  passed:      { label: 'Passed',     exportLabel: 'Passed',      color: TEAL,   isError: false, isTerminal: false },
  mission_end: { label: 'Done',       exportLabel: 'Mission End',  color: GREEN,  isError: false, isTerminal: true },
  // Distinct unsuccessful terminal statuses — explicit operator-facing text.
  failed:      { label: 'Failed',     exportLabel: 'Failed',      color: RED,    isError: true,  isTerminal: true },
  aborted:     { label: 'Aborted',    exportLabel: 'Aborted',     color: ORANGE, isError: true,  isTerminal: true },
  stopped:     { label: 'Stopped',    exportLabel: 'Stopped',     color: PURPLE, isError: true,  isTerminal: true },
};

const PENDING_PRESENTATION: StatusPresentation = PRESENTATION.pending;

/**
 * Resolve presentation for a status. An unknown/undefined status resolves to
 * Pending (genuinely unknown), but the known terminal statuses always resolve
 * to their own distinct presentation.
 */
export function getStatusPresentation(
  status: WaypointUiStatus | string | undefined | null,
): StatusPresentation {
  if (status && status in PRESENTATION) {
    return PRESENTATION[status as WaypointUiStatus];
  }
  return PENDING_PRESENTATION;
}

/** Current waypoint S/N and total count for progress labels, e.g. (3/25) or (0/0). */
export function getMissionProgressRef(
  waypoints: { sn: number }[],
  currentIndex: number | null | undefined,
  isMissionActive: boolean,
): { current: number; total: number } {
  const total = waypoints.length;
  const currentWp =
    isMissionActive && currentIndex != null && currentIndex >= 0
      ? waypoints[currentIndex]
      : null;
  return {
    current: currentWp?.sn ?? 0,
    total,
  };
}
