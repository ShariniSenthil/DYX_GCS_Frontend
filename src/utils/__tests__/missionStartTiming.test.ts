import {
  createMissionStartAttemptId,
  formatMissionStartTiming,
} from "../missionStartTiming";

describe("missionStartTiming", () => {
  test("formats a stable log line", () => {
    expect(
      formatMissionStartTiming({
        attemptId: "start-1",
        stage: "start_post_returned",
        atMs: 42,
        detail: "state=ARMING",
      }),
    ).toBe(
      "[MissionStartTiming] start-1 start_post_returned t=42 state=ARMING",
    );
  });

  test("attempt id includes the clock", () => {
    expect(createMissionStartAttemptId(99)).toBe("start-99");
  });
});
