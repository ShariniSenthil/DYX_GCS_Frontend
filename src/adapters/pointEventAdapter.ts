/**
 * pointEventAdapter — Map PX4 point_mission_event types to legacy statusMap keys.
 *
 * MissionReportScreen uses a `statusMap: Record<number, WaypointStatus>` fed by
 * legacy `mission_event` socket messages. This adapter bridges the new
 * `point_mission_event` payloads to those same keys, so map components need
 * no changes.
 *
 * Event type reference: Phase 6 of the migration plan.
 */

import type { PointMissionEvent, PointEventType } from '../types/px4/mission';

// ── Legacy status key type ────────────────────────────────────────────────────

export type WaypointStatusKey =
  | 'pending'
  | 'active'
  | 'arrived'
  | 'marked'
  | 'completed'
  | 'skipped'
  | 'waiting'
  | 'paused'
  | 'failed'
  | 'aborted';

export interface WaypointStatusEntry {
  status: WaypointStatusKey;
  timestamp: string;
  lat?: number;
  lon?: number;
  reason?: string;
  message?: string;
  eventType: PointEventType;
  lastEventId?: number;
}

export interface PointEventCursor {
  generation: number | null;
  lastEventId: number;
}

export const INITIAL_POINT_EVENT_CURSOR: PointEventCursor = {
  generation: null,
  lastEventId: 0,
};

export type PointMissionTerminalOutcome = 'completed' | 'failed' | 'aborted';

export interface PointEventIngestResult {
  accepted: boolean;
  statusMap: Record<number, WaypointStatusEntry>;
  cursor: PointEventCursor;
  terminalEvent: PointMissionEvent | null;
}

// ── Mapping table ─────────────────────────────────────────────────────────────

const EVENT_TYPE_TO_STATUS: Record<PointEventType, WaypointStatusKey> = {
  point_leg_started:          'active',
  point_arrived:              'arrived',
  point_dwell_started:        'arrived',
  point_marked:               'marked',
  point_waiting_for_continue: 'waiting',
  point_paused:               'paused',
  point_resumed:              'active',
  point_skipped:              'skipped',
  point_completed:            'completed',
  point_failed:               'failed',
  point_aborted:              'aborted',
};

const ENTRY_STATUS_PRIORITY: Record<WaypointStatusKey, number> = {
  pending: 0,
  active: 1,
  paused: 1,
  arrived: 2,
  waiting: 2,
  marked: 3,
  completed: 4,
  skipped: 4,
  failed: 4,
  aborted: 4,
};

const CURRENT_INDEX_STATUSES = new Set<WaypointStatusKey>([
  'active',
  'arrived',
  'waiting',
  'marked',
  'completed',
  'skipped',
  'paused',
  'failed',
  'aborted',
]);

// ── Adapter function ──────────────────────────────────────────────────────────

/**
 * Convert a single `point_mission_event` payload to a statusMap entry.
 * Returns null for unknown event types (forward-compatibility).
 */
export function toStatusEntry(event: PointMissionEvent): WaypointStatusEntry | null {
  const status = EVENT_TYPE_TO_STATUS[event.event_type];
  if (!status) return null;

  return {
    status,
    timestamp: event.timestamp,
    lat: event.lat,
    lon: event.lon,
    reason: event.reason,
    message: event.message,
    eventType: event.event_type,
    lastEventId: event.event_id,
  };
}

export function isEntryStatusDowngrade(
  existing: WaypointStatusEntry | undefined,
  incoming: WaypointStatusEntry,
): boolean {
  if (!existing) return false;
  return (
    (ENTRY_STATUS_PRIORITY[incoming.status] ?? 0)
    < (ENTRY_STATUS_PRIORITY[existing.status] ?? 0)
  );
}

/**
 * Reject stale generations and duplicate/older event IDs.
 */
export function shouldAcceptPointEvent(
  event: PointMissionEvent,
  cursor: PointEventCursor,
): boolean {
  const generation = typeof event.generation === 'number' ? event.generation : null;
  const eventId = typeof event.event_id === 'number' ? event.event_id : 0;

  if (generation !== null && cursor.generation !== null && generation < cursor.generation) {
    return false;
  }

  if (
    eventId > 0
    && cursor.lastEventId > 0
    && generation !== null
    && cursor.generation !== null
    && generation === cursor.generation
    && eventId <= cursor.lastEventId
  ) {
    return false;
  }

  return true;
}

export function isPointMissionTerminalEvent(event: PointMissionEvent): boolean {
  if (event.terminal === true) {
    return true;
  }
  return (
    event.event_type === 'point_completed'
    || event.event_type === 'point_failed'
    || event.event_type === 'point_aborted'
  );
}

export function getPointMissionTerminalOutcome(
  event: PointMissionEvent,
): PointMissionTerminalOutcome | null {
  if (!isPointMissionTerminalEvent(event)) {
    return null;
  }
  if (event.event_type === 'point_completed') return 'completed';
  if (event.event_type === 'point_failed') return 'failed';
  return 'aborted';
}

