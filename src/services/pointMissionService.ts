/**
 * pointMissionService — Point mission lifecycle + event journal.
 *
 * Re-exports lifecycle functions from missionLifecycleService that are
 * specific to point mode, and adds the event journal / backfill helpers.
 *
 * Phase 6 of the migration plan.
 */

// Re-export point-specific actions from lifecycle service for convenience
export {
  continuePoint,
  skipPoint,
  pauseMission as pausePointMission,
  resumeMission as resumePointMission,
  restartMission as restartPointMission,
  getPointStatus,
  getPointEvents,
} from './missionLifecycleService';

import { getPointEvents } from './missionLifecycleService';
import type { PointMissionEvent, PointEventHistoryResponse } from '../types/px4/mission';

// ── Event journal ─────────────────────────────────────────────────────────────

/**
 * Backfill missed events since a known event ID.
 * Call on socket reconnect to avoid gaps in the status map.
 *
 * @param sinceEventId Last event ID received before disconnect.
 *                     Pass -1 or undefined to fetch all events.
 */
export async function backfillEvents(
  sinceEventId?: number,
): Promise<PointMissionEvent[]> {
  const response: PointEventHistoryResponse = await getPointEvents(sinceEventId);
  return response.events ?? [];
}

/**
 * Fetch the most recent N events (no since_event_id filter).
 * Useful for initial load when no previous event ID is known.
 */
export async function getRecentEvents(): Promise<PointMissionEvent[]> {
  return backfillEvents(undefined);
}

export default {
  backfillEvents,
  getRecentEvents,
};
