/**
 * missionWaypointStatus — single shared waypoint UI status type.
 *
 * This is the ONE canonical union for per-waypoint UI status across the whole
 * mission-report surface (tables, progress card, export, completion dialog,
 * persistence, and both the PX4 point bridge and the verified-GPS bridge).
 *
 * Previously this union was duplicated in ~6 files; adding the verified-GPS
 * terminal statuses (`failed` / `aborted` / `stopped`) to the type but not to
 * the render paths caused failed targets to display as "Pending". Centralising
 * the union here makes that class of regression a compile error instead.
 *
 * Terminal statuses are NEVER collapsed into one another:
 *   failed  ≠ skipped ≠ aborted ≠ stopped ≠ completed
 */

export type WaypointUiStatus =
  | 'completed'
  | 'loading'
  | 'skipped'
  | 'reached'
  | 'marked'
  | 'pending'
  | 'spray_on'
  | 'spray_off'
  | 'passed'
  | 'mission_end'
  // Verified-GPS distinct terminal statuses — never collapsed to skipped/passed.
  | 'failed'
  | 'aborted'
  | 'stopped';

/**
 * Terminal statuses that represent a target the rover will NOT revisit.
 * Used by progress/export counters so a terminal mission with a failure is
 * never shown as still running or pending.
 */
export const TERMINAL_WAYPOINT_STATUSES: readonly WaypointUiStatus[] = [
  'completed',
  'skipped',
  'failed',
  'aborted',
  'stopped',
  'mission_end',
] as const;

/**
 * Terminal statuses that represent an UNSUCCESSFUL / interrupted target.
 * `skipped` is intentionally excluded here (it is an operator action, not a
 * failure) and counted separately.
 */
export const ERROR_WAYPOINT_STATUSES: readonly WaypointUiStatus[] = [
  'failed',
  'aborted',
  'stopped',
] as const;

export function isTerminalWaypointStatus(
  status: WaypointUiStatus | undefined | null,
): boolean {
  return !!status && TERMINAL_WAYPOINT_STATUSES.includes(status);
}

export function isErrorWaypointStatus(
  status: WaypointUiStatus | undefined | null,
): boolean {
  return !!status && ERROR_WAYPOINT_STATUSES.includes(status);
}
