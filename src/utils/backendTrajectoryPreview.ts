/**
 * Map path display.
 *
 * The only connecting line is the rover /nav_path after trajectory_ready.
 * Marking waypoints remain separate; interpolation samples are not rendered.
 */

export const BACKEND_TRAJECTORY_LINE_COLOR = "#A855F7";
export const BACKEND_TRAJECTORY_DOT_COLOR = "#F0ABFC";
export const AUTHORING_PREVIEW_LINE_COLOR = "#38bdf8";

export const BACKEND_LINE_RENDER = {
  // Backend points are interpolation samples, not marking points. Render a
  // single smooth line so dense missions do not look like a bead chain.
  sampleDisplayPoints: false,
  maxSamplePoints: 0,
  // Mapbox can reject very large GeoJSON geometries on mobile. Keep the
  // rendered line bounded while the backend count remains authoritative.
  maxLinePoints: 1500,
} as const;

export const MAX_MAP_WAYPOINTS = 2500;

/** Bound point-marker GeoJSON while retaining both mission endpoints. */
export function limitMapPoints<T>(
  points: T[],
  maxPoints: number = MAX_MAP_WAYPOINTS,
): T[] {
  if (points.length <= maxPoints) return points;
  const count = Math.max(2, Math.floor(maxPoints));
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (points.length - 1)) / (count - 1),
    );
    return points[sourceIndex];
  });
}

export type TrajectoryPreviewPhase =
  | "idle"
  | "offline"
  | "disconnected"
  | "generating"
  | "waiting_rtk"
  | "ready"
  | "failed";

export interface TrajectoryPreviewPoint {
  latitude: number;
  longitude: number;
  x?: number;
  y?: number;
}

export interface TrajectoryPreviewState {
  phase: TrajectoryPreviewPhase;
  points: TrajectoryPreviewPoint[];
  message: string;
  missionId: string | null;
  navigationPointCount: number;
  previewTruncated: boolean;
  epoch: number;
  /** Last STATUS `loaded` flag. Load Mission uses this, not the retained line. */
  liveLoaded: boolean;
  /** Last STATUS `trajectory_ready` flag. */
  liveTrajectoryReady: boolean;
  /** Backend confirmation that this exact mission has already been loaded. */
  acceptedForStart?: boolean;
  /** Identity of the path currently held that came from the verified push. */
  pushMeta?: TrajectoryPushMeta;
  /** Newest push/clear seen; survives resets so older events stay rejected. */
  pushOrder?: TrajectoryPushOrder;
  /** One verified push held until STATUS reveals it belongs to the current mission. */
  pendingPush?: TrajectoryPathPush | null;
  /**
   * Backend says the path cannot be shown without a new preparation (origin or
   * signature invalidated). Survives STATUS refreshes while trajectory_ready is
   * still true; cleared by a fresh path, an upload, or a new preparation.
   */
  pushInvalid?: TrajectoryPushInvalid | null;
}

export interface TrajectoryPushInvalid {
  missionId: string | null;
  reason: string;
}

export interface TrajectoryPushOrder {
  instance: string;
  seq: number;
}

export interface TrajectoryPushMeta extends TrajectoryPushOrder {
  missionId: string;
  signature: string;
}

export const TRAJECTORY_PUSH_SCHEMA_VERSION = 1;

/** Socket.IO `trajectory_path`: the generator's verified path, whole, flat arrays. */
export interface TrajectoryPathPush {
  schema_version: number;
  server_instance_id: string;
  seq: number;
  mission_id: string;
  signature: string;
  count: number;
  x: number[];
  y: number[];
  lat: number[];
  lon: number[];
}

/** Socket.IO `trajectory_path_cleared`: invalid clears also remove held geometry. */
export interface TrajectoryPathCleared {
  schema_version: number;
  server_instance_id: string;
  seq: number;
  mission_id: string | null;
  signature: string | null;
  reason?: string | null;
  /** True when the geometry cannot become valid again without a new preparation. */
  requires_reprepare?: boolean;
}

/** Identity carried by the new backend's `/loaded-path` (`snapshot`), null on old backends. */
export interface TrajectorySnapshotIdentity {
  server_instance_id: string;
  seq: number;
  mission_id: string;
  signature: string;
}

