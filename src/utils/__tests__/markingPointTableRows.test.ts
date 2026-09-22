import {
  buildMarkingPointListRevision,
  buildMarkingPointRows,
  markingPointRowRevision,
  markingPointStatusRevision,
} from "../markingPointTableRows";

const wp = (sn: number, lat = 1 + sn, lon = 2 + sn) => ({
  sn,
  lat,
  lon,
  block: "A",
  row: "1",
  pile: String(sn),
});

describe("markingPointTableRows", () => {
  test("status revision is stable across object identity", () => {
    const a = {
      status: "completed",
      timestamp: "2026-09-10T12:00:00",
      remark: "Along 1 | Cross 2 | Overall 3",
      survey: { available: true, radial_error_mm: 12.5 },
    };
    const b = { ...a, survey: { ...a.survey } };

    expect(markingPointStatusRevision(a)).toBe(markingPointStatusRevision(b));
  });

  test("status revision changes when live fields change", () => {
    const pending = { status: "pending" };
    const reached = { status: "reached", timestamp: "12:00:01" };
    const marked = {
      status: "completed",
      timestamp: "12:00:02",
      remark: "Along 4.0 mm | Cross 1.0 mm | Overall 4.1 mm",
      survey: { available: true, radial_error_mm: 4.1 },
    };

    expect(markingPointStatusRevision(pending)).not.toBe(
      markingPointStatusRevision(reached),
    );
    expect(markingPointStatusRevision(reached)).not.toBe(
      markingPointStatusRevision(marked),
    );
  });

  test("row revision includes current-waypoint flag", () => {
    const waypoint = wp(3);
    const status = { status: "reached" };

    expect(markingPointRowRevision(waypoint, status, false)).not.toBe(
      markingPointRowRevision(waypoint, status, true),
    );
  });

  test("list revision is stable when only statusMap identity changes", () => {
    const waypoints = [wp(1), wp(2)];
    const statusA = {
      1: { status: "completed", remark: "RPP" },
      2: { status: "pending" },
    };
    const statusB = {
      1: { status: "completed", remark: "RPP" },
      2: { status: "pending" },
    };

    expect(buildMarkingPointListRevision(waypoints, statusA, 2)).toBe(
      buildMarkingPointListRevision(waypoints, statusB, 2),
    );
  });

  test("list revision changes when a point is marked without remounting", () => {
    const waypoints = [wp(1), wp(2)];
    const before = {
      1: { status: "reached" },
      2: { status: "pending" },
    };
    const after = {
      1: {
        status: "completed",
        timestamp: "12:00:03",
        remark: "Along 2.0 mm | Cross 0.5 mm | Overall 2.1 mm",
        survey: { available: true, radial_error_mm: 2.1 },
      },
      2: { status: "reached" },
    };

    expect(buildMarkingPointListRevision(waypoints, before, 1)).not.toBe(
      buildMarkingPointListRevision(waypoints, after, 2),
    );
  });

  test("rows bake live status so recycled cells do not keep stale closures", () => {
    const waypoints = [wp(1), wp(2)];
    const statusMap = {
      1: { status: "completed", remark: "Along 1" },
      2: { status: "reached" },
    };

    const rows = buildMarkingPointRows(waypoints, statusMap, 2);

    expect(rows).toHaveLength(2);
    expect(rows[0].wpStatus?.status).toBe("completed");
    expect(rows[0].wpStatus?.remark).toBe("Along 1");
    expect(rows[0].isCurrentWaypoint).toBe(false);
    expect(rows[1].wpStatus?.status).toBe("reached");
    expect(rows[1].isCurrentWaypoint).toBe(true);
    expect(rows[0].revision).not.toBe(rows[1].revision);
  });
});

describe("shareUnchangedRows (P0025 completes in a 1000-point mission)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { shareUnchangedRows } = require("../markingPointTableRows");

  function build(completedUpTo: number, p25Remark = "Along — | Cross — | Overall —") {
    const map: Record<number, any> = {};
    for (let sn = 1; sn <= 1000; sn += 1) {
      const done = sn <= completedUpTo;
      map[sn] = {
        reached: done,
        marked: done,
        status: done ? "completed" : "pending",
        timestamp: done ? `t${sn}` : undefined,
        remark: sn === 25 ? p25Remark : "Along — | Cross — | Overall —",
        survey: done ? { available: true, radial_error_mm: sn / 10, reason: null } : null,
      };
    }
    return map;
  }

  test("only the completed row gets a new object", () => {
    const before = shareUnchangedRows(null, build(24));
    const after = shareUnchangedRows(
      before,
      build(25, "Along -4.5 mm | Cross +12.3 mm | Overall 13.1 mm"),
    );
    expect(after).not.toBe(before);
    const changed = Object.keys(after).filter(
      (k) => after[Number(k)] !== before[Number(k)],
    );
    expect(changed).toEqual(["25"]);
  });

  test("a rebuild with no displayed change returns the previous map", () => {
    const before = shareUnchangedRows(null, build(10));
    expect(shareUnchangedRows(before, build(10))).toBe(before);
  });

  test("a survey detail change is not swallowed", () => {
    const before = shareUnchangedRows(null, build(10));
    const next = build(10);
    next[5] = { ...next[5], survey: { ...next[5].survey, extra: 1 } };
    const after = shareUnchangedRows(before, next);
    expect(after[5]).toBe(next[5]);
    expect(after[6]).toBe(before[6]);
  });
});