function nextCursorForEvent(event: PointMissionEvent, cursor: PointEventCursor): PointEventCursor {
  const generation = typeof event.generation === 'number' ? event.generation : cursor.generation;
  const eventId = typeof event.event_id === 'number' ? event.event_id : cursor.lastEventId;
  return {
    generation,
    lastEventId: Math.max(cursor.lastEventId, eventId),
  };
}

function resetCursorForGeneration(event: PointMissionEvent): PointEventCursor {
  return {
    generation: typeof event.generation === 'number' ? event.generation : null,
    lastEventId: 0,
  };
}

/**
 * Apply a point event with generation/event_id guards and downgrade protection.
 */
export function ingestPointEvent(
  statusMap: Record<number, WaypointStatusEntry>,
  event: PointMissionEvent,
  cursor: PointEventCursor,
): PointEventIngestResult {
  const generation = typeof event.generation === 'number' ? event.generation : null;

  if (
    generation !== null
    && cursor.generation !== null
    && generation > cursor.generation
  ) {
    statusMap = {};
    cursor = resetCursorForGeneration(event);
  }

  if (!shouldAcceptPointEvent(event, cursor)) {
    return {
      accepted: false,
      statusMap,
      cursor,
      terminalEvent: null,
    };
  }

  const entry = toStatusEntry(event);
  if (!entry) {
    return {
      accepted: false,
      statusMap,
      cursor: nextCursorForEvent(event, cursor),
      terminalEvent: null,
    };
  }

  const existing = statusMap[event.point_index];
  if (isEntryStatusDowngrade(existing, entry)) {
    return {
      accepted: false,
      statusMap,
      cursor: nextCursorForEvent(event, cursor),
      terminalEvent: null,
    };
  }

  const nextMap = {
    ...statusMap,
    [event.point_index]: entry,
  };

  const nextCursor = nextCursorForEvent(event, cursor);
  const terminalEvent = isPointMissionTerminalEvent(event) ? event : null;

  return {
    accepted: true,
    statusMap: nextMap,
    cursor: nextCursor,
    terminalEvent,
  };
}

/**
 * Apply a point event to a status map (keyed by point_index).
 * Returns a new map (immutable update).
 * @deprecated Prefer ingestPointEvent for guarded ingestion.
 */
export function applyPointEvent(
  statusMap: Record<number, WaypointStatusEntry>,
  event: PointMissionEvent,
): Record<number, WaypointStatusEntry> {
  return ingestPointEvent(statusMap, event, INITIAL_POINT_EVENT_CURSOR).statusMap;
}

/**
 * Rebuild a status map from a batch of events (used for reconnect backfill).
 * Events are applied in order with generation/event_id guards.
 */
export function buildStatusMapFromEvents(
  events: PointMissionEvent[],
  initialMap: Record<number, WaypointStatusEntry> = {},
  initialCursor: PointEventCursor = INITIAL_POINT_EVENT_CURSOR,
): { statusMap: Record<number, WaypointStatusEntry>; cursor: PointEventCursor; terminalEvent: PointMissionEvent | null } {
  let map = initialMap;
  let cursor = initialCursor;
  let terminalEvent: PointMissionEvent | null = null;

  for (const event of events) {
    const result = ingestPointEvent(map, event, cursor);
    if (result.accepted) {
      map = result.statusMap;
      cursor = result.cursor;
      if (result.terminalEvent) {
        terminalEvent = result.terminalEvent;
      }
    } else if (result.cursor.lastEventId > cursor.lastEventId) {
      cursor = result.cursor;
    }
  }

  return { statusMap: map, cursor, terminalEvent };
}

/**
 * Clear manual-wait state after a successful continue without erasing completed progress.
 */
export function clearWaitingAfterContinue(
  statusMap: Record<number, WaypointStatusEntry>,
): Record<number, WaypointStatusEntry> {
  const next = { ...statusMap };
  for (const [idxStr, entry] of Object.entries(next)) {
    if (entry.status !== 'waiting') continue;
    const idx = parseInt(idxStr, 10);
    next[idx] = {
      ...entry,
      status: 'completed',
      eventType: 'point_completed',
    };
  }
  return next;
}

/**
 * Determine if the "Next / Continue" button should be visible.
 * Only shown when any point is in `waiting` state.
 */
export function hasWaitingForContinue(
  statusMap: Record<number, WaypointStatusEntry>,
): boolean {
  return Object.values(statusMap).some((e) => e.status === 'waiting');
}

/**
 * Get the active or final point index (0-based).
 * Retains the last progressed index after mission completion.
 */
export function getCurrentPointIndex(
  statusMap: Record<number, WaypointStatusEntry>,
): number | null {
  const entries = Object.entries(statusMap);
  const tracked = entries
    .filter(([, e]) => CURRENT_INDEX_STATUSES.has(e.status))
    .map(([idx]) => parseInt(idx, 10));
  if (tracked.length === 0) return null;
  return Math.max(...tracked);
}