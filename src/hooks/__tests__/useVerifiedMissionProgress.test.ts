/**
 * useVerifiedMissionProgress tests — uses react-test-renderer since the
 * project has no @testing-library/react-hooks package.
 *
 * Key invariants:
 *   1. Terminal detection ONLY from event.terminal === true (never from position)
 *   2. Staleness guard: events with wrong mission_id are discarded
 *   3. Status downgrade guard: terminal statuses cannot be overwritten
 *   4. All 9 event types map to the right status
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { EventEmitter } from 'events';
import { useVerifiedMissionProgress } from '../useVerifiedMissionProgress';
import type { VerifiedTargetEvent } from '../../types/fourwd/mission';

// Minimal socket stub
const makeSocket = () => {
  const ee = new EventEmitter();
  return {
    on: (ev: string, cb: (...a: any[]) => void) => ee.on(ev, cb),
    off: (ev: string, cb: (...a: any[]) => void) => ee.off(ev, cb),
    _emit: (ev: string, ...a: any[]) => ee.emit(ev, ...a),
  } as any;
};

const makeEvent = (overrides: Partial<VerifiedTargetEvent> = {}): VerifiedTargetEvent => ({
  target_index: 0,
  mission_id: 'mission-1',
  event_type: 'target_active',
  timestamp: '2026-06-30T10:00:00Z',
  ...overrides,
});

// Minimal renderHook using react-test-renderer
function renderHook<T>(useHook: () => T) {
  const ref: { current: T } = { current: undefined as any };

  function Wrapper() {
    ref.current = useHook();
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Wrapper));
  });

  const rerender = () =>
    act(() => renderer!.update(React.createElement(Wrapper)));

  return { result: ref, rerender };
}

describe('useVerifiedMissionProgress', () => {
  describe('event_type → status mapping', () => {
    const cases: [VerifiedTargetEvent['event_type'], string][] = [
      ['target_active', 'active'],
      ['target_arrived', 'arrived'],
      ['target_settling', 'settling'],
      ['target_marking', 'marking'],
      ['target_completed', 'completed'],
      ['target_failed', 'failed'],
      ['target_skipped', 'skipped'],
      ['target_stopped', 'stopped'],
      ['target_aborted', 'aborted'],
    ];

    test.each(cases)('%s → %s', (eventType, expectedStatus) => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit('target_event', makeEvent({ event_type: eventType }));
      });

      expect(result.current.verifiedProgressMap[0]?.status).toBe(expectedStatus);
    });
  });

  describe('staleness guard', () => {
    it('discards events with a different mission_id', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit('target_event', makeEvent({ mission_id: 'stale-mission' }));
      });

      expect(result.current.verifiedProgressMap[0]).toBeUndefined();
    });

    it('accepts events with matching mission_id', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit('target_event', makeEvent({ mission_id: 'mission-1' }));
      });

      expect(result.current.verifiedProgressMap[0]).toBeDefined();
    });
  });

  describe('terminal detection', () => {
    it('sets missionTerminal ONLY when event.terminal === true', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit(
          'target_event',
          makeEvent({ event_type: 'target_completed', terminal: false }),
        );
      });
      expect(result.current.missionTerminal).toBeNull();

      act(() => {
        socket._emit(
          'target_event',
          makeEvent({ event_type: 'target_completed', terminal: true }),
        );
      });
      expect(result.current.missionTerminal?.outcome).toBe('completed');
    });

    it('NEVER infers terminal from target_index position alone', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      for (let i = 0; i < 10; i++) {
        act(() => {
          socket._emit(
            'target_event',
            makeEvent({ target_index: i, event_type: 'target_completed' }),
          );
        });
      }
      expect(result.current.missionTerminal).toBeNull();
    });

    it('maps aborted outcome correctly', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_aborted', terminal: true }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('aborted');
    });

    it('maps stopped outcome correctly', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_stopped', terminal: true }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('stopped');
    });

    it('maps failed outcome correctly', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_failed', terminal: true }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('failed');
    });
  });

  describe('downgrade guard', () => {
    it('does not overwrite completed status with active', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_completed' }));
      });
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_active' }));
      });

      expect(result.current.verifiedProgressMap[0]?.status).toBe('completed');
    });
  });

  describe('waitingForContinue', () => {
    it('is true when any target is in arrived status', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_arrived' }));
      });
      expect(result.current.waitingForContinue).toBe(true);
    });

    it('is false when no target is in arrived or settling status', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ event_type: 'target_active' }));
      });
      expect(result.current.waitingForContinue).toBe(false);
    });
  });

  describe('resetProgress', () => {
    it('clears the progress map and missionTerminal', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      act(() => {
        socket._emit('target_event', makeEvent());
        socket._emit('target_event', makeEvent({ event_type: 'target_completed', terminal: true }));
      });
      expect(Object.keys(result.current.verifiedProgressMap).length).toBeGreaterThan(0);

      act(() => {
        result.current.resetProgress();
      });

      expect(result.current.verifiedProgressMap).toEqual({});
      expect(result.current.missionTerminal).toBeNull();
    });
  });

  // ── mission_outcome takes precedence over event_type (test 1) ───────────────

  describe('mission_outcome priority', () => {
    it('prefers mission_outcome over event_type when both are present', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({
          event_type: 'target_failed',   // event_type says "failed"
          terminal: true,
          mission_outcome: 'aborted',    // mission_outcome says "aborted" — wins
        }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('aborted');
      expect(result.current.missionTerminal?.outcome).not.toBe('failed');
    });

    it('uses event_type mapping when mission_outcome is absent', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({
          event_type: 'target_stopped',
          terminal: true,
          // no mission_outcome
        }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('stopped');
    });
  });

  // ── Unknown terminal outcome fails closed as 'failed', never 'completed' (test 2) ──

  describe('unknown terminal outcome fail-closed', () => {
    it('fails closed as failed when mission_outcome is an unknown string', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({
          event_type: 'target_completed',
          terminal: true,
          mission_outcome: 'unknown_future_state' as any,
        }));
      });
      // Must never silently become 'completed'
      expect(result.current.missionTerminal?.outcome).toBe('failed');
      expect(result.current.missionTerminal?.outcome).not.toBe('completed');
    });

    it('fails closed as failed when terminal event_type has no known mapping', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        // terminal=true but event_type is not in EVENT_TO_TERMINAL_OUTCOME and
        // no mission_outcome — must fail closed
        socket._emit('target_event', makeEvent({
          event_type: 'target_active' as any, // not a terminal event_type
          terminal: true,
          // no mission_outcome
        }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('failed');
      expect(result.current.missionTerminal?.outcome).not.toBe('completed');
    });
  });

  // ── Mission ID change resets progress (test 6) ──────────────────────────────

  describe('activeMissionId change', () => {
    it('clears progressMap and missionTerminal when activeMissionId changes from A to B', () => {
      const socket = makeSocket();
      let missionId = 'mission-A';
      const ref: { current: any } = { current: undefined };

      function Wrapper() {
        ref.current = useVerifiedMissionProgress(socket, 'connected', missionId);
        return null;
      }

      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(React.createElement(Wrapper));
      });

      // Accumulate progress under mission-A
      act(() => {
        socket._emit('target_event', makeEvent({ mission_id: 'mission-A' }));
        socket._emit('target_event', makeEvent({
          mission_id: 'mission-A',
          event_type: 'target_completed',
          terminal: true,
        }));
      });
      expect(ref.current.verifiedProgressMap[0]).toBeDefined();
      expect(ref.current.missionTerminal).not.toBeNull();

      // Switch to mission-B — progress from A must vanish
      act(() => {
        missionId = 'mission-B';
        renderer.update(React.createElement(Wrapper));
      });

      expect(ref.current.verifiedProgressMap).toEqual({});
      expect(ref.current.missionTerminal).toBeNull();
    });

    it('does not accept mission-A events after switching to mission-B', () => {
      const socket = makeSocket();
      let missionId = 'mission-A';
      const ref: { current: any } = { current: undefined };

      function Wrapper() {
        ref.current = useVerifiedMissionProgress(socket, 'connected', missionId);
        return null;
      }

      let renderer: any;
      act(() => { renderer = TestRenderer.create(React.createElement(Wrapper)); });

      act(() => {
        missionId = 'mission-B';
        renderer.update(React.createElement(Wrapper));
      });

      // Stale event for mission-A must be ignored
      act(() => {
        socket._emit('target_event', makeEvent({ mission_id: 'mission-A' }));
      });
      expect(ref.current.verifiedProgressMap).toEqual({});
    });
  });

  // ── Duplicate terminal event is idempotent (test 7) ─────────────────────────

  describe('duplicate terminal event idempotency', () => {
    it('applying the same terminal event twice does not change the outcome', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      const ev = makeEvent({ event_type: 'target_completed', terminal: true, event_id: 5 });

      act(() => {
        socket._emit('target_event', ev);
        socket._emit('target_event', ev); // exact duplicate
      });

      expect(result.current.missionTerminal?.outcome).toBe('completed');
      // Map entry is also idempotent — only one entry for index 0
      expect(Object.keys(result.current.verifiedProgressMap)).toHaveLength(1);
    });
  });

  // ── Conflicting terminal cannot overwrite first terminal (test 8) ────────────

  describe('terminal-wins guard', () => {
    it('first terminal outcome is sticky — a later conflicting terminal is rejected', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );

      // First terminal event arrives: aborted
      act(() => {
        socket._emit('target_event', makeEvent({
          event_type: 'target_aborted',
          terminal: true,
          event_id: 1,
        }));
      });
      expect(result.current.missionTerminal?.outcome).toBe('aborted');

      // A second terminal event with a higher event_id tries to overwrite
      act(() => {
        socket._emit('target_event', makeEvent({
          event_type: 'target_completed',
          terminal: true,
          event_id: 2,
        }));
      });

      // First terminal wins — still 'aborted'
      expect(result.current.missionTerminal?.outcome).toBe('aborted');
    });
  });

  // ── Invalid target_index validation (test 9) ─────────────────────────────────

  describe('target_index validation', () => {
    it('ignores events with a negative target_index', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ target_index: -1 }));
      });
      expect(Object.keys(result.current.verifiedProgressMap)).toHaveLength(0);
    });

    it('ignores events with a non-integer target_index', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1'),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ target_index: 1.5 as any }));
      });
      expect(Object.keys(result.current.verifiedProgressMap)).toHaveLength(0);
    });

    it('ignores events where target_index >= totalTargets', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        // 3 total targets → valid indices are 0, 1, 2
        useVerifiedMissionProgress(socket, 'connected', 'mission-1', 3),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ target_index: 3 })); // out of range
        socket._emit('target_event', makeEvent({ target_index: 99 })); // out of range
      });
      expect(Object.keys(result.current.verifiedProgressMap)).toHaveLength(0);
    });

    it('accepts events where target_index < totalTargets', () => {
      const socket = makeSocket();
      const { result } = renderHook(() =>
        useVerifiedMissionProgress(socket, 'connected', 'mission-1', 3),
      );
      act(() => {
        socket._emit('target_event', makeEvent({ target_index: 0 }));
        socket._emit('target_event', makeEvent({ target_index: 2 }));
      });
      expect(Object.keys(result.current.verifiedProgressMap)).toHaveLength(2);
    });
  });
});
