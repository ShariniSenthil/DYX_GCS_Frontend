/**
 * usePointMissionEvents — Single owner of `point_mission_event` socket ingestion.
 *
 * Features:
 * - Subscribes to `point_mission_event` socket events (not forwarded via telemetry)
 * - On socket reconnect, fetches missed events since last event ID
 * - Builds and maintains a `statusMap` keyed by point_index
 * - Guards against stale generations, duplicate event IDs, and status downgrades
 * - Exposes terminal mission outcomes from authoritative PX4 journal events
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getPointEvents, getPointStatus } from '../services/missionLifecycleService';
import {
  buildStatusMapFromEvents,
  clearWaitingAfterContinue,
  getCurrentPointIndex,
  getPointMissionTerminalOutcome,
  hasWaitingForContinue,
  ingestPointEvent,
  INITIAL_POINT_EVENT_CURSOR,
  type PointEventCursor,
  type PointMissionTerminalOutcome,
  type WaypointStatusEntry,
} from '../adapters/pointEventAdapter';
import type { PointMissionEvent } from '../types/px4/mission';
import { POINT_MISSION_ENABLED } from '../config/featureFlags';

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

function terminalStateFromEvent(event: PointMissionEvent): PointMissionTerminalState | null {
  const outcome = getPointMissionTerminalOutcome(event);
  if (!outcome) return null;
  return { outcome, event };
}

export function usePointMissionEvents(
  socket: Socket | null,
  connectionState: string,
): UsePointMissionEventsResult {
  const [statusMap, setStatusMap] = useState<Record<number, WaypointStatusEntry>>({});
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const [expectedGeneration, setExpectedGeneration] = useState<number | null>(null);
  const [missionTerminal, setMissionTerminal] = useState<PointMissionTerminalState | null>(null);

  const statusMapRef = useRef(statusMap);
  const cursorRef = useRef<PointEventCursor>(INITIAL_POINT_EVENT_CURSOR);

  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  const syncCursor = useCallback((cursor: PointEventCursor) => {
    cursorRef.current = cursor;
    setLastEventId(cursor.lastEventId > 0 ? cursor.lastEventId : null);
    if (typeof cursor.generation === 'number') {
      setExpectedGeneration(cursor.generation);
    }
  }, []);

  const resetStatusMap = useCallback(() => {
    statusMapRef.current = {};
    setStatusMap({});
    setLastEventId(null);
    setExpectedGeneration(null);
    setMissionTerminal(null);
    cursorRef.current = INITIAL_POINT_EVENT_CURSOR;
  }, []);

  const clearMissionTerminal = useCallback(() => {
    setMissionTerminal(null);
  }, []);

  const acknowledgeContinueSuccess = useCallback(() => {
    setStatusMap((prev) => {
      const next = clearWaitingAfterContinue(prev);
      statusMapRef.current = next;
      return next;
    });
  }, []);

  const handlePointEvent = useCallback((raw: unknown) => {
    if (!POINT_MISSION_ENABLED) return;
    const event = raw as PointMissionEvent;
    const result = ingestPointEvent(statusMapRef.current, event, cursorRef.current);

    syncCursor(result.cursor);

    if (result.accepted) {
      statusMapRef.current = result.statusMap;
      setStatusMap(result.statusMap);
    }

    if (result.terminalEvent) {
      const terminal = terminalStateFromEvent(result.terminalEvent);
      if (terminal) {
        setMissionTerminal(terminal);
      }
    }
  }, [syncCursor]);

  const backfill = useCallback(async () => {
    if (!POINT_MISSION_ENABLED) return;
    try {
      const response = await getPointEvents(
        cursorRef.current.lastEventId > 0 ? cursorRef.current.lastEventId : undefined,
      );

      if (response.events.length === 0) {
        if (typeof response.last_event_id === 'number' && response.last_event_id > 0) {
          syncCursor({
            ...cursorRef.current,
            lastEventId: Math.max(cursorRef.current.lastEventId, response.last_event_id),
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
        if (terminal) {
          setMissionTerminal(terminal);
        }
      }
    } catch {
      // Silent — backfill is best-effort
    }
  }, [syncCursor]);

  useEffect(() => {
    if (!socket || !POINT_MISSION_ENABLED) return;
    socket.on('point_mission_event', handlePointEvent);
    return () => {
      socket.off('point_mission_event', handlePointEvent);
    };
  }, [socket, handlePointEvent]);

  useEffect(() => {
    if (connectionState !== 'connected' || !POINT_MISSION_ENABLED) return;
    void backfill();
    void getPointStatus()
      .then((st) => {
        if (typeof st.expected_generation === 'number') {
          setExpectedGeneration(st.expected_generation);
          cursorRef.current = {
            ...cursorRef.current,
            generation: st.expected_generation,
          };
        }
      })
      .catch(() => {});
  }, [connectionState, backfill]);

  return {
    statusMap,
    waitingForContinue: hasWaitingForContinue(statusMap),
    currentPointIndex: getCurrentPointIndex(statusMap),
    lastEventId,
    expectedGeneration,
    missionTerminal,
    resetStatusMap,
    acknowledgeContinueSuccess,
    clearMissionTerminal,
  };
}

export default usePointMissionEvents;