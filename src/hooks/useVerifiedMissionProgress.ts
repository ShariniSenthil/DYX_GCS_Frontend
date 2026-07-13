/**
 * useVerifiedMissionProgress — Consume `target_event` socket events.
 *
 * Responsibilities:
 *   - Subscribes to FOURWD_SOCKET_EVENTS.TARGET_EVENT on the socket.
 *   - Guards against stale mission_id events (different mission ID is discarded).
 *   - Validates target_index (integer, >= 0, < totalTargets when known).
 *   - Guards against status downgrades and terminal overwrites.
 *   - Resets ALL progress state when activeMissionId changes (no cross-mission
 *     leakage — mission A progress can never appear in mission B).
 *   - Exposes verifiedProgressMap: Record<number, VerifiedTargetStatusEntry>
 *     keyed by target_index (0-based).
 *   - Exposes missionTerminal when the backend signals mission end.
 *
 * Terminal detection (confirmed 4WD_SERVER contract):
 *   ONLY event.terminal === true triggers missionTerminal. The hook NEVER
 *   infers mission completion from target_index. The outcome is taken from
 *   event.mission_outcome when present (authoritative); otherwise the
 *   event_type→outcome mapping is used. An unknown terminal outcome fails
 *   closed as 'failed' (never silently 'completed').
 *
 * Independent of PX4 pipeline: does not import pointEventAdapter or
 * px4PointStatusBridge — the type contracts and generation semantics differ.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { FOURWD_SOCKET_EVENTS } from '../config/fourwdEndpoints';
import type {
  VerifiedTargetEvent,
  VerifiedTargetEventType,
  VerifiedTargetStatusEntry,
  VerifiedTargetStatusKey,
  VerifiedMissionTerminalOutcome,
} from '../types/fourwd/mission';

// ── Status priority (downgrade guard) ────────────────────────────────────────

const STATUS_PRIORITY: Record<VerifiedTargetStatusKey, number> = {
  pending:   0,
  active:    1,
  arrived:   2,
  settling:  2,
  marking:   3,
  completed: 4,
  failed:    4,
  skipped:   4,
  stopped:   4,
  aborted:   4,
};

const TERMINAL_STATUSES: ReadonlySet<VerifiedTargetStatusKey> = new Set([
  'completed', 'failed', 'skipped', 'stopped', 'aborted',
]);

function isTerminalStatus(status: VerifiedTargetStatusKey): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isDowngrade(
  existing: VerifiedTargetStatusKey,
  incoming: VerifiedTargetStatusKey,
): boolean {
  return (STATUS_PRIORITY[incoming] ?? 0) < (STATUS_PRIORITY[existing] ?? 0);
}

// ── Event type → status ───────────────────────────────────────────────────────

const EVENT_TO_STATUS: Record<VerifiedTargetEventType, VerifiedTargetStatusKey> = {
  target_active:    'active',
  target_arrived:   'arrived',
  target_settling:  'settling',
  target_marking:   'marking',
  target_completed: 'completed',
  target_failed:    'failed',
  target_skipped:   'skipped',
  target_stopped:   'stopped',
  target_aborted:   'aborted',
};

// ── Terminal outcome mapping ──────────────────────────────────────────────────

const EVENT_TO_TERMINAL_OUTCOME: Partial<
  Record<VerifiedTargetEventType, VerifiedMissionTerminalOutcome>
> = {
  target_completed: 'completed',
  target_failed:    'failed',
  target_aborted:   'aborted',
  target_stopped:   'stopped',
};

const VALID_TERMINAL_OUTCOMES: ReadonlySet<string> = new Set<
  VerifiedMissionTerminalOutcome
>(['completed', 'failed', 'stopped', 'aborted']);

/**
 * Resolve the mission terminal outcome for a terminal event.
 * Precedence: authoritative `mission_outcome` → event_type mapping → fail closed.
 * Never returns 'completed' for an unknown/invalid outcome.
 */
