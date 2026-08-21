/**
 * Map point mission events to the legacy status map.
 */

import type { PointMissionEvent, PointEventType } from "../types/px4/mission";

export type WaypointStatusKey =
  | "pending"
  | "active"
  | "arrived"
  | "marked"
  | "completed"
  | "skipped"
  | "waiting"
  | "paused"
  | "failed"
  | "aborted";

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

export type PointMissionTerminalOutcome = "completed" | "failed" | "aborted";

export interface PointEventIngestResult {
  accepted: boolean;
  statusMap: Record<number, WaypointStatusEntry>;
  cursor: PointEventCursor;
  terminalEvent: PointMissionEvent | null;
}

const EVENT_TYPE_TO_STATUS: Record<PointEventType, WaypointStatusKey> = {
  point_leg_started: "active",
  point_arrived: "arrived",
  point_dwell_started: "arrived",
  point_marked: "marked",
  point_waiting_for_continue: "waiting",
  point_paused: "paused",
  point_resumed: "active",
  point_skipped: "skipped",
  point_completed: "completed",
  point_failed: "failed",
  point_aborted: "aborted",
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

const SNAPSHOT_STATUS_TO_ENTRY: Record<
  string,
  { status: WaypointStatusKey; eventType: PointEventType }
> = {
  PENDING: { status: "pending", eventType: "point_leg_started" },
  ACTIVE: { status: "active", eventType: "point_leg_started" },
  COMPLETED: { status: "completed", eventType: "point_completed" },
  FAILED: { status: "failed", eventType: "point_failed" },
  SKIPPED: { status: "skipped", eventType: "point_skipped" },
  ABORTED: { status: "aborted", eventType: "point_aborted" },
  CANCELLED: { status: "aborted", eventType: "point_aborted" },
  CANCELED: { status: "aborted", eventType: "point_aborted" },
  STOPPED: { status: "aborted", eventType: "point_aborted" },
  PAUSED: { status: "paused", eventType: "point_paused" },
};

const CURRENT_INDEX_STATUSES = new Set<WaypointStatusKey>([
  "active",
  "arrived",
  "waiting",
  "marked",
  "completed",
  "skipped",
  "paused",
  "failed",
  "aborted",
]);

export function toStatusEntry(
  event: PointMissionEvent,
): WaypointStatusEntry | null {
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
    (ENTRY_STATUS_PRIORITY[incoming.status] ?? 0) <
    (ENTRY_STATUS_PRIORITY[existing.status] ?? 0)
  );
}

/**
 * Reconcile the event-derived point map with the authoritative backend
 * `point_status` snapshot. This repairs gaps when two backend events happen
 * between Socket.IO broadcast ticks (for example, a final point failure
 * immediately followed by mission completion).
 *
 * Unknown or malformed snapshot entries are ignored. Existing event details
 * are retained, and the same priority rule used for journal events prevents a
 * snapshot from regressing a point to an earlier lifecycle state.
 */
export function reconcilePointStatusSnapshot(
  statusMap: Record<number, WaypointStatusEntry>,
  rawPointStatus: unknown,
  snapshotTimestamp?: string,
): Record<number, WaypointStatusEntry> {
  if (!Array.isArray(rawPointStatus)) return statusMap;

  let resolvedTimestamp =
    typeof snapshotTimestamp === "string" &&
    Number.isFinite(Date.parse(snapshotTimestamp))
      ? snapshotTimestamp
      : null;
  let nextMap = statusMap;

  rawPointStatus.forEach((rawStatus, pointIndex) => {
    if (typeof rawStatus !== "string") return;

    const mapped = SNAPSHOT_STATUS_TO_ENTRY[rawStatus.trim().toUpperCase()];
    if (!mapped) return;

    const existing = statusMap[pointIndex];
    if (existing?.status === mapped.status) return;

    const incoming: WaypointStatusEntry = {
      ...existing,
      status: mapped.status,
      timestamp:
        resolvedTimestamp ?? (resolvedTimestamp = new Date().toISOString()),
      eventType: mapped.eventType,
    };
    if (isEntryStatusDowngrade(existing, incoming)) return;

    if (nextMap === statusMap) nextMap = { ...statusMap };
    nextMap[pointIndex] = incoming;
  });

  return nextMap;
}

