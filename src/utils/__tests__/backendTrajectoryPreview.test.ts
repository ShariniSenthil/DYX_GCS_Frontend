import {
  EMPTY_TRAJECTORY_PREVIEW,
  TRAJECTORY_COPY,
  buildBackendTrajectoryCollection,
  BACKEND_LINE_RENDER,
  limitMapPoints,
  canDrawBackendLine,
  canLoadBackendPreview,
  filterLoadedPathPoints,
  parseTrajectoryPathCleared,
  parseTrajectoryPathPush,
  reduceTrajectoryPreview,
  selectMapLine,
  shouldFetchLoadedPath,
  shouldPollMissionStatus,
  type TrajectoryPathPush,
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

  test("a loaded mission retains its identity and Load Again state", () => {
    const ready: TrajectoryPreviewState = {
      ...EMPTY_TRAJECTORY_PREVIEW,
      phase: "ready",
      points: backendPoints,
      missionId: "m1",
      liveLoaded: true,
      liveTrajectoryReady: true,
    };

    expect(canLoadBackendPreview(ready)).toBe(true);

    const refreshedReadyStatus = reduceTrajectoryPreview(ready, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: true,
        trajectory_ready: true,
        state: "READY",
        mission_id: "m1",
        accepted_for_start: true,
      },
    });

    expect(refreshedReadyStatus.missionId).toBe("m1");
    expect(refreshedReadyStatus.acceptedForStart).toBe(true);
    expect(canLoadBackendPreview(refreshedReadyStatus)).toBe(true);

    const completed = reduceTrajectoryPreview(refreshedReadyStatus, {
      type: "STATUS",
      epoch: 1,
      mission: {
        loaded: false,
        trajectory_ready: false,
        state: "COMPLETED",
        mission_id: "m1",
      },
    });

    expect(completed.missionId).toBe("m1");
    expect(completed.acceptedForStart).toBe(true);

    const restored = reduceTrajectoryPreview(completed, {
      type: "STATUS",
      epoch: 2,
      mission: {
        loaded: true,
        trajectory_ready: false,
        state: "LOADED",
        mission_id: "m1",
        accepted_for_start: false,
      },
    });

    expect(restored.acceptedForStart).toBe(true);
  });

  test("default map rendering omits interpolation point markers", () => {
    const collection = buildBackendTrajectoryCollection(
      backendPoints,
      BACKEND_LINE_RENDER,
    );
    expect(collection?.features.map((feature) => feature.properties.kind)).toEqual([
      "line",
    ]);
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

describe("verified backend push (trajectory_path)", () => {
  const makePush = (
    seq: number,
    overrides: Partial<TrajectoryPathPush> = {},
    count = 5,
  ): TrajectoryPathPush => ({
    schema_version: 1,
    server_instance_id: "inst-1",
    seq,
    mission_id: "m1",
    signature: "sig-a",
    count,
    x: Array.from({ length: count }, (_, i) => i * 0.05),
    y: Array.from({ length: count }, () => 0),
    lat: Array.from({ length: count }, (_, i) => 13.1 + i * 1e-6),
    lon: Array.from({ length: count }, (_, i) => 80.2 + i * 1e-6),
    ...overrides,
  });
  const cleared = (seq: number, instance = "inst-1") => ({
    type: "PUSH_CLEARED" as const,
    cleared: {
      schema_version: 1,
      server_instance_id: instance,
      seq,
      mission_id: "m1",
      signature: "sig-a",
      reason: "generator_not_ready",
    },
  });
  const status = (id: string | null, over: Record<string, unknown> = {}) =>
    ({
      type: "STATUS" as const,
      epoch: 0,
      mission: {
        loaded: true,
        trajectory_ready: true,
        state: "READY",
        mission_id: id,
        navigation_point_count: 5,
        ...over,
      },
    });
  const known = (id: string): TrajectoryPreviewState => ({
    ...EMPTY_TRAJECTORY_PREVIEW,
    phase: "generating",
    missionId: id,
  });

  test("push for the current mission draws the whole path at once", () => {
    const state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(1, {}, 3000),
    });
    expect(state.phase).toBe("ready");
    expect(state.points).toHaveLength(3000);
    expect(state.navigationPointCount).toBe(3000);
    expect(state.previewTruncated).toBe(false);
    expect(state.pushMeta).toEqual({
      instance: "inst-1",
      seq: 1,
      missionId: "m1",
      signature: "sig-a",
    });
    expect(canDrawBackendLine(state)).toBe(true);
  });

  test("first signature is learned from the first push; a newer one replaces it", () => {
    let state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    expect(state.pushMeta?.signature).toBe("sig-a");
    state = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(2, { signature: "sig-b" }),
    });
    expect(state.pushMeta?.signature).toBe("sig-b");
  });

  test("push before the mission id is known is held, then drawn when STATUS names it", () => {
    let state = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    expect(state.points).toEqual([]);
    expect(state.pendingPush?.mission_id).toBe("m1");

    state = reduceTrajectoryPreview(state, status("m1"));
    expect(state.phase).toBe("ready");
    expect(state.points).toHaveLength(5);
    expect(state.pendingPush).toBeNull();
  });

  test("held push is dropped when STATUS names a different mission", () => {
    let state = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    state = reduceTrajectoryPreview(state, status("m2"));
    expect(state.pendingPush).toBeNull();
    expect(state.points).toEqual([]);
    expect(state.missionId).toBe("m2");
  });

  test("push for another mission never draws over the current one", () => {
    const state = reduceTrajectoryPreview(known("m2"), {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    expect(state.points).toEqual([]);
    expect(state.pendingPush?.mission_id).toBe("m1");
  });

  test("equal or older seq is ignored; a new server instance restarts the counter", () => {
    let state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(5),
    });
    const same = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(5, { signature: "sig-x" }),
    });
    const older = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(4, { signature: "sig-y" }),
    });
    expect(same).toBe(state);
    expect(older).toBe(state);

    state = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(1, { server_instance_id: "inst-2", signature: "sig-z" }),
    });
    expect(state.pushMeta).toMatchObject({ instance: "inst-2", seq: 1 });
  });

  test("a delayed clear cannot erase a newer path and does not erase on its own", () => {
    let state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(10),
    });
    // older clear: rejected outright
    expect(reduceTrajectoryPreview(state, cleared(9))).toBe(state);
    // newer clear: only advances ordering; the existing STATUS rules own retention
    state = reduceTrajectoryPreview(state, cleared(11));
    expect(state.points).toHaveLength(5);
    expect(state.pushOrder).toEqual({ instance: "inst-1", seq: 11 });
    // an older path arriving after that clear is rejected
    const late = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(10, { signature: "old" }),
    });
    expect(late).toBe(state);
  });

  test("upload reset drops the line but keeps ordering, so a stale push cannot return", () => {
    let state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(7),
    });
    state = reduceTrajectoryPreview(state, { type: "UPLOAD_STARTED", epoch: 1 });
    expect(state.points).toEqual([]);
    expect(state.pushMeta).toBeUndefined();
    expect(state.pushOrder).toEqual({ instance: "inst-1", seq: 7 });
    const stale = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(7),
    });
    expect(stale).toBe(state);
  });

  test("legacy capped fallback never replaces a pushed full path", () => {
    let state = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(1, {}, 3000),
    });
    const capped = Array.from({ length: 2000 }, (_, i) => ({
      latitude: 13.1 + i * 1e-6,
      longitude: 80.2 + i * 1e-6,
    }));
    state = reduceTrajectoryPreview(state, {
      type: "PREVIEW",
      epoch: 0,
      missionId: "m1",
      navigationPointCount: 3000,
      previewTruncated: true,
      points: capped,
    });
    expect(state.points).toHaveLength(3000);
    expect(state.previewTruncated).toBe(false);
  });

  test("new-backend snapshot fallback is ordered by seq like a push", () => {
    const points = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        latitude: 13.1 + i * 1e-6,
        longitude: 80.2 + i * 1e-6,
      }));
    const snapshot = (seq: number) => ({
      server_instance_id: "inst-1",
      seq,
      mission_id: "m1",
      signature: "sig-a",
    });
    const base = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(5),
    });
    // same/older snapshot: ignored
    const ignored = reduceTrajectoryPreview(base, {
      type: "PREVIEW",
      epoch: 0,
      missionId: "m1",
      points: points(9),
      snapshot: snapshot(5),
    });
    expect(ignored).toBe(base);
    // newer snapshot: accepted and identified
    const accepted = reduceTrajectoryPreview(base, {
      type: "PREVIEW",
      epoch: 0,
      missionId: "m1",
      points: points(9),
      snapshot: snapshot(6),
    });
    expect(accepted.points).toHaveLength(9);
    expect(accepted.pushMeta?.seq).toBe(6);
  });

  test("legacy fallback still works when nothing was pushed (old backend)", () => {
    const state = reduceTrajectoryPreview(known("m1"), {
      type: "PREVIEW",
      epoch: 0,
      missionId: "m1",
      navigationPointCount: 3,
      points: backendPoints,
    });
    expect(state.phase).toBe("ready");
    expect(state.points).toHaveLength(3);
    expect(state.pushMeta).toBeUndefined();
  });

  test("malformed pushes are rejected by the parser", () => {
    const good = makePush(1);
    expect(parseTrajectoryPathPush(good)).not.toBeNull();
    expect(parseTrajectoryPathPush({ ...good, schema_version: 2 })).toBeNull();
    expect(parseTrajectoryPathPush({ ...good, lat: good.lat.slice(1) })).toBeNull();
    expect(parseTrajectoryPathPush({ ...good, count: 99 })).toBeNull();
    expect(
      parseTrajectoryPathPush({ ...good, x: [...good.x.slice(1), Number.NaN] }),
    ).toBeNull();
    expect(parseTrajectoryPathPush({ ...good, mission_id: "" })).toBeNull();
    expect(parseTrajectoryPathPush({ ...good, server_instance_id: undefined })).toBeNull();
    expect(parseTrajectoryPathPush(null)).toBeNull();
    expect(parseTrajectoryPathCleared({ schema_version: 1 })).toBeNull();
  });

  test("push does not change Load/Start eligibility: STATUS flags still decide", () => {
    const pushed = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    expect(canDrawBackendLine(pushed)).toBe(true);
    expect(canLoadBackendPreview(pushed)).toBe(false); // liveLoaded/Ready not yet reported

    const ready = reduceTrajectoryPreview(pushed, status("m1"));
    expect(ready.points).toHaveLength(5); // STATUS keeps the pushed line
    expect(canLoadBackendPreview(ready)).toBe(true);
  });

  test("a transient not-ready STATUS for the same mission keeps the pushed line", () => {
    const pushed = reduceTrajectoryPreview(known("m1"), {
      type: "PUSH_PATH",
      push: makePush(1),
    });
    const transient = reduceTrajectoryPreview(
      pushed,
      status("m1", { trajectory_ready: false, state: "PREPARING" }),
    );
    expect(transient.points).toHaveLength(5);
    expect(transient.phase).toBe("ready");
  });
});

