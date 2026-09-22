import {
  CoalescedRefresh,
  classifyMissionEventForReport,
  isTerminalPointEventPayload,
  isTerminalPointSocketEvent,
} from "../reportRefreshScheduler";

function missionStatus(overrides: Record<string, unknown> = {}) {
  return {
    mission_id: "m1",
    mission_run_id: "run-1",
    state: "RUNNING",
    completed_points: 3,
    failed_points: 0,
    skipped_points: 0,
    active_point_index: 3,
    // Continuously varying diagnostics must not count as report changes.
    hold_elapsed_sec: Math.random(),
    rtk_correction_age_sec: Math.random(),
    ...overrides,
  };
}

describe("canonical report refresh starvation", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("50 Hz mission_status + point_completed refreshes within 80 ms", () => {
    const run = jest.fn();
    const refresh = new CoalescedRefresh({ delayMs: 80, run });
    let signature: string | null = null;

    // Hydration snapshot, then 5 s of unchanged 50 Hz mission_status.
    const first = classifyMissionEventForReport(missionStatus(), signature);
    signature = first.signature;
    if (first.refresh) refresh.request();
    jest.advanceTimersByTime(80);
    expect(run).toHaveBeenCalledTimes(1);

    let pointCompletedTick = -1;
    let refreshedTick = -1;
    for (let tick = 0; tick < 250; tick += 1) {
      const c = classifyMissionEventForReport(missionStatus(), signature);
      signature = c.signature;
      if (c.refresh) refresh.request();
      if (tick === 100) {
        // point_completed socket event arrives mid-stream.
        expect(isTerminalPointSocketEvent("point_completed")).toBe(true);
        refresh.request();
        pointCompletedTick = tick;
      }
      jest.advanceTimersByTime(20);
      if (refreshedTick < 0 && run.mock.calls.length === 2) refreshedTick = tick;
    }

    expect(run).toHaveBeenCalledTimes(2);
    // Serviced within one 80 ms window despite 150 further stream packets.
    expect((refreshedTick - pointCompletedTick + 1) * 20).toBeLessThanOrEqual(80);
  });

  test("a sustained burst of requests is never postponed past delayMs", () => {
    const run = jest.fn();
    const refresh = new CoalescedRefresh({ delayMs: 80, run });
    for (let i = 0; i < 4; i += 1) {
      refresh.request();
      jest.advanceTimersByTime(20);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("counter-example: the old restart-on-every-packet debounce starves", () => {
    const run = jest.fn();
    let timer: any = null;
    const oldRequest = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 80);
    };
    for (let i = 0; i < 250; i += 1) {
      oldRequest();
      jest.advanceTimersByTime(20);
    }
    expect(run).not.toHaveBeenCalled();
  });

  test("cancel prevents a pending refresh", () => {
    const run = jest.fn();
    const refresh = new CoalescedRefresh({ delayMs: 80, run });
    refresh.request();
    expect(refresh.pending).toBe(true);
    refresh.cancel();
    jest.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("classifyMissionEventForReport", () => {
  test("unchanged lifecycle snapshots do not refresh", () => {
    const a = classifyMissionEventForReport(missionStatus(), null);
    expect(a.refresh).toBe(true);
    expect(a.reason).toBe("hydration");
    const b = classifyMissionEventForReport(missionStatus(), a.signature);
    expect(b.refresh).toBe(false);
  });

  test.each([
    { completed_points: 4 },
    { failed_points: 1 },
    { skipped_points: 1 },
    { state: "PAUSED" },
    { active_point_index: 4 },
    { mission_run_id: "run-2" },
    { last_point_event: { point_id: "P0004", event: "COMPLETED", received_at: "t" } },
  ])("meaningful change %o refreshes", (change) => {
    const base = classifyMissionEventForReport(missionStatus(), null);
    const next = classifyMissionEventForReport(
      missionStatus(change),
      base.signature,
    );
    expect(next.refresh).toBe(true);
    expect(next.reason).toBe("mission_lifecycle");
  });

  test("mission completion always refreshes; errors never do", () => {
    expect(
      classifyMissionEventForReport({ type: "mission_completed" }, "x").refresh,
    ).toBe(true);
    expect(
      classifyMissionEventForReport({ type: "mission_error" }, "x").refresh,
    ).toBe(false);
  });

  test("generic point_event is terminal only for terminal event names", () => {
    expect(isTerminalPointEventPayload({ event: "ACCURACY_ACHIEVED" })).toBe(true);
    expect(isTerminalPointEventPayload({ event: "completed" })).toBe(true);
    expect(isTerminalPointEventPayload({ event: "ARRIVED" })).toBe(false);
    expect(isTerminalPointEventPayload(null)).toBe(false);
  });
});
