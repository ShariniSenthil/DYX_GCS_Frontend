import {
  getMissionStartEligibility,
  isMissionStoredOnRover,
  classifyMissionStartOutcome,
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

  test("EMPTY after finish still prepare-then-starts when treated as loaded", () => {
    expect(
      getMissionStartEligibility({
        ...base,
        state: "EMPTY",
      }),
    ).toEqual({
      canPressStart: true,
      needsPrepare: true,
      reason: null,
    });
  });
});

describe("isMissionStoredOnRover", () => {
  test("loaded true is stored", () => {
    expect(isMissionStoredOnRover({ loaded: true, state: "READY" })).toBe(
      true,
    );
  });

  test("EMPTY with mission id is still stored after auto-stop", () => {
    expect(
      isMissionStoredOnRover({
        loaded: false,
        state: "EMPTY",
        mission_id: "m1",
      }),
    ).toBe(true);
  });

  test("EMPTY without identity is not stored", () => {
    expect(
      isMissionStoredOnRover({
        loaded: false,
        state: "EMPTY",
      }),
    ).toBe(false);
  });

  test("COMPLETED with filename is stored even if loaded is false", () => {
    expect(
      isMissionStoredOnRover({
        loaded: false,
        state: "COMPLETED",
        filename: "mission.csv",
      }),
    ).toBe(true);
  });
});

describe("start HTTP skips", () => {
  test("skips execution-mode when already AUTO", () => {
    expect(shouldSkipExecutionModePost("AUTO", "AUTO")).toBe(true);
    expect(shouldSkipExecutionModePost("manual", "AUTO")).toBe(false);
  });

});

describe("classifyMissionStartOutcome", () => {
  test("RUNNING is a normal start", () => {
    expect(classifyMissionStartOutcome({ state: "running" })).toEqual({
      kind: "running",
    });
  });

  test.each(["OPERATOR", "RTK_LOST", "ESTOP", null])(
    "PAUSED (%s) stays paused and keeps its reason; never auto-resumed",
    (reason) => {
      expect(
        classifyMissionStartOutcome({ state: "PAUSED", pauseReason: reason }),
      ).toEqual({ kind: "paused", pauseReason: reason });
    },
  );

  test("other states are reported as-is", () => {
    expect(classifyMissionStartOutcome({ state: "waiting_for_next" })).toEqual({
      kind: "other",
      state: "WAITING_FOR_NEXT",
    });
  });
});