export interface MissionTrajectorySnapshot {
  loaded?: boolean;
  trajectory_ready?: boolean;
  state?: string | null;
  error?: string | null;
  message?: string | null;
  rtk_fixed?: boolean;
  rtk_reason?: string | null;
  mission_id?: string | null;
  accepted_for_start?: boolean;
  navigation_point_count?: number | null;
  terminal_cleanup_status?: string | null;
}

export type TrajectoryPreviewEvent =
  | { type: "OFFLINE" }
  | { type: "DISCONNECTED" }
  | { type: "UPLOAD_STARTED"; epoch: number }
  | {
      type: "STATUS";
      epoch: number;
      mission: MissionTrajectorySnapshot;
    }
  | { type: "LOAD_ACCEPTED" }
  | {
      type: "PREVIEW";
      epoch: number;
      missionId?: string | null;
      navigationPointCount?: number;
      previewTruncated?: boolean;
      points: unknown;
      snapshot?: unknown;
      /** New backend, no live snapshot: "assembling" | "invalid" | "idle" | "disabled". */
      snapshotState?: string | null;
      snapshotReason?: string | null;
      requiresReprepare?: boolean;
      /** Ordering identity of a not-live response, so a delayed poll can be ordered. */
      snapshotOrder?: unknown;
    }
  | { type: "PUSH_PATH"; push: TrajectoryPathPush }
  | { type: "PUSH_CLEARED"; cleared: TrajectoryPathCleared }
  | { type: "STATUS_ERROR" };

export const TRAJECTORY_COPY = {
  offline: "Connect a rover to generate the path.",
  disconnected: "Connect a rover to generate the path.",
  generating: "Generating trajectory…",
  waitingRtk: "Waiting for RTK FIXED",
  failed: "Trajectory failed",
  truncated: "Preview truncated — rover still has the full path.",
  loadingPreview: "Loading generated path…",
  emptyPath: "Rover path is empty.",
  reprepare: "Trajectory invalidated — re-prepare required",
} as const;

export const EMPTY_TRAJECTORY_PREVIEW: TrajectoryPreviewState = {
  phase: "idle",
  points: [],
  message: "",
  missionId: null,
  navigationPointCount: 0,
  previewTruncated: false,
  epoch: 0,
  liveLoaded: false,
  liveTrajectoryReady: false,
  acceptedForStart: false,
};

export type LineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { kind: "line" | "point"; index?: number };
    geometry:
      | { type: "LineString"; coordinates: [number, number][] }
      | { type: "Point"; coordinates: [number, number] };
  }>;
};

export function isDisplayableLatLon(
  lat: unknown,
  lon: unknown,
): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function filterLoadedPathPoints(
  points: unknown,
): TrajectoryPreviewPoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  const out: TrajectoryPreviewPoint[] = [];

  for (const raw of points) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const record = raw as Record<string, unknown>;
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);

    if (!isDisplayableLatLon(latitude, longitude)) {
      continue;
    }

    const point: TrajectoryPreviewPoint = { latitude, longitude };
    const x = Number(record.x);
    const y = Number(record.y);
    if (Number.isFinite(x)) {
      point.x = x;
    }
    if (Number.isFinite(y)) {
      point.y = y;
    }
    out.push(point);
  }

  return out;
}

export function shouldPollMissionStatus(args: {
  isOffline: boolean;
  connectionState: string;
}): boolean {
  return !args.isOffline && args.connectionState === "connected";
}

export function shouldFetchLoadedPath(args: {
  isOffline: boolean;
  connectionState: string;
  loaded: boolean;
  trajectoryReady: boolean;
}): boolean {
  return (
    shouldPollMissionStatus(args) &&
    args.loaded === true &&
    args.trajectoryReady === true
  );
}

export function canDrawBackendLine(
  state: Pick<TrajectoryPreviewState, "phase" | "points">,
): boolean {
  return state.phase === "ready" && state.points.length >= 2;
}

/**
 * Load Mission confirms a live rover preview. A line kept after a finished
 * run is display-only and must not re-enable Load.
 */
export function canLoadBackendPreview(
  state: Pick<
    TrajectoryPreviewState,
    "phase" | "points" | "liveLoaded" | "liveTrajectoryReady"
  >,
): boolean {
  return (
    canDrawBackendLine(state) &&
    state.liveLoaded === true &&
    state.liveTrajectoryReady === true
  );
}

function isFinishedMissionState(state: string): boolean {
  return (
    state === "COMPLETED" ||
    state === "STOPPED" ||
    state === "LOADED" ||
    state === "EMPTY"
  );
}