describe("pending vs invalid display contract", () => {
  const makePush = (seq: number, count = 5): TrajectoryPathPush => ({
    schema_version: 1,
    server_instance_id: "inst-1",
    seq,
    mission_id: "m1",
    signature: "sig-a",
    count,
    x: Array.from({ length: count }, (_, i) => i * 0.05),
    y: Array.from({ length: count }, () => 0),
    lat: Array.from({ length: count }, (_, i) => 13.1 + i * 1e-6),
    lon: Array.from({ length: count }, (_, i) => 80.2 + i * 1e-6),
  });
  const clear = (
    seq: number,
    over: Record<string, unknown> = {},
  ) => ({
    type: "PUSH_CLEARED" as const,
    cleared: {
      schema_version: 1,
      server_instance_id: "inst-1",
      seq,
      mission_id: "m1",
      signature: "sig-a",
      reason: "generator_not_ready",
      requires_reprepare: false,
      ...over,
    },
  });
  const status = (over: Record<string, unknown> = {}) => ({
    type: "STATUS" as const,
    epoch: 0,
    mission: {
      loaded: true,
      trajectory_ready: true,
      state: "READY",
      mission_id: "m1",
      navigation_point_count: 5,
      ...over,
    },
  });
  const drawn = (): TrajectoryPreviewState =>
    reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      { type: "PUSH_PATH", push: makePush(10) },
    );
  const restNotLive = (over: Record<string, unknown> = {}) => ({
    type: "PREVIEW" as const,
    epoch: 0,
    missionId: "m1",
    navigationPointCount: 5,
    previewTruncated: false,
    points: [],
    snapshot: null,
    snapshotState: "assembling",
    snapshotReason: "snapshot_pending",
    requiresReprepare: false,
    ...over,
  });

  test("a clear that requires re-prepare removes the stale path immediately with a reason", () => {
    const state = reduceTrajectoryPreview(
      drawn(),
      clear(11, { reason: "prepared_origin_changed", requires_reprepare: true }),
    );
    expect(state.points).toEqual([]);
    expect(state.phase).toBe("failed");
    expect(state.message).toBe(
      `${TRAJECTORY_COPY.reprepare} (prepared_origin_changed)`,
    );
    expect(canDrawBackendLine(state)).toBe(false);
    expect(canLoadBackendPreview(state)).toBe(false);
  });

  test("ordinary lifecycle clears still keep the path (Stop/Complete history)", () => {
    const state = reduceTrajectoryPreview(drawn(), clear(11));
    expect(state.points).toHaveLength(5);
    expect(state.phase).toBe("ready");
  });

  test("the invalid message survives STATUS refreshes while trajectory_ready is still true", () => {
    let state = reduceTrajectoryPreview(
      drawn(),
      clear(11, { reason: "prepared_origin_changed", requires_reprepare: true }),
    );
    for (let i = 0; i < 3; i += 1) {
      state = reduceTrajectoryPreview(state, status());
    }
    expect(state.phase).toBe("failed");
    expect(state.message).toContain("re-prepare required");
    expect(state.points).toEqual([]);
  });

  test("a fresh path heals the invalid state", () => {
    let state = reduceTrajectoryPreview(
      drawn(),
      clear(11, { reason: "prepared_origin_changed", requires_reprepare: true }),
    );
    state = reduceTrajectoryPreview(state, {
      type: "PUSH_PATH",
      push: makePush(12),
    });
    expect(state.phase).toBe("ready");
    expect(state.points).toHaveLength(5);
    expect(state.pushInvalid).toBeNull();
    expect(reduceTrajectoryPreview(state, status()).phase).toBe("ready");
  });

  test("a new preparation or an upload ends the invalid state", () => {
    const invalid = reduceTrajectoryPreview(
      drawn(),
      clear(11, { reason: "prepared_origin_changed", requires_reprepare: true }),
    );
    const preparing = reduceTrajectoryPreview(
      invalid,
      status({ trajectory_ready: false, state: "PREPARING" }),
    );
    expect(preparing.pushInvalid).toBeNull();
    expect(preparing.phase).not.toBe("failed");

    const uploaded = reduceTrajectoryPreview(invalid, {
      type: "UPLOAD_STARTED",
      epoch: 1,
    });
    expect(uploaded.pushInvalid ?? null).toBeNull();
    expect(uploaded.phase).toBe("generating");
    expect(uploaded.pushOrder).toEqual({ instance: "inst-1", seq: 11 });
  });

  test("a requires-reprepare clear for another mission does not invalidate this one", () => {
    const state = reduceTrajectoryPreview(
      drawn(),
      clear(11, {
        mission_id: "other",
        reason: "prepared_origin_changed",
        requires_reprepare: true,
      }),
    );
    expect(state.points).toHaveLength(5);
    expect(state.phase).toBe("ready");
  });

  test("REST invalid response reports re-prepare required, not 'Rover path is empty'", () => {
    const state = reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      restNotLive({
        snapshotState: "invalid",
        snapshotReason: "prepared_origin_changed",
        requiresReprepare: true,
      }),
    );
    expect(state.phase).toBe("failed");
    expect(state.message).toContain("re-prepare required");
    expect(state.message).not.toBe(TRAJECTORY_COPY.emptyPath);
  });

  test("a delayed REST invalid response cannot invalidate a newer pushed path", () => {
    const newer = reduceTrajectoryPreview(drawn(), {
      type: "PUSH_PATH",
      push: makePush(20),
    });
    const stale = reduceTrajectoryPreview(
      newer,
      restNotLive({
        snapshotState: "invalid",
        snapshotReason: "prepared_origin_changed",
        requiresReprepare: true,
        snapshotOrder: { server_instance_id: "inst-1", seq: 15 },
      }),
    );
    expect(stale).toBe(newer);
    expect(stale.points).toHaveLength(5);
  });

  test("REST invalid response newer than the held path invalidates it", () => {
    const state = reduceTrajectoryPreview(
      drawn(),
      restNotLive({
        snapshotState: "invalid",
        snapshotReason: "prepared_origin_changed",
        requiresReprepare: true,
        snapshotOrder: { server_instance_id: "inst-1", seq: 11 },
      }),
    );
    expect(state.phase).toBe("failed");
    expect(state.points).toEqual([]);
  });

  test("repeated invalid polls are idempotent (no state churn)", () => {
    const first = reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      restNotLive({
        snapshotState: "invalid",
        snapshotReason: "snapshot_assembly_timeout",
        requiresReprepare: true,
      }),
    );
    const second = reduceTrajectoryPreview(
      first,
      restNotLive({
        snapshotState: "invalid",
        snapshotReason: "snapshot_assembly_timeout",
        requiresReprepare: true,
      }),
    );
    expect(second).toBe(first);
  });

  test("REST assembling with a real count is loading, never a hard failure", () => {
    const state = reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      restNotLive({ navigationPointCount: 180 }),
    );
    expect(state.phase).toBe("generating");
    expect(state.message).toBe(TRAJECTORY_COPY.loadingPreview);
    expect(state.navigationPointCount).toBe(180);
  });

  test("REST assembling with count 0 is still loading, not 'Rover path is empty'", () => {
    const state = reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      restNotLive({ navigationPointCount: 0 }),
    );
    expect(state.phase).toBe("generating");
    expect(state.message).not.toBe(TRAJECTORY_COPY.emptyPath);
  });

  test("REST assembling never erases a path already drawn", () => {
    const state = drawn();
    expect(
      reduceTrajectoryPreview(state, restNotLive({ navigationPointCount: 5 })),
    ).toBe(state);
  });

  test("a genuinely empty legacy preview (no state field) is still a hard failure", () => {
    const state = reduceTrajectoryPreview(
      { ...EMPTY_TRAJECTORY_PREVIEW, phase: "generating", missionId: "m1" },
      {
        type: "PREVIEW",
        epoch: 0,
        missionId: "m1",
        navigationPointCount: 0,
        previewTruncated: false,
        points: [],
      },
    );
    expect(state.phase).toBe("failed");
    expect(state.message).toBe(TRAJECTORY_COPY.emptyPath);
  });

  test("parser carries requires_reprepare", () => {
    expect(
      parseTrajectoryPathCleared({
        schema_version: 1,
        server_instance_id: "i",
        seq: 1,
        requires_reprepare: true,
        reason: "prepared_origin_changed",
      })?.requires_reprepare,
    ).toBe(true);
    expect(
      parseTrajectoryPathCleared({
        schema_version: 1,
        server_instance_id: "i",
        seq: 1,
      })?.requires_reprepare,
    ).toBe(false);
  });

  test("a timeout after a soft clear removes retained geometry with a newer sequence", () => {
    const pending = reduceTrajectoryPreview(drawn(), clear(11));
    expect(pending.points).toHaveLength(5);
    const invalid = reduceTrajectoryPreview(pending, clear(12, {
      reason: "snapshot_assembly_timeout", requires_reprepare: true,
    }));
    expect(invalid.points).toEqual([]);
    expect(invalid.phase).toBe("failed");
    expect(invalid.pushOrder?.seq).toBe(12);
  });

  test("new verified REST geometry heals invalidation and survives the next status", () => {
    const invalid = reduceTrajectoryPreview(drawn(), clear(11, {
      reason: "prepared_origin_changed", requires_reprepare: true,
    }));
    const recovered = reduceTrajectoryPreview(invalid, {
      type: "PREVIEW", epoch: 0, missionId: "m1", points: backendPoints,
      navigationPointCount: backendPoints.length,
      snapshot: { server_instance_id: "inst-1", seq: 12, mission_id: "m1", signature: "new" },
    });
    expect(recovered.phase).toBe("ready");
    expect(recovered.points).toHaveLength(backendPoints.length);
    expect(recovered.pushInvalid).toBeNull();
    expect(recovered.pushOrder?.seq).toBe(12);
    expect(reduceTrajectoryPreview(recovered, status()).phase).toBe("ready");
    const delayed = reduceTrajectoryPreview(recovered, restNotLive({
      snapshotState: "invalid", requiresReprepare: true,
      snapshotOrder: { server_instance_id: "inst-1", seq: 11 },
    }));
    expect(delayed).toBe(recovered);
  });

  test.each([10, 11, 12, undefined])("pending response seq %s cannot replace an invalid banner", (seq) => {
    const invalid = reduceTrajectoryPreview(drawn(), clear(11, {
      reason: "prepared_origin_changed", requires_reprepare: true,
    }));
    const pending = reduceTrajectoryPreview(invalid, restNotLive({
      snapshotOrder: seq === undefined ? undefined : { server_instance_id: "inst-1", seq },
    }));
    expect(pending).toBe(invalid);
  });

  test("repeated invalid reason still advances ordering for a newer REST response", () => {
    const invalid = reduceTrajectoryPreview(drawn(), clear(11, {
      reason: "prepared_origin_changed", requires_reprepare: true,
    }));
    const newer = reduceTrajectoryPreview(invalid, restNotLive({
      snapshotState: "invalid", snapshotReason: "prepared_origin_changed",
      snapshotOrder: { server_instance_id: "inst-1", seq: 13 },
    }));
    expect(newer.pushOrder?.seq).toBe(13);
    expect(reduceTrajectoryPreview(newer, { type: "PUSH_PATH", push: makePush(12) })).toBe(newer);
  });

  test("malformed or other-mission REST geometry does not clear invalidation", () => {
    const invalid = reduceTrajectoryPreview(drawn(), clear(11, {
      reason: "prepared_origin_changed", requires_reprepare: true,
    }));
    const event = {
      type: "PREVIEW" as const, epoch: 0, missionId: "m1", points: backendPoints,
      snapshot: { server_instance_id: "inst-1", seq: 12, mission_id: "m1", signature: "new" },
    };
    expect(reduceTrajectoryPreview(invalid, { ...event, points: [] })).toBe(invalid);
    expect(reduceTrajectoryPreview(invalid, {
      ...event, snapshot: { ...event.snapshot, mission_id: "other" },
    })).toBe(invalid);
  });
});
