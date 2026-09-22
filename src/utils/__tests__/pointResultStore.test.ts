import {
  EMPTY_POINT_RESULTS,
  applyPointResult,
  parsePointResultEvent,
  pointResultsForRun,
  pruneToIdentity,
} from "../pointResultStore";

const RUN = { missionId: "mission-1", runId: "run-1" };

function accuracy(overall: number, available = true) {
  return {
    measurement_source: "RPP_TERMINAL_RESULT",
    available,
    along_track_error_mm: available ? -4.5 : null,
    cross_track_error_mm: available ? 12.3 : null,
    overall_accuracy_mm: available ? overall : null,
    tolerance_mm: 30,
    within_tolerance: available ? overall <= 30 : null,
    timestamp_unix_ns: 1758000000000000000,
  };
}

function socketEvent(
  pointIndex: number,
  event = "COMPLETED",
  overrides: Record<string, unknown> = {},
  resultAccuracy: Record<string, unknown> = accuracy(13.1),
) {
  const pointId = `P${String(pointIndex + 1).padStart(4, "0")}`;
  return {
    event,
    point_id: pointId,
    point_index: pointIndex,
    mission_id: "mission-1",
    mission_run_id: "run-1",
    contract: "point_result@1",
    point_result: {
      point_id: pointId,
      point_index: pointIndex,
      mission_run_id: "run-1",
      mission_id: "mission-1",
      point_outcome: event,
      accuracy: resultAccuracy,
    },
    ...overrides,
  };
}

describe("parsePointResultEvent", () => {
  test("parses identity and keeps the result object untouched", () => {
    const raw = socketEvent(24);
    const entry = parsePointResultEvent(raw, 1000)!;
    expect(entry).toMatchObject({
      missionId: "mission-1",
      runId: "run-1",
      pointId: "P0025",
      pointIndex: 24,
      event: "COMPLETED",
      receivedAtMs: 1000,
    });
    expect(entry.result).toBe(raw.point_result);
  });

  test("rejects events without point_result or run identity", () => {
    expect(parsePointResultEvent({ event: "COMPLETED", point_id: "P1" })).toBeNull();
    expect(
      parsePointResultEvent(
        socketEvent(0, "COMPLETED", {
          mission_run_id: null,
          point_result: { point_id: "P0001" },
        }),
      ),
    ).toBeNull();
    expect(parsePointResultEvent(null)).toBeNull();
  });
});

describe("applyPointResult", () => {
  test("updates exactly one row and preserves the exact numbers", () => {
    let map = EMPTY_POINT_RESULTS;
    for (let i = 0; i < 1000; i += 1) {
      map = applyPointResult(map, parsePointResultEvent(socketEvent(i))!, RUN);
    }
    const before = map;
    const next = applyPointResult(
      before,
      parsePointResultEvent(socketEvent(24, "COMPLETED", {}, accuracy(7.7)))!,
      RUN,
    );
    const changed = Object.keys(next).filter((k) => next[k] !== before[k]);
    expect(changed).toEqual(["P0025"]);
    const rows = pointResultsForRun(next, RUN);
    expect((rows.P0025.accuracy as any).overall_accuracy_mm).toBe(7.7);
    expect((rows.P0025.accuracy as any).along_track_error_mm).toBe(-4.5);
    expect((rows.P0025.accuracy as any).cross_track_error_mm).toBe(12.3);
  });

  test("rejects a previous run's late event", () => {
    const stale = parsePointResultEvent(
      socketEvent(3, "COMPLETED", { mission_run_id: "run-0" }),
    )!;
    const map = applyPointResult(EMPTY_POINT_RESULTS, stale, RUN);
    expect(map).toBe(EMPTY_POINT_RESULTS);
  });

  test("rejects another mission's event even with a matching run id", () => {
    const other = parsePointResultEvent(
      socketEvent(3, "COMPLETED", { mission_id: "mission-2" }),
    )!;
    expect(applyPointResult(EMPTY_POINT_RESULTS, other, RUN)).toBe(
      EMPTY_POINT_RESULTS,
    );
  });

  test("a later accuracy-less FAILED keeps the exact terminal snapshot", () => {
    let map = applyPointResult(
      EMPTY_POINT_RESULTS,
      parsePointResultEvent(socketEvent(5, "ACCURACY_FAILED", {}, accuracy(41.2)))!,
      RUN,
    );
    map = applyPointResult(
      map,
      parsePointResultEvent(socketEvent(5, "FAILED", {}, accuracy(0, false)))!,
      RUN,
    );
    const row = pointResultsForRun(map, RUN).P0006;
    expect(row.point_outcome).toBe("FAILED");
    expect((row.accuracy as any).overall_accuracy_mm).toBe(41.2);
    expect((row.accuracy as any).available).toBe(true);
  });
});

describe("run identity at read time", () => {
  test("unknown current run displays nothing; new run prunes old rows", () => {
    // Event arrives before the screen knows the current run.
    let map = applyPointResult(
      EMPTY_POINT_RESULTS,
      parsePointResultEvent(socketEvent(0))!,
      { missionId: null, runId: null },
    );
    expect(pointResultsForRun(map, { missionId: null, runId: null })).toEqual({});
    expect(Object.keys(pointResultsForRun(map, RUN))).toEqual(["P0001"]);

    // A new run starts: previous-run accuracy must never attach to it.
    const nextRun = { missionId: "mission-1", runId: "run-2" };
    expect(pointResultsForRun(map, nextRun)).toEqual({});
    map = pruneToIdentity(map, nextRun);
    expect(map).toEqual({});
  });

  test("prune keeps the same object when nothing is removed", () => {
    const map = applyPointResult(
      EMPTY_POINT_RESULTS,
      parsePointResultEvent(socketEvent(0))!,
      RUN,
    );
    expect(pruneToIdentity(map, RUN)).toBe(map);
  });
});