function isActiveMissionState(state: string): boolean {
  return (
    state === "RUNNING" ||
    state === "PAUSED" ||
    state === "WAITING_FOR_NEXT" ||
    state === "ARMING" ||
    state === "SWITCHING_OFFBOARD" ||
    state === "LOADING"
  );
}

/**
 * The rover can briefly drop `trajectory_ready` while starting or while a
 * mission is active. Keep the last path for the same mission during those
 * transitions. After a run finishes the rover may also report EMPTY; keep
 * that display-only path until a real Clear/Delete (EMPTY with no id) or a
 * new upload/different mission id.
 */
export function shouldRetainReadyPath(
  previous: Pick<TrajectoryPreviewState, "phase" | "points" | "missionId">,
  mission: MissionTrajectorySnapshot,
): boolean {
  if (!canDrawBackendLine(previous)) {
    return false;
  }

  const state = String(mission.state ?? "").trim().toUpperCase();
  if (state === "ERROR") {
    return false;
  }

  const nextId = missionIdOf(mission, null);
  if (
    nextId != null &&
    previous.missionId != null &&
    nextId !== previous.missionId
  ) {
    return false;
  }

  if (state === "EMPTY" && mission.loaded !== true && nextId == null) {
    return String(mission.terminal_cleanup_status ?? "").trim().toUpperCase() === "ARCHIVED";
  }

  if (mission.trajectory_ready === true && mission.loaded === true) {
    return true;
  }

  return (
    isFinishedMissionState(state) ||
    isActiveMissionState(state) ||
    state === "READY" ||
    state === "IDLE" ||
    state === "PREPARING"
  );
}

export function buildAuthoringPreviewCollection(
  waypoints: Array<{ lat?: number; lon?: number }>,
): LineFeatureCollection | null {
  const coordinates = waypoints
    .filter((wp) => isDisplayableLatLon(wp.lat, wp.lon))
    .map((wp) => [wp.lon as number, wp.lat as number] as [number, number]);

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "line" },
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ],
  };
}

export type MapLineSource = "backend" | "authoring";

export interface SelectedMapLine {
  source: MapLineSource;
  collection: LineFeatureCollection;
}

/**
 * Map display contract: backend /nav_path only.
 */
export function selectMapLine(args: {
  localWaypoints: Array<{ lat?: number; lon?: number }>;
  trajectoryPoints: TrajectoryPreviewPoint[];
  backendReady?: boolean;
}): SelectedMapLine | null {
  const backendReady =
    args.backendReady === true || args.trajectoryPoints.length >= 2;
  if (!backendReady) {
    return null;
  }
  const collection = buildBackendTrajectoryCollection(args.trajectoryPoints, {
    sampleDisplayPoints: BACKEND_LINE_RENDER.sampleDisplayPoints,
    maxSamplePoints: BACKEND_LINE_RENDER.maxSamplePoints,
    maxLinePoints: BACKEND_LINE_RENDER.maxLinePoints,
  });
  if (!collection) {
    return null;
  }
  return { source: "backend", collection };
}

export function buildBackendTrajectoryCollection(
  points: TrajectoryPreviewPoint[],
  options?: {
    sampleDisplayPoints?: boolean;
    maxSamplePoints?: number;
    maxLinePoints?: number;
  },
): LineFeatureCollection | null {
  const allCoordinates = points
    .filter((point) =>
      isDisplayableLatLon(point.latitude, point.longitude),
    )
    .map(
      (point) =>
        [point.longitude, point.latitude] as [number, number],
    );

  if (allCoordinates.length < 2) {
    return null;
  }

  const maxLinePoints = Math.max(2, options?.maxLinePoints ?? 1500);
  const coordinates = allCoordinates.length <= maxLinePoints
    ? allCoordinates
    : Array.from({ length: maxLinePoints }, (_, index) => {
        const sourceIndex = Math.round(
          (index * (allCoordinates.length - 1)) / (maxLinePoints - 1),
        );
        return allCoordinates[sourceIndex];
      });

  const features: LineFeatureCollection["features"] = [
    {
      type: "Feature",
      properties: { kind: "line" },
      geometry: {
        type: "LineString",
        coordinates,
      },
    },
  ];

  if (options?.sampleDisplayPoints) {
    const maxSamplePoints = Math.max(2, options.maxSamplePoints ?? 400);
    const step = Math.max(1, Math.ceil(coordinates.length / maxSamplePoints));
    coordinates.forEach((coordinate, index) => {
      const isEnd = index === 0 || index === coordinates.length - 1;
      if (!isEnd && index % step !== 0) {
        return;
      }
      features.push({
        type: "Feature",
        properties: { kind: "point", index },
        geometry: { type: "Point", coordinates: coordinate },
      });
    });
  }

  return { type: "FeatureCollection", features };
}

