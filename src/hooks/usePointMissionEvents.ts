/**
 * usePointMissionEvents — single owner of point-progress socket ingestion.
 *
 * The current rover backend emits:
 *   point_event, point_completed, point_skipped, point_failed
 * together with authoritative mission_status / mission_progress snapshots.
 *
 * Older point_mission_event and point-history code is retained for backward
 * compatibility, but the unavailable history endpoints are disabled for the
 * current backend instead of being deleted.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Socket } from "socket.io-client";
import { getPointEvents, getPointStatus } from "../services/missionLifecycleService";
import {
  buildStatusMapFromEvents,
  clearWaitingAfterContinue,
  getCurrentPointIndex,
  getPointMissionTerminalOutcome,
  hasWaitingForContinue,
  ingestPointEvent,
  INITIAL_POINT_EVENT_CURSOR,
  reconcilePointStatusSnapshot,
  type PointEventCursor,
  type PointMissionTerminalOutcome,
  type WaypointStatusEntry,
} from "../adapters/pointEventAdapter";
import type {
  PointEventType,
  PointMissionEvent,
} from "../types/px4/mission";
import { POINT_MISSION_ENABLED } from "../config/featureFlags";
import { useTelemetry } from "../context/TelemetryContext";

/**
 * The uploaded backend does not expose /api/mission/point/events or
 * /api/mission/point/status. Keep the previous implementation available for a
 * future backend version without calling unavailable routes today.
 */
const LEGACY_POINT_HISTORY_ENABLED = false;

const BACKEND_POINT_EVENTS = [
  "point_event",
  "point_completed",
  "point_skipped",
  "point_failed",
] as const;

const MISSION_SNAPSHOT_EVENTS = [
  "mission_status",
  "mission_progress",
  "mission_state",
] as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface PointMissionTerminalState {
  outcome: PointMissionTerminalOutcome;
  event: PointMissionEvent;
}

