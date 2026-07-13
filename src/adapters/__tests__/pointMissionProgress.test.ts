import {
  buildStatusMapFromEvents,
  clearWaitingAfterContinue,
  getCurrentPointIndex,
  hasWaitingForContinue,
  ingestPointEvent,
  INITIAL_POINT_EVENT_CURSOR,
  isPointMissionTerminalEvent,
  type WaypointStatusEntry,
} from '../pointEventAdapter';
import {
  buildLegacyStatusMapFromPointMap,
  mergeLegacyStatusMap,
  pointIndexToSn,
} from '../px4PointStatusBridge';
import type { PointMissionEvent } from '../../types/px4/mission';
import type { Waypoint } from '../../components/missionreport/types';
import {
  normalizePointContinueResponse,
  normalizePointMissionStatus,
  normalizePointSkipResponse,
} from '../../services/px4PointApiNormalize';

const waypoints: Waypoint[] = [
  { sn: 1, block: 'A', row: '1', pile: '1', lat: 1, lon: 1, alt: 0, status: 'Pending', time: '', remark: '' },
  { sn: 2, block: 'A', row: '1', pile: '2', lat: 2, lon: 2, alt: 0, status: 'Pending', time: '', remark: '' },
  { sn: 3, block: 'A', row: '1', pile: '3', lat: 3, lon: 3, alt: 0, status: 'Pending', time: '', remark: '' },
];

function evt(
  partial: Partial<PointMissionEvent> & Pick<PointMissionEvent, 'event_id' | 'event_type' | 'point_index'>,
): PointMissionEvent {
  return {
    generation: 1,
    timestamp: '2026-06-30T12:00:00.000Z',
    ...partial,
  };
}

describe('point event ingest protection', () => {
  test('rejects duplicate and older event IDs within the same generation', () => {
    let map: Record<number, WaypointStatusEntry> = {};
    let cursor = INITIAL_POINT_EVENT_CURSOR;

    const first = ingestPointEvent(map, evt({
      event_id: 5,
      event_type: 'point_leg_started',
      point_index: 0,
      generation: 2,
    }), cursor);
    expect(first.accepted).toBe(true);
    map = first.statusMap;
    cursor = first.cursor;

    const duplicate = ingestPointEvent(map, evt({
      event_id: 5,
      event_type: 'point_arrived',
      point_index: 0,
      generation: 2,
    }), cursor);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.statusMap[0]?.status).toBe('active');

    const older = ingestPointEvent(map, evt({
      event_id: 4,
      event_type: 'point_marked',
      point_index: 0,
      generation: 2,
    }), cursor);
    expect(older.accepted).toBe(false);
  });

  test('rejects stale generation events', () => {
    const map: Record<number, WaypointStatusEntry> = {
      0: { status: 'active', timestamp: 't', eventType: 'point_leg_started' },
    };
    const cursor = { generation: 3, lastEventId: 10 };

    const stale = ingestPointEvent(map, evt({
      event_id: 11,
      event_type: 'point_arrived',
      point_index: 0,
      generation: 2,
    }), cursor);

    expect(stale.accepted).toBe(false);
  });

  test('prevents status downgrades after completion', () => {
    let map: Record<number, WaypointStatusEntry> = {};
    let cursor = INITIAL_POINT_EVENT_CURSOR;

    const completed = ingestPointEvent(map, evt({
      event_id: 1,
      event_type: 'point_completed',
      point_index: 1,
      generation: 1,
      terminal: true,
    }), cursor);
    map = completed.statusMap;
    cursor = completed.cursor;

    const regress = ingestPointEvent(map, evt({
      event_id: 2,
      event_type: 'point_arrived',
      point_index: 1,
      generation: 1,
    }), cursor);

    expect(regress.accepted).toBe(false);
    expect(map[1].status).toBe('completed');
  });

  test('resets map when a newer generation arrives', () => {
    let map: Record<number, WaypointStatusEntry> = {
      0: { status: 'completed', timestamp: 't', eventType: 'point_completed' },
    };
    let cursor = { generation: 1, lastEventId: 4 };

    const nextRun = ingestPointEvent(map, evt({
      event_id: 1,
      event_type: 'point_leg_started',
      point_index: 0,
      generation: 2,
    }), cursor);

    expect(nextRun.accepted).toBe(true);
    expect(nextRun.statusMap[0]?.status).toBe('active');
    expect(Object.keys(nextRun.statusMap)).toHaveLength(1);
  });
});