function missionIdOf(
  mission: MissionTrajectorySnapshot,
  fallback: string | null,
): string | null {
  if (typeof mission.mission_id === "string" && mission.mission_id.trim()) {
    return mission.mission_id.trim();
  }
  return fallback;
}

function isStaleEpoch(
  eventEpoch: number,
  currentEpoch: number,
): boolean {
  return currentEpoch > 0 && eventEpoch < currentEpoch;
}

function waitingForRtk(mission: MissionTrajectorySnapshot): boolean {
  if (mission.rtk_fixed === false) {
    return true;
  }
  const blob = `${mission.message ?? ""} ${mission.rtk_reason ?? ""}`.toLowerCase();
  return blob.includes("rtk");
}

function failedMessage(mission: MissionTrajectorySnapshot): string {
  const error = typeof mission.error === "string" ? mission.error.trim() : "";
  if (error) {
    return error;
  }
  const message =
    typeof mission.message === "string" ? mission.message.trim() : "";
  if (message) {
    return message;
  }
  return TRAJECTORY_COPY.failed;
}

function reduceCore(
  previous: TrajectoryPreviewState,
  event: TrajectoryPreviewEvent,
): TrajectoryPreviewState {
  switch (event.type) {
    case "OFFLINE":
      return {
        ...EMPTY_TRAJECTORY_PREVIEW,
        phase: "offline",
        message: TRAJECTORY_COPY.offline,
        epoch: previous.epoch,
      };

    case "DISCONNECTED":
      if (canDrawBackendLine(previous)) {
        return {
          ...previous,
          message: TRAJECTORY_COPY.disconnected,
        };
      }
      return {
        ...EMPTY_TRAJECTORY_PREVIEW,
        phase: "disconnected",
        message: TRAJECTORY_COPY.disconnected,
        epoch: previous.epoch,
      };

    case "UPLOAD_STARTED":
      return {
        ...EMPTY_TRAJECTORY_PREVIEW,
        phase: "generating",
        message: TRAJECTORY_COPY.generating,
        epoch: event.epoch,
      };

    case "STATUS": {
      if (isStaleEpoch(event.epoch, previous.epoch)) {
        return previous;
      }

      const mission = event.mission;
      const missionId = missionIdOf(mission, previous.missionId);
      const state = String(mission.state ?? "").trim().toUpperCase();
      const loaded = mission.loaded === true;
      const trajectoryReady = mission.trajectory_ready === true;
      const navCount = Number(mission.navigation_point_count ?? 0);
      const safeNavCount = Number.isFinite(navCount) ? Math.max(0, navCount) : 0;
      // The label is bound to the backend mission ID, not to a temporary
      // terminal state. Restoring the same archived ID must still say
      // "Load Again"; only a different upload resets it to "Load".
      const retainsAcceptedLoad =
        previous.acceptedForStart === true &&
        (missionId === null || missionId === previous.missionId);
      const liveFlags = {
        liveLoaded: loaded,
        liveTrajectoryReady: trajectoryReady,
        acceptedForStart:
          mission.accepted_for_start === true || retainsAcceptedLoad,
      };

      if (state === "ERROR" || (typeof mission.error === "string" && mission.error.trim())) {
        return {
          ...EMPTY_TRAJECTORY_PREVIEW,
          phase: "failed",
          message: failedMessage(mission),
          epoch: event.epoch,
          missionId,
          ...liveFlags,
        };
      }

      if (shouldRetainReadyPath(previous, mission)) {
        return {
          ...previous,
          phase: "ready",
          epoch: event.epoch,
          missionId: missionId ?? previous.missionId,
          navigationPointCount:
            safeNavCount > 0 ? safeNavCount : previous.navigationPointCount,
          ...liveFlags,
        };
      }

      if (!loaded) {
        return {
          ...EMPTY_TRAJECTORY_PREVIEW,
          phase: "idle",
          epoch: event.epoch,
          missionId,
          ...liveFlags,
        };
      }

      if (trajectoryReady !== true) {
        const phase = waitingForRtk(mission) ? "waiting_rtk" : "generating";
        return {
          ...EMPTY_TRAJECTORY_PREVIEW,
          phase,
          message:
            phase === "waiting_rtk"
              ? TRAJECTORY_COPY.waitingRtk
              : mission.message?.trim() || TRAJECTORY_COPY.generating,
          epoch: event.epoch,
          missionId,
          navigationPointCount: safeNavCount,
          ...liveFlags,
        };
      }

      const sameMission =
        previous.missionId != null &&
        missionId != null &&
        previous.missionId === missionId;

      if (sameMission && canDrawBackendLine(previous)) {
        return {
          ...previous,
          phase: "ready",
          epoch: event.epoch,
          missionId,
          navigationPointCount:
            safeNavCount > 0 ? safeNavCount : previous.navigationPointCount,
          ...liveFlags,
        };
      }

      return {
        ...EMPTY_TRAJECTORY_PREVIEW,
        phase: "generating",
        message: TRAJECTORY_COPY.loadingPreview,
        epoch: event.epoch,
        missionId,
        navigationPointCount: safeNavCount,
        ...liveFlags,
      };
    }

    case "PREVIEW": {
      if (isStaleEpoch(event.epoch, previous.epoch)) {
        return previous;
      }

      const points = filterLoadedPathPoints(event.points);
      if (points.length < 2) {
        if (canDrawBackendLine(previous)) {
          return previous;
        }
        const navCount = Number(event.navigationPointCount ?? 0);
        if (
          previous.phase !== "waiting_rtk" &&
          Number.isFinite(navCount) &&
          navCount === 0
        ) {
          return {
            ...previous,
            phase: "failed",
            points: [],
            message: TRAJECTORY_COPY.emptyPath,
            navigationPointCount: 0,
            previewTruncated: false,
            epoch: event.epoch,
          };
        }
        return {
          ...previous,
          phase:
            previous.phase === "waiting_rtk" ? "waiting_rtk" : "generating",
          message:
            previous.phase === "waiting_rtk"
              ? TRAJECTORY_COPY.waitingRtk
              : TRAJECTORY_COPY.loadingPreview,
          epoch: event.epoch,
        };
      }

      return {
        ...previous,
        phase: "ready",
        points,
        message: event.previewTruncated ? TRAJECTORY_COPY.truncated : "",
        navigationPointCount: Number(
          event.navigationPointCount ?? points.length,
        ),
        previewTruncated: event.previewTruncated === true,
        missionId: event.missionId ?? previous.missionId,
        epoch: event.epoch,
      };
    }

    case "LOAD_ACCEPTED":
      return {
        ...previous,
        acceptedForStart: true,
      };

    case "STATUS_ERROR":
      if (canDrawBackendLine(previous)) {
        return previous;
      }
      return previous;

    default:
      return previous;
  }
}

