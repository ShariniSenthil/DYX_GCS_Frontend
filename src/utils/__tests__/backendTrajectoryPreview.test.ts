import {
  EMPTY_TRAJECTORY_PREVIEW,
  TRAJECTORY_COPY,
  buildBackendTrajectoryCollection,
  limitMapPoints,
  canDrawBackendLine,
  canLoadBackendPreview,
  filterLoadedPathPoints,
  reduceTrajectoryPreview,
  selectMapLine,
  shouldFetchLoadedPath,
  shouldPollMissionStatus,
  type TrajectoryPreviewState,
} from "../backendTrajectoryPreview";

const markingDots = [
  { lat: 13.0827, lon: 80.2707 },
  { lat: 13.0830, lon: 80.2710 },
  { lat: 13.0834, lon: 80.2715 },
];

const backendPoints = [
  { latitude: 13.1, longitude: 80.2, x: 0, y: 0 },
  { latitude: 13.1004, longitude: 80.2003, x: 1, y: 0.4 },
  { latitude: 13.1009, longitude: 80.2008, x: 2, y: 0.9 },
];

function lineCoordinates(selected: ReturnType<typeof selectMapLine>) {
  const feature = selected?.collection.features.find(
    (item) => item.properties.kind === "line",
  );
  if (!feature || feature.geometry.type !== "LineString") {
    return [];
  }
  return feature.geometry.coordinates;
}

