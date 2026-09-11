import { shouldAcceptCanonicalReport } from "../missionReportRunGuard";

describe("shouldAcceptCanonicalReport", () => {
  test("accepts reports when not holding for a new run", () => {
    expect(
      shouldAcceptCanonicalReport({
        incomingRunId: "run-1",
        staleRunId: "run-1",
        holdingForNewRun: false,
      }),
    ).toBe(true);
  });

  test("rejects the finished run id after Start", () => {
    expect(
      shouldAcceptCanonicalReport({
        incomingRunId: "run-1",
        staleRunId: "run-1",
        holdingForNewRun: true,
      }),
    ).toBe(false);
  });

  test("accepts a new run id and clears the hold", () => {
    expect(
      shouldAcceptCanonicalReport({
        incomingRunId: "run-2",
        staleRunId: "run-1",
        holdingForNewRun: true,
      }),
    ).toBe(true);
  });

  test("rejects a null run id while holding so old COMPLETED rows cannot return", () => {
    expect(
      shouldAcceptCanonicalReport({
        incomingRunId: null,
        staleRunId: "run-1",
        holdingForNewRun: true,
      }),
    ).toBe(false);
  });
});