// ── Verified push (trajectory_path) ────────────────────────────────────────
//
// Rules (transport correctness, not a second source of truth):
//  * Ordering: within one server_instance_id only a higher `seq` is applied;
//    a new instance id (backend restart) restarts the counter. `pushOrder`
//    survives path resets, so a delayed older event cannot come back.
//  * Identity: the signature is learned from the first valid push for a
//    mission and held as data. A push is drawn only when its mission_id equals
//    the mission STATUS reports; otherwise ONE push is held (pendingPush) and
//    drawn as soon as STATUS names that mission, or dropped if it names another.
//  * Fallback: the REST loaded-path can never replace a pushed path. A new-backend
//    snapshot is ordered by seq like a push; an old-backend (capped) preview is
//    ignored while a pushed path is held.
//  * Invalid clears remove the line. Ordinary lifecycle clears retain the
//    existing STATUS history rules (Stop/Complete keep the path).
//  * Load/Start eligibility is untouched: it still comes from STATUS flags.

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseTrajectoryPathPush(
  raw: unknown,
): TrajectoryPathPush | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (r.schema_version !== TRAJECTORY_PUSH_SCHEMA_VERSION) {
    return null;
  }
  if (!nonEmptyString(r.server_instance_id) || !nonEmptyString(r.mission_id)) {
    return null;
  }
  if (!nonEmptyString(r.signature)) {
    return null;
  }
  if (typeof r.seq !== "number" || !Number.isFinite(r.seq)) {
    return null;
  }
  const { x, y, lat, lon } = r;
  if (
    !isFiniteNumberArray(x) ||
    !isFiniteNumberArray(y) ||
    !isFiniteNumberArray(lat) ||
    !isFiniteNumberArray(lon)
  ) {
    return null;
  }
  const count = typeof r.count === "number" ? r.count : x.length;
  if (
    x.length !== count ||
    y.length !== count ||
    lat.length !== count ||
    lon.length !== count
  ) {
    return null;
  }
  return {
    schema_version: TRAJECTORY_PUSH_SCHEMA_VERSION,
    server_instance_id: r.server_instance_id,
    seq: r.seq,
    mission_id: r.mission_id.trim(),
    signature: r.signature,
    count,
    x,
    y,
    lat,
    lon,
  };
}