function resolveTerminalOutcome(
  event: VerifiedTargetEvent,
): VerifiedMissionTerminalOutcome {
  const raw = event.mission_outcome;
  if (raw !== undefined && raw !== null) {
    if (VALID_TERMINAL_OUTCOMES.has(raw)) {
      return raw;
    }
    // Protocol error: backend sent a terminal outcome we don't understand.
    console.error(
      '[useVerifiedMissionProgress] Unknown mission_outcome on terminal event; ' +
        'failing closed as "failed":',
      raw,
    );
    return 'failed';
  }
  const mapped = EVENT_TO_TERMINAL_OUTCOME[event.event_type];
  if (mapped) return mapped;
  // Terminal event with no outcome and an unmapped event_type — fail closed.
  console.error(
    '[useVerifiedMissionProgress] Terminal event without mission_outcome and ' +
      'unmapped event_type; failing closed as "failed":',
    event.event_type,
  );
  return 'failed';
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface VerifiedMissionTerminalState {
  outcome: VerifiedMissionTerminalOutcome;
  event: VerifiedTargetEvent;
}

export interface UseVerifiedMissionProgressResult {
  /** Progress by target_index (0-based). */
  verifiedProgressMap: Record<number, VerifiedTargetStatusEntry>;
  /** 0-based index of the currently active target. null if not running. */
  currentTargetIndex: number | null;
  /** Set when the mission reaches a terminal event (event.terminal === true). */
  missionTerminal: VerifiedMissionTerminalState | null;
  /** True when any target is in 'arrived' or 'settling' status. */
  waitingForContinue: boolean;
  /** Reset all progress state. Call when a new mission upload starts. */
  resetProgress: () => void;
  clearMissionTerminal: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVerifiedMissionProgress(
  socket: Socket | null,
  connectionState: string,
  activeMissionId: string | null,
  totalTargets?: number | null,
): UseVerifiedMissionProgressResult {
  const [progressMap, setProgressMap] = useState<
    Record<number, VerifiedTargetStatusEntry>
  >({});
  const [missionTerminal, setMissionTerminal] =
    useState<VerifiedMissionTerminalState | null>(null);

  // Guard against state updates after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const resetProgress = useCallback(() => {
    if (!mountedRef.current) return;
    setProgressMap({});
    setMissionTerminal(null);
  }, []);

  const clearMissionTerminal = useCallback(() => {
    if (!mountedRef.current) return;
    setMissionTerminal(null);
  }, []);

  // Reset ALL progress whenever the active mission changes. This runs before
  // the subscription effect's handler can apply events, so mission A's progress
  // can never appear under mission B.
  useEffect(() => {
    setProgressMap({});
    setMissionTerminal(null);
  }, [activeMissionId]);

  // Subscribe to TARGET_EVENT whenever socket or activeMissionId changes.
  useEffect(() => {
    if (!socket || !activeMissionId) return;

    const eventName = FOURWD_SOCKET_EVENTS.TARGET_EVENT;

    const handleTargetEvent = (event: VerifiedTargetEvent) => {
      // ── Staleness guard ──────────────────────────────────────────────────
      if (event.mission_id !== activeMissionId) {
        console.log(
          '[useVerifiedMissionProgress] Discarding stale event for mission',
          event.mission_id,
          '(active:',
          activeMissionId,
          ')',
        );
        return;
      }

      // ── Target index validation ──────────────────────────────────────────
      const idx = event.target_index;
      if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) {
        console.error(
          '[useVerifiedMissionProgress] Ignoring event with invalid target_index:',
          idx,
        );
        return;
      }
      if (
        typeof totalTargets === 'number' &&
        totalTargets > 0 &&
        idx >= totalTargets
      ) {
        console.error(
          '[useVerifiedMissionProgress] Ignoring out-of-range target_index',
          idx,
          '>= totalTargets',
          totalTargets,
        );
        return;
      }

      const incomingStatus = EVENT_TO_STATUS[event.event_type] ?? 'active';
      const incomingEventId = event.event_id;

      setProgressMap(prev => {
        const existing = prev[idx];

        if (existing) {
          // ── Idempotency: identical event_id replays are no-ops ────────────
          if (
            typeof incomingEventId === 'number' &&
            typeof existing.eventId === 'number' &&
            incomingEventId === existing.eventId
          ) {
            return prev;
          }

          // ── Out-of-order guard: older event_id never overwrites newer ─────
          if (
            typeof incomingEventId === 'number' &&
            typeof existing.eventId === 'number' &&
            incomingEventId < existing.eventId
          ) {
            return prev;
          }

          // ── Terminal-wins: first terminal status is sticky ───────────────
          // A target that already reached a terminal status is never
          // overwritten by a different status (including another terminal).
          if (isTerminalStatus(existing.status)) {
            return prev;
          }

          // ── Downgrade guard (non-terminal) ───────────────────────────────
          if (isDowngrade(existing.status, incomingStatus)) {
            return prev;
          }
        }

        const entry: VerifiedTargetStatusEntry = {
          status: incomingStatus,
          timestamp: event.timestamp,
          lat_achieved: event.lat,
          lon_achieved: event.lon,
          reason: event.reason,
          message: event.message,
          eventType: event.event_type,
          eventId: incomingEventId,
        };

        return { ...prev, [idx]: entry };
      });

      // ── Terminal detection: ONLY from event.terminal === true ────────────
      // Never infer terminal state from target_index position. First terminal
      // event wins — a later terminal event does not replace it.
      if (event.terminal === true) {
        setMissionTerminal(prev => {
          if (prev) return prev; // first terminal wins (idempotent)
          return { outcome: resolveTerminalOutcome(event), event };
        });
      }
    };

    socket.on(eventName, handleTargetEvent);

    return () => {
      socket.off(eventName, handleTargetEvent);
    };
  }, [socket, activeMissionId, totalTargets]);

  // ── Derived values ────────────────────────────────────────────────────────

  const currentTargetIndex: number | null = (() => {
    const activeStatuses: VerifiedTargetStatusKey[] = [
      'active', 'arrived', 'settling', 'marking',
    ];
    let max: number | null = null;
    for (const [idxStr, entry] of Object.entries(progressMap)) {
      if (activeStatuses.includes(entry.status)) {
        const idx = parseInt(idxStr, 10);
        if (max === null || idx > max) max = idx;
      }
    }
    return max;
  })();

  const waitingForContinue = Object.values(progressMap).some(
    e => e.status === 'arrived' || e.status === 'settling',
  );

  return {
    verifiedProgressMap: progressMap,
    currentTargetIndex,
    missionTerminal,
    waitingForContinue,
    resetProgress,
    clearMissionTerminal,
  };
}
