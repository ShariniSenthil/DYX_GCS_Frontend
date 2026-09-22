import {
  buildMissionLifecycleSlice,
  isSameMissionLifecycleSlice,
  isSameMissionPointResults,
  isSameMissionRuntimeLifecycle,
  resolveEffectiveMissionLifecycle,
  socketLifecycleMatchesMission,
  stopProgressLabel,
  type MissionLifecycleSlice,
} from "../missionLifecycleState";

const PAUSED_BLOCKED = {
  state: "PAUSED",
  loaded: true,
  ready: true,
  execution_mode: "AUTO",
  mission_id: "m-1",
  mission_run_id: "run-7",
  current_point_index: 2,
  active_point_index: 2,
  active_point_id: "P0003",
  trajectory_ready: true,
  progress_percent: 40,
  resume_available: false,
  pause_reason: "RTK_LOST",
  rtk_motion_ok: false,
  rtk_reason: "Waiting for RTK FIXED",
  mission_enable: false,
  emergency_stop: false,
  px4_mode: "OFFBOARD",
  px4_armed: true,
  start_stage: "IDLE",
  start_failed_stage: null,
  resume_stage: "IDLE",
};

function socketPayload(overrides: Record<string, unknown> = {}) {
  return { ...PAUSED_BLOCKED, state_lower: "paused", ...overrides };
}

describe("REST mission lifecycle dedupe", () => {
  it("does not dedupe PAUSED resume_available false -> true", () => {
    const next = { ...PAUSED_BLOCKED, resume_available: true };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(false);
  });

  it("propagates a pause_reason change", () => {
    const next = { ...PAUSED_BLOCKED, pause_reason: "OPERATOR" };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(false);
  });

  it.each([
    ["rtk_reason", "RTK FIXED"],
    ["rtk_motion_ok", true],
  ])("propagates a %s change", (field, value) => {
    const next = { ...PAUSED_BLOCKED, [field]: value };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(false);
  });

  it.each([
    ["start_stage", "ARMING"],
    ["resume_stage", "FINAL_CHECK"],
    ["start_failed_stage", "ARM"],
    ["stop_stage", "DISARMING"],
  ])("propagates a %s change", (field, value) => {
    const next = { ...PAUSED_BLOCKED, [field]: value };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(false);
  });

  it.each([
    "mission_run_id",
    "mission_enable",
    "emergency_stop",
    "px4_mode",
    "px4_armed",
    "message",
    "error",
  ])("propagates a %s change", (field) => {
    const next = { ...PAUSED_BLOCKED, [field]: "changed" };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(false);
  });

  it("treats identical lifecycle snapshots as equal, ignoring telemetry fields", () => {
    const next = {
      ...PAUSED_BLOCKED,
      rtk_correction_age_sec: 0.4,
      arrival_settle_elapsed_sec: 0.1,
    };
    expect(isSameMissionRuntimeLifecycle(PAUSED_BLOCKED, next)).toBe(true);
  });
});

describe("socket marking-point snapshot dedupe", () => {
  it("ignores transport timestamps but retains changed frozen point data", () => {
    const previous = {
      point_results: { P0001: { point_outcome: "COMPLETED", updated_at: "a" } },
      point_status: [{ point_index: 0, status: "COMPLETED" }],
    };
    const same = {
      point_results: { P0001: { point_outcome: "COMPLETED", updated_at: "b" } },
      point_status: [{ point_index: 0, status: "COMPLETED" }],
    };
    const changed = {
      point_results: {
        P0001: { point_outcome: "COMPLETED", accuracy: { survey: { radial_error_mm: 14.8 } } },
      },
      point_status: [{ point_index: 0, status: "COMPLETED" }],
    };
    expect(isSameMissionPointResults(previous, same)).toBe(true);
    expect(isSameMissionPointResults(previous, changed)).toBe(false);
  });
});