export function parseTrajectoryPathCleared(
  raw: unknown,
): TrajectoryPathCleared | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    r.schema_version !== TRAJECTORY_PUSH_SCHEMA_VERSION ||
    !nonEmptyString(r.server_instance_id) ||
    typeof r.seq !== "number" ||
    !Number.isFinite(r.seq)
  ) {
    return null;
  }
  return {
    schema_version: TRAJECTORY_PUSH_SCHEMA_VERSION,
    server_instance_id: r.server_instance_id,
    seq: r.seq,
    mission_id: nonEmptyString(r.mission_id) ? r.mission_id.trim() : null,
    signature: nonEmptyString(r.signature) ? r.signature : null,
    reason: typeof r.reason === "string" ? r.reason : null,
    requires_reprepare: r.requires_reprepare === true,
  };
}

function parseSnapshotIdentity(raw: unknown): TrajectorySnapshotIdentity | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    !nonEmptyString(r.server_instance_id) ||
    !nonEmptyString(r.mission_id) ||
    !nonEmptyString(r.signature) ||
    typeof r.seq !== "number" ||
    !Number.isFinite(r.seq)
  ) {
    return null;
  }
  return {
    server_instance_id: r.server_instance_id,
    seq: r.seq,
    mission_id: r.mission_id.trim(),
    signature: r.signature,
  };
}

function parseSnapshotOrder(
  raw: unknown,
): { server_instance_id: string; seq: number } | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    !nonEmptyString(r.server_instance_id) ||
    typeof r.seq !== "number" ||
    !Number.isFinite(r.seq)
  ) {
    return null;
  }
  return { server_instance_id: r.server_instance_id, seq: r.seq };
}

/** True when an event with this identity is newer than everything already seen. */
function pushOrderAccepts(
  order: TrajectoryPushOrder | undefined,
  event: { server_instance_id: string; seq: number },
): boolean {
  return (
    order === undefined ||
    order.instance !== event.server_instance_id ||
    event.seq > order.seq
  );
}

function pointsFromPush(push: TrajectoryPathPush): TrajectoryPreviewPoint[] {
  const points: TrajectoryPreviewPoint[] = [];
  for (let index = 0; index < push.count; index += 1) {
    const latitude = push.lat[index];
    const longitude = push.lon[index];
    if (!isDisplayableLatLon(latitude, longitude)) {
      continue;
    }
    points.push({
      latitude,
      longitude,
      x: push.x[index],
      y: push.y[index],
    });
  }
  return points;
}

function applyPushCore(
  state: TrajectoryPreviewState,
  push: TrajectoryPathPush,
): TrajectoryPreviewState {
  const points = pointsFromPush(push);
  if (points.length < 2) {
    return { ...state, pendingPush: null };
  }
  return {
    ...state,
    phase: "ready",
    points,
    message: "",
    navigationPointCount: push.count,
    previewTruncated: false,
    missionId: push.mission_id,
    pendingPush: null,
    pushInvalid: null,
    pushMeta: {
      instance: push.server_instance_id,
      seq: push.seq,
      missionId: push.mission_id,
      signature: push.signature,
    },
  };
}

function applyPush(
  previous: TrajectoryPreviewState,
  push: TrajectoryPathPush,
): TrajectoryPreviewState {
  if (!pushOrderAccepts(previous.pushOrder, push)) {
    return previous;
  }
  const withOrder: TrajectoryPreviewState = {
    ...previous,
    pushOrder: { instance: push.server_instance_id, seq: push.seq },
  };
  if (previous.missionId !== push.mission_id) {
    return { ...withOrder, pendingPush: push };
  }
  return applyPushCore(withOrder, push);
}

/**
 * The backend says this mission's path is no longer valid and needs a new
 * preparation. Stale geometry must not stay on the map, and the message must
 * say why (not "empty" and not "loading" forever).
 */
