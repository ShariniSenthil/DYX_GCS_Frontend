/**
 * Map path display.
 *
 * The only connecting line is the rover /nav_path after trajectory_ready.
 * Marking dots stay. No cyan authoring connector.
 */

export const BACKEND_TRAJECTORY_LINE_COLOR = "#A855F7";
export const BACKEND_TRAJECTORY_DOT_COLOR = "#F0ABFC";
export const AUTHORING_PREVIEW_LINE_COLOR = "#38bdf8";

export const BACKEND_LINE_RENDER = {
  sampleDisplayPoints: true,
  maxSamplePoints: 400,
} as const;

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
  navigation_point_count?: number | null;
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
  | {
      type: "PREVIEW";
      epoch: number;
      missionId?: string | null;
      navigationPointCount?: number;
      previewTruncated?: boolean;
      points: unknown;
    }
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

/**
 * After a run finishes the rover may drop `loaded` / `trajectory_ready`
 * and even report EMPTY. Keep the last purple path until a new upload
 * or a different mission id. A real Clear/Delete has EMPTY and no id.
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
    return false;
  }

  if (mission.trajectory_ready === true && mission.loaded === true) {
    return true;
  }

  return (
    isFinishedMissionState(state) ||
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
  });
  if (!collection) {
    return null;
  }
  return { source: "backend", collection };
}

export function buildBackendTrajectoryCollection(
  points: TrajectoryPreviewPoint[],
  options?: { sampleDisplayPoints?: boolean; maxSamplePoints?: number },
): LineFeatureCollection | null {
  const coordinates = points
    .filter((point) =>
      isDisplayableLatLon(point.latitude, point.longitude),
    )
    .map(
      (point) =>
        [point.longitude, point.latitude] as [number, number],
    );

  if (coordinates.length < 2) {
    return null;
  }

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

export function reduceTrajectoryPreview(
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
      const liveFlags = {
        liveLoaded: loaded,
        liveTrajectoryReady: trajectoryReady,
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

    case "STATUS_ERROR":
      if (canDrawBackendLine(previous)) {
        return previous;
      }
      return previous;

    default:
      return previous;
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