describe("Socket.IO lifecycle slice", () => {
  it("carries identity and Resume authority from mission_status", () => {
    const slice = buildMissionLifecycleSlice(socketPayload(), 1000);
    expect(slice).toMatchObject({
      state: "PAUSED",
      state_lower: "paused",
      mission_id: "m-1",
      mission_run_id: "run-7",
      resume_available: false,
      pause_reason: "RTK_LOST",
      rtk_motion_ok: false,
      rtk_reason: "Waiting for RTK FIXED",
      mission_enable: false,
      emergency_stop: false,
      px4_mode: "OFFBOARD",
      px4_armed: true,
      start_stage: "IDLE",
      resume_stage: "IDLE",
      start_failed_stage: null,
      received_at_ms: 1000,
    });
  });

  it("dedupes identical packets regardless of receive time", () => {
    const a = buildMissionLifecycleSlice(socketPayload(), 1000);
    const b = buildMissionLifecycleSlice(socketPayload(), 2000);
    expect(isSameMissionLifecycleSlice(a, b)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["resume_available", true],
    ["pause_reason", "OPERATOR"],
    ["rtk_reason", "ok"],
    ["rtk_motion_ok", true],
    ["start_stage", "ARMING"],
    ["resume_stage", "FINAL_CHECK"],
    ["stop_stage", "DISARMING"],
    ["mission_run_id", "run-8"],
  ])("detects a %s change", (field, value) => {
    const a = buildMissionLifecycleSlice(socketPayload(), 1000);
    const b = buildMissionLifecycleSlice(socketPayload({ [field]: value }), 1000);
    expect(isSameMissionLifecycleSlice(a, b)).toBe(false);
  });
});

describe("effective lifecycle authority", () => {
  const restBlocked = { ...PAUSED_BLOCKED };

  it("enables Resume from a matching, newer socket push", () => {
    const slice = buildMissionLifecycleSlice(
      socketPayload({ resume_available: true, pause_reason: "OPERATOR" }),
      2000,
    );
    const view = resolveEffectiveMissionLifecycle(slice, restBlocked, 1000);
    expect(view.source).toBe("socket");
    expect(view.resumeAvailable).toBe(true);
    expect(view.pauseReason).toBe("OPERATOR");
  });

  it("ignores a socket push from a different mission_id", () => {
    const slice = buildMissionLifecycleSlice(
      socketPayload({ mission_id: "m-0", resume_available: true }),
      2000,
    );
    const view = resolveEffectiveMissionLifecycle(slice, restBlocked, 1000);
    expect(view.source).toBe("rest");
    expect(view.resumeAvailable).toBe(false);
  });

  it("ignores a stale socket push from an earlier run of the same mission", () => {
    const slice = buildMissionLifecycleSlice(
      socketPayload({ mission_run_id: "run-6", resume_available: true }),
      2000,
    );
    const view = resolveEffectiveMissionLifecycle(slice, restBlocked, 1000);
    expect(view.source).toBe("rest");
    expect(view.resumeAvailable).toBe(false);
  });

  it("does not match when only one side carries a run id", () => {
    const slice: MissionLifecycleSlice = {
      mission_id: "m-1",
      mission_run_id: null,
      resume_available: true,
      received_at_ms: 2000,
    };
    expect(socketLifecycleMatchesMission(slice, restBlocked)).toBe(false);
    expect(
      resolveEffectiveMissionLifecycle(slice, restBlocked, 1000).resumeAvailable,
    ).toBe(false);
  });

  it("does not let an older PAUSED push override a newer RUNNING response", () => {
    const slice = buildMissionLifecycleSlice(
      socketPayload({ resume_available: true }),
      1000,
    );
    const restRunning = {
      ...PAUSED_BLOCKED,
      state: "RUNNING",
      resume_available: false,
      pause_reason: null,
    };
    const view = resolveEffectiveMissionLifecycle(slice, restRunning, 2000);
    expect(view.source).toBe("rest");
    expect(view.state).toBe("RUNNING");
    expect(view.resumeAvailable).toBe(false);
  });

  it("falls back to REST when no socket slice exists, and to none without either", () => {
    expect(resolveEffectiveMissionLifecycle({}, restBlocked, 1000)).toMatchObject({
      source: "rest",
      state: "PAUSED",
      pauseReason: "RTK_LOST",
      rtkReason: "Waiting for RTK FIXED",
      rtkMotionOk: false,
    });
    expect(resolveEffectiveMissionLifecycle({}, null, null)).toMatchObject({
      source: "none",
      resumeAvailable: false,
    });
  });
});

describe("stopProgressLabel", () => {
  it.each([
    ["HARD_STOP_ASSERTED", "Motion stopped — disarming…"],
    ["disarming", "Motion stopped — disarming…"],
    ["DISARM_CONFIRMED", "Motion stopped — disarm confirmed"],
  ])("%s", (stage, detail) => {
    expect(stopProgressLabel(stage).detail).toBe(detail);
  });

  it("never claims a disarm that failed", () => {
    expect(stopProgressLabel("DISARM_FAILED").detail).toMatch(/NOT CONFIRMED/);
  });

  it("falls back to the generic text before any stage arrives", () => {
    expect(stopProgressLabel(null).button).toBe("Stopping...");
    expect(stopProgressLabel("IDLE").button).toBe("Stopping...");
  });
});
