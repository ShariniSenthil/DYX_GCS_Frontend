import {
  getMissionStartEligibility,
  shouldAutoResumeAfterStart,
  shouldSkipExecutionModePost,
} from "../missionStartEligibility";

const base = {
  connected: true,
  loaded: true,
  state: "READY",
};

describe("getMissionStartEligibility", () => {
  test("connected and loaded allows Start; backend decides the rest", () => {
    expect(getMissionStartEligibility(base)).toEqual({
      canPressStart: true,
      needsPrepare: false,
      reason: null,
    });
  });

  test("COMPLETED with a loaded mission uses prepare-then-start", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "COMPLETED",
      }),
    ).toEqual({
      canPressStart: true,
      needsPrepare: true,
      reason: null,
    });
  });

  test("STOPPED with a loaded mission uses prepare-then-start", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "STOPPED",
      }),
    ).toMatchObject({ canPressStart: true, needsPrepare: true });
  });

  test("not connected cannot start", () => {
    expect(
      getMissionStartEligibility({ ...base, connected: false }),
    ).toEqual({
      canPressStart: false,
      needsPrepare: false,
      reason: "Rover is not connected.",
    });
  });

  test("not loaded cannot start", () => {
    expect(
      getMissionStartEligibility({ ...base, loaded: false }),
    ).toMatchObject({
      canPressStart: false,
      needsPrepare: false,
      reason: "Upload a mission before starting.",
    });
  });

  test("RUNNING is not pre-blocked; backend rejects if needed", () => {
    expect(
      getMissionStartEligibility({ ...base, state: "RUNNING" }),
    ).toMatchObject({ canPressStart: true, needsPrepare: false });
  });

  test("PREPARING is not pre-blocked; backend rejects if needed", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "PREPARING",
      }),
    ).toMatchObject({ canPressStart: true, needsPrepare: false });
  });

  test("FAILED and ERROR use prepare-then-start", () => {
    expect(
      getMissionStartEligibility({ ...base, state: "FAILED" }),
    ).toMatchObject({ canPressStart: true, needsPrepare: true });
    expect(
      getMissionStartEligibility({ ...base, state: "ERROR" }),
    ).toMatchObject({ canPressStart: true, needsPrepare: true });
  });

  test("unknown empty state uses prepare-then-start", () => {
    expect(
      getMissionStartEligibility({ ...base, state: "" }),
    ).toMatchObject({ canPressStart: true, needsPrepare: true });
  });
});

describe("start HTTP skips", () => {
  test("skips execution-mode when already AUTO", () => {
    expect(shouldSkipExecutionModePost("AUTO", "AUTO")).toBe(true);
    expect(shouldSkipExecutionModePost("manual", "AUTO")).toBe(false);
  });

});

describe("shouldAutoResumeAfterStart", () => {
  test("resumes leftover OPERATOR pause after Start", () => {
    expect(
      shouldAutoResumeAfterStart({
        state: "PAUSED",
        resumeAvailable: true,
        pauseReason: "OPERATOR",
        emergencyStop: false,
      }),
    ).toBe(true);
  });

  test("resumes empty leftover pause when Resume is available", () => {
    expect(
      shouldAutoResumeAfterStart({
        state: "PAUSED",
        resumeAvailable: true,
        pauseReason: null,
      }),
    ).toBe(true);
  });

  test("does not resume RTK or odom safety pauses", () => {
    expect(
      shouldAutoResumeAfterStart({
        state: "PAUSED",
        resumeAvailable: true,
        pauseReason: "RTK_LOST",
      }),
    ).toBe(false);
    expect(
      shouldAutoResumeAfterStart({
        state: "PAUSED",
        resumeAvailable: true,
        pauseReason: "ODOM_STALE",
      }),
    ).toBe(false);
  });

  test("does not resume while E-stop is still latched", () => {
    expect(
      shouldAutoResumeAfterStart({
        state: "PAUSED",
        resumeAvailable: true,
        pauseReason: "ESTOP",
        emergencyStop: true,
      }),
    ).toBe(false);
  });

  test("does not resume when not paused", () => {
    expect(
      shouldAutoResumeAfterStart({
        state: "RUNNING",
        resumeAvailable: true,
      }),
    ).toBe(false);
  });
});
