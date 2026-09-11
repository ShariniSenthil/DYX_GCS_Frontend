import {
  getMissionStartEligibility,
  shouldAutoResumeAfterStart,
  shouldSkipExecutionModePost,
} from "../missionStartEligibility";

const base = {
  connected: true,
  loaded: true,
  ready: true,
  state: "READY",
  mode: "AUTO",
};

describe("getMissionStartEligibility", () => {
  test("READY + loaded + ready allows direct Start", () => {
    expect(getMissionStartEligibility(base)).toEqual({
      canPressStart: true,
      needsPrepare: false,
      reason: null,
    });
  });

  test("COMPLETED with ready still allows Start without prepare", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "COMPLETED",
        ready: true,
      }),
    ).toMatchObject({ canPressStart: true, needsPrepare: false });
  });

  test("COMPLETED with loaded and ready false uses prepare-then-start", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "COMPLETED",
        ready: false,
      }),
    ).toEqual({
      canPressStart: true,
      needsPrepare: true,
      reason: null,
    });
  });

  test("STOPPED with ready false uses prepare-then-start", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "STOPPED",
        ready: false,
      }),
    ).toMatchObject({ canPressStart: true, needsPrepare: true });
  });

  test("not loaded cannot start", () => {
    expect(
      getMissionStartEligibility({ ...base, loaded: false }),
    ).toMatchObject({ canPressStart: false, needsPrepare: false });
  });

  test("RUNNING cannot start", () => {
    expect(
      getMissionStartEligibility({ ...base, state: "RUNNING" }),
    ).toMatchObject({ canPressStart: false });
  });

  test("joystick blocks Start", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        joystickActive: true,
      }),
    ).toMatchObject({ canPressStart: false });
  });

  test("PREPARING cannot start yet", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        ready: false,
        state: "PREPARING",
      }),
    ).toMatchObject({ canPressStart: false, needsPrepare: false });
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