describe("backend trajectory display contract", () => {
  test("after file upload, local waypoints do not draw a connecting line", () => {
    const line = selectMapLine({
      localWaypoints: markingDots,
      trajectoryPoints: [],
      backendReady: false,
    });
    expect(line).toBeNull();
    expect(
      canDrawBackendLine({ phase: "idle", points: [] }),
    ).toBe(false);
  });

  test("loaded-path with ≥2 lat/lon points → exactly one backend line from those points only", () => {
    const line = selectMapLine({
      localWaypoints: markingDots,
      trajectoryPoints: backendPoints,
      backendReady: true,
    });

    expect(line?.source).toBe("backend");
    expect(
      line?.collection.features.filter((f) => f.properties.kind === "line"),
    ).toHaveLength(1);

    const coords = lineCoordinates(line);
    expect(coords).toEqual([
      [80.2, 13.1],
      [80.2003, 13.1004],
      [80.2008, 13.1009],
    ]);
    expect(coords).not.toEqual(
      markingDots.map((wp) => [wp.lon, wp.lat]),
    );
  });

  test("sampled display points never replace the single LineString", () => {
    const collection = buildBackendTrajectoryCollection(backendPoints, {
      sampleDisplayPoints: true,
      maxSamplePoints: 400,
    });
    const lines = collection?.features.filter((f) => f.properties.kind === "line") ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0].geometry.type).toBe("LineString");
  });

  test("offline → no loaded-path fetch; no connecting line", () => {
    const offline = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "OFFLINE",
    });

    expect(offline.phase).toBe("offline");
    expect(offline.points).toEqual([]);
    expect(offline.message).toBe(TRAJECTORY_COPY.offline);
    expect(
      selectMapLine({
        localWaypoints: markingDots,
        trajectoryPoints: offline.points,
        backendReady: false,
      }),
    ).toBeNull();

    expect(
      shouldFetchLoadedPath({
        isOffline: true,
        connectionState: "connected",
        loaded: true,
        trajectoryReady: true,
      }),
    ).toBe(false);
    expect(
      shouldPollMissionStatus({
        isOffline: true,
        connectionState: "connected",
      }),
    ).toBe(false);
  });

  test("Path Plan after upload waits for trajectory_ready then uses loaded-path only", () => {
    let state: TrajectoryPreviewState = reduceTrajectoryPreview(
      EMPTY_TRAJECTORY_PREVIEW,
      { type: "UPLOAD_STARTED", epoch: 1 },
    );

    expect(state.phase).toBe("generating");
    expect(state.points).toEqual([]);
    expect(
      selectMapLine({
        localWaypoints: markingDots,
        trajectoryPoints: state.points,
        backendReady: false,
      }),
    ).toBeNull();

    state = reduceTrajectoryPreview(state, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "PREPARING",
        rtk_fixed: false,
        message: "waiting for RTK FIXED",
        mission_id: "m1",
      },
    });

    expect(state.phase).toBe("waiting_rtk");
    expect(state.points).toEqual([]);
    expect(state.message).toBe(TRAJECTORY_COPY.waitingRtk);
    expect(
      shouldFetchLoadedPath({
        isOffline: false,
        connectionState: "connected",
        loaded: true,
        trajectoryReady: false,
      }),
    ).toBe(false);

    state = reduceTrajectoryPreview(state, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: true,
        trajectory_ready: true,
        state: "READY",
        rtk_fixed: true,
        mission_id: "m1",
        navigation_point_count: 3,
      },
    });

    expect(state.phase).toBe("generating");
    expect(state.points).toEqual([]);
    expect(
      shouldFetchLoadedPath({
        isOffline: false,
        connectionState: "connected",
        loaded: true,
        trajectoryReady: true,
      }),
    ).toBe(true);

    state = reduceTrajectoryPreview(state, {
      type: "PREVIEW",
      epoch: 1,
      missionId: "m1",
      navigationPointCount: 3,
      points: backendPoints,
    });

    expect(state.phase).toBe("ready");
    expect(state.points).toHaveLength(3);
    const selected = selectMapLine({
      localWaypoints: markingDots,
      trajectoryPoints: state.points,
      backendReady: true,
    });
    expect(selected?.source).toBe("backend");
    expect(lineCoordinates(selected)).toEqual([
      [80.2, 13.1],
      [80.2003, 13.1004],
      [80.2008, 13.1009],
    ]);
  });

  test("finished run keeps the last path even when loaded drops", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "m1",
      epoch: 1,
      liveLoaded: true,
      liveTrajectoryReady: true,
    };

    const completed = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: false,
        trajectory_ready: false,
        state: "COMPLETED",
        mission_id: "m1",
      },
    });

    expect(completed.points).toEqual(backendPoints);
    expect(completed.phase).toBe("ready");
    expect(canDrawBackendLine(completed)).toBe(true);
    expect(canLoadBackendPreview(completed)).toBe(false);

    const emptied = reduceTrajectoryPreview(completed, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: false,
        trajectory_ready: false,
        state: "EMPTY",
        mission_id: "m1",
      },
    });

    expect(emptied.points).toEqual(backendPoints);
    expect(canDrawBackendLine(emptied)).toBe(true);
    expect(canLoadBackendPreview(emptied)).toBe(false);
    expect(
      selectMapLine({
        localWaypoints: markingDots,
        trajectoryPoints: emptied.points,
        backendReady: true,
      })?.source,
    ).toBe("backend");
  });

  test("large backend previews are bounded for mobile map rendering and keep endpoints", () => {
    const manyPoints = Array.from({ length: 5000 }, (_, index) => ({
      latitude: 13 + index * 0.000001,
      longitude: 80 + index * 0.000001,
    }));
    const collection = buildBackendTrajectoryCollection(manyPoints, {
      sampleDisplayPoints: true,
      maxSamplePoints: 40,
      maxLinePoints: 120,
    });
    const line = collection?.features.find((feature) => feature.properties.kind === "line");
    expect(line?.geometry.type).toBe("LineString");
    if (line?.geometry.type === "LineString") {
      expect(line.geometry.coordinates).toHaveLength(120);
      expect(line.geometry.coordinates[0]).toEqual([80, 13]);
      expect(line.geometry.coordinates[119]).toEqual([80.004999, 13.004999]);
    }
    expect(limitMapPoints(Array.from({ length: 5000 }, (_, index) => index), 100)).toHaveLength(100);
  });

  test("starting the same mission keeps the last path during RUNNING transition", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "m1",
      epoch: 1,
      liveLoaded: true,
      liveTrajectoryReady: true,
    };

    const running = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 2,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "RUNNING",
        mission_id: "m1",
      },
    });

    expect(running.points).toEqual(backendPoints);
    expect(running.phase).toBe("ready");
    expect(canDrawBackendLine(running)).toBe(true);
  });

  test("real clear with EMPTY and no mission id removes the path", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "m1",
      epoch: 1,
    };

    const next = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 2,
      mission: {
        loaded: false,
        trajectory_ready: false,
        state: "EMPTY",
      },
    });

    expect(next.points).toEqual([]);
    expect(next.phase).toBe("idle");
    expect(canDrawBackendLine(next)).toBe(false);
  });

  test("archived completion keeps the final display path after active cleanup", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "m1",
      epoch: 1,
    };
    const archived = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: false,
        trajectory_ready: false,
        state: "EMPTY",
        terminal_cleanup_status: "ARCHIVED",
      },
    });
    expect(archived.points).toEqual(backendPoints);
    expect(archived.phase).toBe("ready");
  });

  test("new LOAD clears the previous line immediately", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "old",
      epoch: 1,
    };

    const next = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 2,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "PREPARING",
        mission_id: "new",
      },
    });

    expect(next.points).toEqual([]);
    expect(next.phase).toBe("generating");
    expect(
      selectMapLine({
        localWaypoints: markingDots,
        trajectoryPoints: next.points,
        backendReady: false,
      }),
    ).toBeNull();
  });

  test("stale preview from a previous upload is ignored", () => {
    const generating = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "UPLOAD_STARTED",
      epoch: 4,
    });

    const next = reduceTrajectoryPreview(generating, {
      type: "PREVIEW",
      epoch: 3,
      points: backendPoints,
    });

    expect(next.points).toEqual([]);
    expect(next.phase).toBe("generating");
  });

  test("empty backend preview while PREPARING draws no connecting line", () => {
    const next = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "PREPARING",
        navigation_point_count: 0,
      },
    });

    expect(next.points).toEqual([]);
    expect(filterLoadedPathPoints([{ x: 1, y: 2 }])).toEqual([]);
    expect(
      selectMapLine({
        localWaypoints: markingDots,
        trajectoryPoints: next.points,
        backendReady: false,
      }),
    ).toBeNull();
  });

  test("trajectory_ready with an empty loaded-path is a hard failure", () => {
    const generating = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "UPLOAD_STARTED",
      epoch: 1,
    });
    const next = reduceTrajectoryPreview(generating, {
      type: "PREVIEW",
      epoch: 1,
      navigationPointCount: 0,
      points: [],
    });
    expect(next.phase).toBe("failed");
    expect(next.message).toBe(TRAJECTORY_COPY.emptyPath);
    expect(next.points).toEqual([]);
  });

  test("trajectory ERROR surfaces backend copy and still draws no local line", () => {
    const next = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "ERROR",
        error: "generator aborted",
      },
    });

    expect(next.phase).toBe("failed");
    expect(next.message).toBe("generator aborted");
    expect(next.points).toEqual([]);
  });

  test("one failed status poll does not erase a ready path", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      epoch: 1,
      missionId: "m1",
    };

    const next = reduceTrajectoryPreview(ready, { type: "STATUS_ERROR" });
    expect(next.points).toEqual(backendPoints);
    expect(next.phase).toBe("ready");
  });
});