function invalidatedState(
  previous: TrajectoryPreviewState,
  args: {
    missionId: string | null;
    reason: string;
    order?: TrajectoryPushOrder;
    epoch?: number;
  },
): TrajectoryPreviewState {
  const held = previous.pushInvalid;
  if (
    held &&
    held.reason === args.reason &&
    held.missionId === args.missionId &&
    previous.phase === "failed" &&
    previous.points.length === 0 &&
    (args.epoch === undefined || args.epoch === previous.epoch) &&
    (args.order === undefined ||
      (args.order.instance === previous.pushOrder?.instance &&
        args.order.seq === previous.pushOrder?.seq))
  ) {
    return previous;
  }
  return {
    ...EMPTY_TRAJECTORY_PREVIEW,
    phase: "failed",
    message: `${TRAJECTORY_COPY.reprepare} (${args.reason})`,
    epoch: args.epoch ?? previous.epoch,
    missionId: args.missionId ?? previous.missionId,
    navigationPointCount: previous.navigationPointCount,
    liveLoaded: previous.liveLoaded,
    liveTrajectoryReady: previous.liveTrajectoryReady,
    acceptedForStart: previous.acceptedForStart,
    pushOrder: args.order ?? previous.pushOrder,
    pendingPush:
      args.order && previous.pendingPush?.server_instance_id === args.order.instance &&
      previous.pendingPush.seq <= args.order.seq
        ? null
        : previous.pendingPush,
    pushInvalid: { missionId: args.missionId ?? previous.missionId, reason: args.reason },
  };
}

function applyCleared(
  previous: TrajectoryPreviewState,
  cleared: TrajectoryPathCleared,
): TrajectoryPreviewState {
  if (!pushOrderAccepts(previous.pushOrder, cleared)) {
    return previous;
  }
  const order = { instance: cleared.server_instance_id, seq: cleared.seq };
  const pending = previous.pendingPush;
  const supersedesPending =
    pending != null &&
    pending.server_instance_id === cleared.server_instance_id &&
    pending.seq < cleared.seq;
  const advanced: TrajectoryPreviewState = {
    ...previous,
    pushOrder: order,
    pendingPush: supersedesPending ? null : pending,
  };

  // Ordinary lifecycle clears (Stop/Complete/re-prepare) keep the line: the
  // STATUS retention rules own that history. Only a clear that says the
  // geometry can no longer be valid removes it now.
  const sameMission =
    cleared.mission_id == null ||
    previous.missionId == null ||
    cleared.mission_id === previous.missionId;
  if (cleared.requires_reprepare === true && sameMission) {
    return invalidatedState(advanced, {
      missionId: cleared.mission_id ?? previous.missionId,
      reason: cleared.reason ?? "invalidated",
      order,
    });
  }
  return advanced;
}

function pick<T>(next: T | undefined, previous: T | undefined): T | undefined {
  return next === undefined ? previous : next;
}

/** Carry push bookkeeping across core resets and resolve a held push. */
function settlePush(
  previous: TrajectoryPreviewState,
  next: TrajectoryPreviewState,
  event?: TrajectoryPreviewEvent,
): TrajectoryPreviewState {
  const pushOrder = pick(next.pushOrder, previous.pushOrder);
  const pendingPush = pick(next.pendingPush, previous.pendingPush);
  let pushInvalid = pick(next.pushInvalid, previous.pushInvalid);
  let state =
    next.pushOrder === pushOrder &&
    next.pendingPush === pendingPush &&
    next.pushInvalid === pushInvalid
      ? next
      : { ...next, pushOrder, pendingPush, pushInvalid };

  const pending = state.pendingPush;
  if (pending && state.missionId) {
    state =
      state.missionId === pending.mission_id
        ? applyPushCore(state, pending)
        : { ...state, pendingPush: null };
  }

  // "Invalid" only holds while the backend still reports the trajectory ready
  // for the same mission; an upload, a new preparation or another mission ends it.
  pushInvalid = state.pushInvalid;
  if (pushInvalid) {
    const preparationRestarted =
      event?.type === "UPLOAD_STARTED" ||
      (event?.type === "STATUS" && event.mission.trajectory_ready !== true);
    const otherMission =
      pushInvalid.missionId != null &&
      state.missionId != null &&
      pushInvalid.missionId !== state.missionId;
    if (preparationRestarted || otherMission) {
      state = { ...state, pushInvalid: null };
    } else if (state.phase !== "ready" || state.points.length > 0) {
      state = {
        ...state,
        phase: "failed",
        points: [],
        message: `${TRAJECTORY_COPY.reprepare} (${pushInvalid.reason})`,
      };
    }
  }
  return state;
}