export function shouldAcceptPointEvent(
  event: PointMissionEvent,
  cursor: PointEventCursor,
): boolean {
  const generation =
    typeof event.generation === "number" ? event.generation : null;
  const eventId = typeof event.event_id === "number" ? event.event_id : 0;

  if (
    generation !== null &&
    cursor.generation !== null &&
    generation < cursor.generation
  ) {
    return false;
  }

  if (
    eventId > 0 &&
    cursor.lastEventId > 0 &&
    generation !== null &&
    cursor.generation !== null &&
    generation === cursor.generation &&
    eventId <= cursor.lastEventId
  ) {
    return false;
  }

  return true;
}

/**
 * A completed marking point is not the same as a completed mission.
 * Only an event explicitly marked terminal may close the mission.
 */
export function isPointMissionTerminalEvent(
  event: PointMissionEvent,
): boolean {
  return event.terminal === true;
}

export function getPointMissionTerminalOutcome(
  event: PointMissionEvent,
): PointMissionTerminalOutcome | null {
  if (!isPointMissionTerminalEvent(event)) {
    return null;
  }
  if (event.event_type === "point_completed") return "completed";
  if (event.event_type === "point_failed") return "failed";
  return "aborted";
}

function nextCursorForEvent(
  event: PointMissionEvent,
  cursor: PointEventCursor,
): PointEventCursor {
  const generation =
    typeof event.generation === "number" ? event.generation : cursor.generation;
  const eventId =
    typeof event.event_id === "number" ? event.event_id : cursor.lastEventId;
  return {
    generation,
    lastEventId: Math.max(cursor.lastEventId, eventId),
  };
}

function resetCursorForGeneration(event: PointMissionEvent): PointEventCursor {
  return {
    generation:
      typeof event.generation === "number" ? event.generation : null,
    lastEventId: 0,
  };
}

export function ingestPointEvent(
  statusMap: Record<number, WaypointStatusEntry>,
  event: PointMissionEvent,
  cursor: PointEventCursor,
): PointEventIngestResult {
  const generation =
    typeof event.generation === "number" ? event.generation : null;

  if (
    generation !== null &&
    cursor.generation !== null &&
    generation > cursor.generation
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

export function applyPointEvent(
  statusMap: Record<number, WaypointStatusEntry>,
  event: PointMissionEvent,
): Record<number, WaypointStatusEntry> {
  return ingestPointEvent(
    statusMap,
    event,
    INITIAL_POINT_EVENT_CURSOR,
  ).statusMap;
}

export function buildStatusMapFromEvents(
  events: PointMissionEvent[],
  initialMap: Record<number, WaypointStatusEntry> = {},
  initialCursor: PointEventCursor = INITIAL_POINT_EVENT_CURSOR,
): {
  statusMap: Record<number, WaypointStatusEntry>;
  cursor: PointEventCursor;
  terminalEvent: PointMissionEvent | null;
} {
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

export function clearWaitingAfterContinue(
  statusMap: Record<number, WaypointStatusEntry>,
): Record<number, WaypointStatusEntry> {
  const next = { ...statusMap };
  for (const [idxStr, entry] of Object.entries(next)) {
    if (entry.status !== "waiting") continue;
    const idx = Number.parseInt(idxStr, 10);
    next[idx] = {
      ...entry,
      status: "completed",
      eventType: "point_completed",
    };
  }
  return next;
}

export function hasWaitingForContinue(
  statusMap: Record<number, WaypointStatusEntry>,
): boolean {
  return Object.values(statusMap).some((entry) => entry.status === "waiting");
}

export function getCurrentPointIndex(
  statusMap: Record<number, WaypointStatusEntry>,
): number | null {
  const tracked = Object.entries(statusMap)
    .filter(([, entry]) => CURRENT_INDEX_STATUSES.has(entry.status))
    .map(([idx]) => Number.parseInt(idx, 10));
  if (tracked.length === 0) return null;
  return Math.max(...tracked);
}