describe('reconnect backfill', () => {
  test('applies ordered events and advances cursor', () => {
    const events = [
      evt({ event_id: 3, event_type: 'point_leg_started', point_index: 0 }),
      evt({ event_id: 4, event_type: 'point_waiting_for_continue', point_index: 0 }),
      evt({ event_id: 5, event_type: 'point_leg_started', point_index: 1 }),
    ];

    const batch = buildStatusMapFromEvents(events, {}, { generation: 1, lastEventId: 2 });
    expect(batch.cursor.lastEventId).toBe(5);
    expect(batch.statusMap[0]?.status).toBe('waiting');
    expect(batch.statusMap[1]?.status).toBe('active');
  });

  test('ignores out-of-order duplicates during backfill', () => {
    const events = [
      evt({ event_id: 6, event_type: 'point_marked', point_index: 0 }),
      evt({ event_id: 5, event_type: 'point_arrived', point_index: 0 }),
    ];

    const batch = buildStatusMapFromEvents(events, {}, INITIAL_POINT_EVENT_CURSOR);
    expect(batch.statusMap[0]?.status).toBe('marked');
  });
});

describe('skip event flow', () => {
  test('records skipped point and maps to wp.sn without losing prior progress', () => {
    const events = [
      evt({ event_id: 1, event_type: 'point_leg_started', point_index: 0 }),
      evt({ event_id: 2, event_type: 'point_marked', point_index: 0 }),
      evt({ event_id: 3, event_type: 'point_skipped', point_index: 1, reason: 'operator_skip' }),
    ];

    const batch = buildStatusMapFromEvents(events);
    const legacy = buildLegacyStatusMapFromPointMap(batch.statusMap, waypoints);

    expect(batch.statusMap[0]?.status).toBe('marked');
    expect(batch.statusMap[1]?.status).toBe('skipped');
    expect(legacy[1]?.status).toBe('marked');
    expect(legacy[2]?.status).toBe('skipped');
  });
});

describe('continue and waiting state', () => {
  test('clearWaitingAfterContinue preserves completed points', () => {
    const map: Record<number, WaypointStatusEntry> = {
      0: { status: 'completed', timestamp: 't0', eventType: 'point_completed' },
      1: { status: 'waiting', timestamp: 't1', eventType: 'point_waiting_for_continue' },
    };

    const cleared = clearWaitingAfterContinue(map);
    expect(cleared[0].status).toBe('completed');
    expect(cleared[1].status).toBe('completed');
    expect(hasWaitingForContinue(cleared)).toBe(false);
  });
});

describe('final index retention', () => {
  test('getCurrentPointIndex keeps last progressed index after completion', () => {
    const map: Record<number, WaypointStatusEntry> = {
      0: { status: 'completed', timestamp: 't0', eventType: 'point_completed' },
      1: { status: 'completed', timestamp: 't1', eventType: 'point_completed' },
    };

    expect(getCurrentPointIndex(map)).toBe(1);
  });
});

describe('px4PointStatusBridge mapping', () => {
  test('maps 0-based point_index to 1-based wp.sn', () => {
    expect(pointIndexToSn(0, waypoints)).toBe(1);
    expect(pointIndexToSn(2, waypoints)).toBe(3);
  });

  test('merges PX4 statuses without downgrading terminal states', () => {
    const pointMap = {
      1: { status: 'completed' as const, timestamp: 't', eventType: 'point_completed' as const },
    };
    const px4Legacy = buildLegacyStatusMapFromPointMap(pointMap, waypoints);
    expect(px4Legacy[2].status).toBe('completed');

    const merged = mergeLegacyStatusMap(
      { 2: { status: 'completed', reached: true, marked: true } },
      { 2: { status: 'loading', reached: false } },
    );
    expect(merged[2].status).toBe('completed');
  });
});

describe('point mission terminal events', () => {
  test('detects authoritative terminal journal events', () => {
    expect(isPointMissionTerminalEvent(evt({
      event_id: 9,
      event_type: 'point_completed',
      point_index: 2,
      terminal: true,
    }))).toBe(true);

    const batch = buildStatusMapFromEvents([
      evt({ event_id: 8, event_type: 'point_marked', point_index: 2 }),
      evt({ event_id: 9, event_type: 'point_completed', point_index: 2, terminal: true }),
    ]);
    expect(batch.terminalEvent?.event_type).toBe('point_completed');
  });
});

describe('PX4 point API normalization', () => {
  test('normalizes continue response', () => {
    expect(normalizePointContinueResponse({ continued: true, message: 'ok' })).toEqual({
      success: true,
      message: 'ok',
      point_index: undefined,
    });
  });

  test('normalizes skip response and point status', () => {
    expect(normalizePointSkipResponse({ skipped: true, message: 'skipped' })).toEqual({
      success: true,
      message: 'skipped',
      skipped_index: undefined,
      next_index: undefined,
    });

    expect(normalizePointMissionStatus({
      current_point_index: 2,
      point_mission_generation: 4,
      point_mission_state: 'navigating',
      total_points: 5,
      waiting_for_continue: false,
    })).toEqual({
      point_index: 2,
      expected_generation: 4,
      state: 'navigating',
      total_points: 5,
      waiting_for_continue: false,
    });
  });
});