function reducePreviewFallback(
  previous: TrajectoryPreviewState,
  event: Extract<TrajectoryPreviewEvent, { type: "PREVIEW" }>,
): TrajectoryPreviewState {
  if (isStaleEpoch(event.epoch, previous.epoch)) {
    return previous;
  }
  const snapshot = parseSnapshotIdentity(event.snapshot);

  // New backend, no live snapshot: it says WHY there are no points.
  if (!snapshot && typeof event.snapshotState === "string") {
    const order = parseSnapshotOrder(event.snapshotOrder);
    if (order && !pushOrderAccepts(previous.pushOrder, order)) {
      return previous;
    }
    if (event.snapshotState === "invalid" || event.requiresReprepare === true) {
      return invalidatedState(previous, {
        missionId: event.missionId ?? previous.missionId,
        reason: event.snapshotReason ?? "invalidated",
        order: order
          ? { instance: order.server_instance_id, seq: order.seq }
          : undefined,
        epoch: event.epoch,
      });
    }
    if (event.snapshotState === "assembling") {
      // Pending assembly is never an empty path, whatever count is reported.
      if (previous.pushInvalid || canDrawBackendLine(previous)) {
        return previous;
      }
      const expected = Number(event.navigationPointCount ?? 0);
      return {
        ...previous,
        pushOrder: order
          ? { instance: order.server_instance_id, seq: order.seq }
          : previous.pushOrder,
        phase: previous.phase === "waiting_rtk" ? "waiting_rtk" : "generating",
        message:
          previous.phase === "waiting_rtk"
            ? TRAJECTORY_COPY.waitingRtk
            : TRAJECTORY_COPY.loadingPreview,
        navigationPointCount: Number.isFinite(expected)
          ? Math.max(previous.navigationPointCount, expected)
          : previous.navigationPointCount,
        epoch: event.epoch,
      };
    }
    // "idle" / "disabled": fall through to the legacy handling below.
  }

  if (snapshot) {
    if (!pushOrderAccepts(previous.pushOrder, snapshot)) {
      return previous;
    }
    // A verified REST snapshot is the same recovery authority as a push.
    // Do not carry an old invalid marker through settlePush, which would
    // erase this newer geometry again.
    const missionId = event.missionId ?? previous.missionId;
    if (snapshot.mission_id !== missionId) {
      return previous;
    }
    const points = filterLoadedPathPoints(event.points);
    if (points.length < 2) {
      return previous;
    }
    return {
      ...previous,
      phase: "ready",
      points,
      message: event.previewTruncated ? TRAJECTORY_COPY.truncated : "",
      navigationPointCount: Number(event.navigationPointCount ?? points.length),
      previewTruncated: event.previewTruncated === true,
      missionId,
      epoch: event.epoch,
      pushInvalid: null,
      pendingPush: null,
      pushOrder: { instance: snapshot.server_instance_id, seq: snapshot.seq },
      pushMeta: {
        instance: snapshot.server_instance_id,
        seq: snapshot.seq,
        missionId: snapshot.mission_id,
        signature: snapshot.signature,
      },
    };
  } else if (previous.pushMeta) {
    // Old-backend (capped) preview must never replace a pushed full path.
    return previous;
  }

  return settlePush(previous, reduceCore(previous, event), event);
}

export function reduceTrajectoryPreview(
  previous: TrajectoryPreviewState,
  event: TrajectoryPreviewEvent,
): TrajectoryPreviewState {
  switch (event.type) {
    case "PUSH_PATH":
      return applyPush(previous, event.push);
    case "PUSH_CLEARED":
      return applyCleared(previous, event.cleared);
    case "PREVIEW":
      return reducePreviewFallback(previous, event);
    default:
      return settlePush(previous, reduceCore(previous, event), event);
  }
}

export function bannerVisibleFor(state: TrajectoryPreviewState): boolean {
  return (
    state.phase === "generating" ||
    state.phase === "waiting_rtk" ||
    state.phase === "failed" ||
    state.phase === "offline" ||
    (state.phase === "ready" && state.previewTruncated) ||
    (state.phase === "disconnected" && !canDrawBackendLine(state))
  );
}