export interface UsePointMissionEventsResult {
  statusMap: Record<number, WaypointStatusEntry>;
  waitingForContinue: boolean;
  currentPointIndex: number | null;
  lastEventId: number | null;
  expectedGeneration: number | null;
  missionTerminal: PointMissionTerminalState | null;
  resetStatusMap: () => void;
  acknowledgeContinueSuccess: () => void;
  clearMissionTerminal: () => void;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoTimestampFromUnixNanoseconds(value: unknown): string | undefined {
  const nanoseconds = finiteNumber(value);
  if (nanoseconds === null) return undefined;

  const timestamp = new Date(nanoseconds / 1_000_000);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString()
    : undefined;
}

function backendEventType(
  socketEventName: string,
  payload: UnknownRecord,
): PointEventType {
  const raw = stringValue(
    payload.event_type ?? payload.event ?? payload.status ?? socketEventName,
  ).toUpperCase();

  if (socketEventName === "point_skipped" || raw.includes("SKIP")) {
    return "point_skipped";
  }

  if (socketEventName === "point_failed" || raw.includes("FAIL")) {
    return "point_failed";
  }

  if (
    socketEventName === "point_completed" ||
    raw.includes("COMPLETE") ||
    raw.includes("MARKED")
  ) {
    return "point_completed";
  }

  if (raw.includes("PAUSE")) return "point_paused";
  if (raw.includes("RESUME")) return "point_resumed";
  if (raw.includes("DWELL") || raw.includes("HOLD")) {
    return "point_dwell_started";
  }
  if (raw.includes("ARRIV") || raw.includes("REACH")) {
    return "point_arrived";
  }
  if (raw.includes("START") || raw.includes("ACTIVE")) {
    return "point_leg_started";
  }

  // A generic point_event means the backend has reported progress for that
  // point. Treat it as arrival rather than completion unless its payload says
  // otherwise.
  return "point_arrived";
}

function terminalStateFromEvent(
  event: PointMissionEvent,
): PointMissionTerminalState | null {
  const outcome = getPointMissionTerminalOutcome(event);
  return outcome ? { outcome, event } : null;
}

export function usePointMissionEvents(
  socket: Socket | null,
  connectionState: string,
): UsePointMissionEventsResult {
  const { roverPosition } = useTelemetry();

  const [statusMap, setStatusMap] = useState<
    Record<number, WaypointStatusEntry>
  >({});
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const [expectedGeneration, setExpectedGeneration] = useState<number | null>(
    null,
  );
  const [authoritativeCurrentIndex, setAuthoritativeCurrentIndex] = useState<
    number | null
  >(null);
  const [missionTerminal, setMissionTerminal] =
    useState<PointMissionTerminalState | null>(null);

  const statusMapRef = useRef(statusMap);
  const cursorRef = useRef<PointEventCursor>(INITIAL_POINT_EVENT_CURSOR);
  const roverPositionRef = useRef(roverPosition);
  const syntheticEventIdRef = useRef(0);
  const lastKnownTotalRef = useRef(0);
  const authoritativeCurrentIndexRef = useRef<number | null>(null);

  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  useEffect(() => {
    roverPositionRef.current = roverPosition;
  }, [roverPosition]);

  const syncCursor = useCallback((cursor: PointEventCursor) => {
    cursorRef.current = cursor;
    setLastEventId(cursor.lastEventId > 0 ? cursor.lastEventId : null);
    if (typeof cursor.generation === "number") {
      setExpectedGeneration(cursor.generation);
    }
  }, []);

  const resetStatusMap = useCallback(() => {
    statusMapRef.current = {};
    setStatusMap({});
    setLastEventId(null);
    setExpectedGeneration(null);
    authoritativeCurrentIndexRef.current = null;
    setAuthoritativeCurrentIndex(null);
    setMissionTerminal(null);
    cursorRef.current = INITIAL_POINT_EVENT_CURSOR;
    syntheticEventIdRef.current = 0;
    lastKnownTotalRef.current = 0;
  }, []);

  const clearMissionTerminal = useCallback(() => {
    setMissionTerminal(null);
  }, []);

  const acknowledgeContinueSuccess = useCallback(() => {
    setStatusMap((previous) => {
      const next = clearWaitingAfterContinue(previous);
      statusMapRef.current = next;
      return next;
    });
  }, []);

  const handleNormalizedPointEvent = useCallback(
    (event: PointMissionEvent) => {
      if (!POINT_MISSION_ENABLED) return;

      const result = ingestPointEvent(
        statusMapRef.current,
        event,
        cursorRef.current,
      );

      syncCursor(result.cursor);

      if (result.accepted) {
        statusMapRef.current = result.statusMap;
        setStatusMap(result.statusMap);
        authoritativeCurrentIndexRef.current = event.point_index;
        setAuthoritativeCurrentIndex(event.point_index);
      }

      if (result.terminalEvent) {
        const terminal = terminalStateFromEvent(result.terminalEvent);
        if (terminal) setMissionTerminal(terminal);
      }
    },
    [syncCursor],
  );

  const normalizeBackendPointEvent = useCallback(
    (socketEventName: string, raw: unknown): PointMissionEvent | null => {
      const payload = asRecord(raw);
      if (!payload) return null;

      const pointIndexValue = finiteNumber(
        payload.point_index ??
          payload.active_point_index ??
          payload.current_point_index,
      );

      if (pointIndexValue === null || pointIndexValue < 0) return null;

      syntheticEventIdRef.current += 1;

      const explicitEventId = finiteNumber(payload.event_id);
      const generation = finiteNumber(payload.generation) ?? 0;
      const latestPosition = roverPositionRef.current;
      const latitude = finiteNumber(payload.lat ?? payload.latitude);
      const longitude = finiteNumber(
        payload.lon ?? payload.lng ?? payload.longitude,
      );

      return {
        event_id:
          explicitEventId !== null
            ? Math.trunc(explicitEventId)
            : syntheticEventIdRef.current,
        event_type: backendEventType(socketEventName, payload),
        point_index: Math.trunc(pointIndexValue),
        generation: Math.trunc(generation),
        timestamp:
          stringValue(
            payload.timestamp ?? payload.received_at ?? payload.updated_at,
          ) || new Date().toISOString(),
        terminal: payload.terminal === true,
        lat: latitude ?? latestPosition?.lat,
        lon: longitude ?? latestPosition?.lng,
        reason: stringValue(payload.reason) || undefined,
        message:
          stringValue(payload.message ?? payload.event ?? payload.status) ||
          undefined,
      };
    },
    [],
  );

  const handleMissionSnapshot = useCallback((raw: unknown) => {
    const root = asRecord(raw);
    if (!root) return;
    const mission = asRecord(root.mission) ?? root;

    const state = stringValue(mission.state).toUpperCase();
    if (state === "EMPTY" || state === "CLEARED") {
      resetStatusMap();
      return;
    }

    const totalPoints = finiteNumber(mission.total_points);
    if (totalPoints !== null) {
      lastKnownTotalRef.current = Math.max(0, Math.trunc(totalPoints));
    }

    const pointIndex = finiteNumber(
      mission.active_point_index ??
        mission.current_point_index ??
        mission.point_index,
    );

    if (pointIndex !== null && pointIndex >= 0) {
      const normalizedIndex = Math.trunc(pointIndex);
      authoritativeCurrentIndexRef.current = normalizedIndex;
      setAuthoritativeCurrentIndex(normalizedIndex);
    }

    const snapshotTimestamp =
      stringValue(
        mission.timestamp ??
          mission.updated_at ??
          mission.received_at ??
          root.timestamp ??
          root.updated_at ??
          root.received_at,
      ) ||
      isoTimestampFromUnixNanoseconds(
        mission.timestamp_unix_ns ?? root.timestamp_unix_ns,
      );
    const reconciledMap = reconcilePointStatusSnapshot(
      statusMapRef.current,
      mission.point_status,
      snapshotTimestamp,
    );

    if (reconciledMap !== statusMapRef.current) {
      statusMapRef.current = reconciledMap;
      setStatusMap(reconciledMap);
    }
  }, [resetStatusMap]);

  /** Legacy reconnect backfill retained but disabled for this backend. */
  const backfill = useCallback(async () => {
    if (!POINT_MISSION_ENABLED || !LEGACY_POINT_HISTORY_ENABLED) return;

    try {
      const response = await getPointEvents(
        cursorRef.current.lastEventId > 0
          ? cursorRef.current.lastEventId
          : undefined,
      );

      if (response.events.length === 0) {
        if (
          typeof response.last_event_id === "number" &&
          response.last_event_id > 0
        ) {
          syncCursor({
            ...cursorRef.current,
            lastEventId: Math.max(
              cursorRef.current.lastEventId,
              response.last_event_id,
            ),
          });
        }
        return;
      }

      const batch = buildStatusMapFromEvents(
        response.events,
        statusMapRef.current,
        cursorRef.current,
      );

      statusMapRef.current = batch.statusMap;
      setStatusMap(batch.statusMap);
      syncCursor(batch.cursor);

      if (batch.terminalEvent) {
        const terminal = terminalStateFromEvent(batch.terminalEvent);
        if (terminal) setMissionTerminal(terminal);
      }
    } catch {
      // Best-effort compatibility path.
    }
  }, [syncCursor]);

  useEffect(() => {
    if (!socket || !POINT_MISSION_ENABLED) return;

    // Existing event retained for an older backend version.
    socket.on("point_mission_event", handleNormalizedPointEvent);

    const backendHandlers = BACKEND_POINT_EVENTS.map((eventName) => {
      const handler = (raw: unknown) => {
        const event = normalizeBackendPointEvent(eventName, raw);
        if (event) handleNormalizedPointEvent(event);
      };
      socket.on(eventName, handler);
      return { eventName, handler };
    });

    const snapshotHandlers = MISSION_SNAPSHOT_EVENTS.map((eventName) => {
      const handler = (raw: unknown) => handleMissionSnapshot(raw);
      socket.on(eventName, handler);
      return { eventName, handler };
    });

    const handleMissionCompleted = (raw: unknown) => {
      handleMissionSnapshot(raw);

      const payload = asRecord(raw) ?? {};
      const suppliedIndex = finiteNumber(
        payload.active_point_index ?? payload.current_point_index,
      );
      const finalIndex = Math.max(
        0,
        Math.trunc(
          suppliedIndex ??
            authoritativeCurrentIndexRef.current ??
            Math.max(0, lastKnownTotalRef.current - 1),
        ),
      );

      syntheticEventIdRef.current += 1;
      const terminalEvent: PointMissionEvent = {
        event_id: syntheticEventIdRef.current,
        event_type: "point_completed",
        point_index: finalIndex,
        generation: cursorRef.current.generation ?? 0,
        timestamp: new Date().toISOString(),
        terminal: true,
        message: "Mission completed",
      };

      const terminal = terminalStateFromEvent(terminalEvent);
      if (terminal) setMissionTerminal(terminal);
    };

    socket.on("mission_completed", handleMissionCompleted);

    return () => {
      socket.off("point_mission_event", handleNormalizedPointEvent);
      backendHandlers.forEach(({ eventName, handler }) => {
        socket.off(eventName, handler);
      });
      snapshotHandlers.forEach(({ eventName, handler }) => {
        socket.off(eventName, handler);
      });
      socket.off("mission_completed", handleMissionCompleted);
    };
  }, [
    socket,
    handleNormalizedPointEvent,
    normalizeBackendPointEvent,
    handleMissionSnapshot,
  ]);

  useEffect(() => {
    if (
      connectionState !== "connected" ||
      !POINT_MISSION_ENABLED ||
      !LEGACY_POINT_HISTORY_ENABLED
    ) {
      return;
    }

    void backfill();
    void getPointStatus()
      .then((status) => {
        if (typeof status.expected_generation === "number") {
          setExpectedGeneration(status.expected_generation);
          cursorRef.current = {
            ...cursorRef.current,
            generation: status.expected_generation,
          };
        }
        if (typeof status.point_index === "number") {
          authoritativeCurrentIndexRef.current = status.point_index;
          setAuthoritativeCurrentIndex(status.point_index);
        }
      })
      .catch(() => {});
  }, [connectionState, backfill]);

  return {
    statusMap,
    waitingForContinue: hasWaitingForContinue(statusMap),
    currentPointIndex:
      authoritativeCurrentIndex ?? getCurrentPointIndex(statusMap),
    lastEventId,
    expectedGeneration,
    missionTerminal,
    resetStatusMap,
    acknowledgeContinueSuccess,
    clearMissionTerminal,
  };
}

export default usePointMissionEvents;
