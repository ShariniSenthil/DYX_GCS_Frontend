import { offlineManager } from "@rnmapbox/maps";
import { MAPBOX_STYLE_SATELLITE } from "../config/mapboxConfig";

/**
 * Mapbox downloads are scoped to a bounded region.  Keeping this policy here
 * makes it impossible for a normal pan gesture to turn into an unbounded
 * permanent download.
 */
const PACK_PREFIX = "dyx-field-satellite-v1";
const MAX_MANAGED_PACKS = 3;
const MIN_ZOOM = 12;
const MAX_ZOOM = 17;
const MISSION_BUFFER_METERS = 750;
const ROVER_RADIUS_METERS = 1_500;
const PACK_EDGE_BUFFER_METERS = 500;
const MAX_AUTOMATIC_MISSION_SPAN_METERS = 8_000;

export type OfflineMapPoint = { lat: number; lon: number };

export type OfflineMapRegion = {
  key: string;
  source: "mission" | "rover";
  bounds: {
    ne: [number, number];
    sw: [number, number];
  };
};

export type OfflineMapProgress = {
  phase: "waiting" | "downloading" | "ready" | "failed";
  progress: number;
  message: string;
  packName?: string;
};

type PackMetadata = {
  app?: string;
  version?: number;
  styleURL?: string;
  bounds?: { ne?: [number, number]; sw?: [number, number] };
  createdAt?: number;
};

type ManagedPack = {
  name?: string;
  metadata?: PackMetadata;
  status: () => Promise<{ percentage?: number }>;
  resume: () => Promise<void>;
};

type NativeProgress = {
  percentage?: number;
  completedResourceCount?: number;
  requiredResourceCount?: number;
};

function isValidPoint(point: OfflineMapPoint | null | undefined): point is OfflineMapPoint {
  return Boolean(
    point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lon) &&
      point.lat >= -90 &&
      point.lat <= 90 &&
      point.lon >= -180 &&
      point.lon <= 180 &&
      !(point.lat === 0 && point.lon === 0),
  );
}

function latitudeDegreesForMeters(meters: number): number {
  return meters / 111_320;
}

function longitudeDegreesForMeters(meters: number, latitude: number): number {
  // Do not let a near-polar test value produce an unbounded region.
  return meters / Math.max(111_320 * Math.cos((latitude * Math.PI) / 180), 1_000);
}

function spanMeters(minLat: number, minLon: number, maxLat: number, maxLon: number): number {
  const centerLat = (minLat + maxLat) / 2;
  const latSpan = (maxLat - minLat) * 111_320;
  const lonSpan =
    (maxLon - minLon) * 111_320 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01);
  return Math.max(latSpan, lonSpan);
}

function makeRegion(
  source: OfflineMapRegion["source"],
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
): OfflineMapRegion {
  // Snap outwards to the key precision. A later telemetry value in the same
  // bucket must never ask for a few metres that the earlier pack omitted.
  const precision = 10_000;
  const sw: [number, number] = [
    Math.max(-180, Math.floor(minLon * precision) / precision),
    Math.max(-90, Math.floor(minLat * precision) / precision),
  ];
  const ne: [number, number] = [
    Math.min(180, Math.ceil(maxLon * precision) / precision),
    Math.min(90, Math.ceil(maxLat * precision) / precision),
  ];
  const stableBounds = [...sw, ...ne].map((value) => value.toFixed(4)).join(":");
  return {
    source,
    bounds: { ne, sw },
    key: `${source}:${stableBounds}`,
  };
}

/**
 * Prefer the mission footprint. Large missions are intentionally not fetched
 * automatically: use a rover-sized safety region instead, or wait until a
 * user opens a more explicit offline-area workflow in the future.
 */
export function deriveOfflineMapRegion(
  points: OfflineMapPoint[],
  rover: OfflineMapPoint | null,
): OfflineMapRegion | null {
  const validPoints = points.filter(isValidPoint);
  if (validPoints.length > 0) {
    let minLat = validPoints[0].lat;
    let maxLat = validPoints[0].lat;
    let minLon = validPoints[0].lon;
    let maxLon = validPoints[0].lon;
    for (const point of validPoints) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLon = Math.min(minLon, point.lon);
      maxLon = Math.max(maxLon, point.lon);
    }

    if (spanMeters(minLat, minLon, maxLat, maxLon) <= MAX_AUTOMATIC_MISSION_SPAN_METERS) {
      const centerLat = (minLat + maxLat) / 2;
      const latBuffer = latitudeDegreesForMeters(MISSION_BUFFER_METERS);
      const lonBuffer = longitudeDegreesForMeters(MISSION_BUFFER_METERS, centerLat);
      return makeRegion(
        "mission",
        minLat - latBuffer,
        minLon - lonBuffer,
        maxLat + latBuffer,
        maxLon + lonBuffer,
      );
    }
  }

  if (!isValidPoint(rover)) return null;
  const latBuffer = latitudeDegreesForMeters(ROVER_RADIUS_METERS);
  const lonBuffer = longitudeDegreesForMeters(ROVER_RADIUS_METERS, rover.lat);
  return makeRegion(
    "rover",
    rover.lat - latBuffer,
    rover.lon - lonBuffer,
    rover.lat + latBuffer,
    rover.lon + lonBuffer,
  );
}

function packNameFor(region: OfflineMapRegion): string {
  // Short deterministic FNV-1a hash. Pack names survive an app restart, so a
  // random name would make duplicate protection impossible.
  const value = `${MAPBOX_STYLE_SATELLITE}|${region.key}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${PACK_PREFIX}-${(hash >>> 0).toString(36)}`;
}

function expandedBounds(region: OfflineMapRegion): OfflineMapRegion["bounds"] {
  const centerLat = (region.bounds.ne[1] + region.bounds.sw[1]) / 2;
  const latBuffer = latitudeDegreesForMeters(PACK_EDGE_BUFFER_METERS);
  const lonBuffer = longitudeDegreesForMeters(PACK_EDGE_BUFFER_METERS, centerLat);
  return {
    ne: [
      Math.min(180, region.bounds.ne[0] + lonBuffer),
      Math.min(90, region.bounds.ne[1] + latBuffer),
    ],
    sw: [
      Math.max(-180, region.bounds.sw[0] - lonBuffer),
      Math.max(-90, region.bounds.sw[1] - latBuffer),
    ],
  };
}

function isManagedPack(pack: ManagedPack): boolean {
  return pack.metadata?.app === PACK_PREFIX && pack.metadata?.version === 1;
}

function containsRegion(pack: ManagedPack, region: OfflineMapRegion): boolean {
  const bounds = pack.metadata?.bounds;
  const ne = bounds?.ne;
  const sw = bounds?.sw;
  if (!ne || !sw || pack.metadata?.styleURL !== MAPBOX_STYLE_SATELLITE) return false;
  return (
    sw[0] <= region.bounds.sw[0] &&
    sw[1] <= region.bounds.sw[1] &&
    ne[0] >= region.bounds.ne[0] &&
    ne[1] >= region.bounds.ne[1]
  );
}

function toPercent(progress: NativeProgress): number {
  if (typeof progress.percentage === "number" && Number.isFinite(progress.percentage)) {
    return Math.max(0, Math.min(100, Math.round(progress.percentage)));
  }
  if (
    typeof progress.completedResourceCount === "number" &&
    typeof progress.requiredResourceCount === "number" &&
    progress.requiredResourceCount > 0
  ) {
    return Math.round((progress.completedResourceCount / progress.requiredResourceCount) * 100);
  }
  return 0;
}

async function pruneOldPacks(packs: ManagedPack[]): Promise<void> {
  const managed = packs
    .filter(isManagedPack)
    .sort((left, right) => (left.metadata?.createdAt ?? 0) - (right.metadata?.createdAt ?? 0));
  const removable = managed.slice(0, Math.max(0, managed.length - MAX_MANAGED_PACKS + 1));
  for (const pack of removable) {
    if (pack.name) await offlineManager.deletePack(pack.name);
  }
}

function reportProgress(
  packName: string,
  report: (progress: OfflineMapProgress) => void,
  progress: NativeProgress,
): void {
  const percentage = toPercent(progress);
  report({
    phase: percentage >= 100 ? "ready" : "downloading",
    progress: percentage,
    packName,
    message: percentage >= 100 ? "Offline map ready" : `Saving offline map: ${percentage}%`,
  });
}

/**
 * Starts or resumes one bounded satellite pack. The operation does not create
 * a MapView, so it cannot reveal a map or disturb the active native surface.
 */
export async function ensureOfflineMapRegion(
  region: OfflineMapRegion,
  report: (progress: OfflineMapProgress) => void,
): Promise<void> {
  const packs = (await offlineManager.getPacks()) as unknown as ManagedPack[];
  const existing = packs.find((pack) => containsRegion(pack, region));

  if (existing?.name) {
    const status = await existing.status();
    const percentage = Math.max(0, Math.min(100, Math.round(status.percentage ?? 0)));
    if (percentage >= 100) {
      report({ phase: "ready", progress: 100, packName: existing.name, message: "Offline map ready" });
      return;
    }
    report({ phase: "downloading", progress: percentage, packName: existing.name, message: `Saving offline map: ${percentage}%` });
    await offlineManager.subscribe(
      existing.name,
      (_pack: unknown, progress: NativeProgress) => reportProgress(existing.name!, report, progress),
      (_pack: unknown, error: { message?: string }) =>
        report({ phase: "failed", progress: 0, packName: existing.name, message: error.message || "Offline map download failed" }),
    );
    await existing.resume();
    return;
  }

  const packName = packNameFor(region);
  const collision = packs.find((pack) => pack.name === packName);
  if (collision?.name && containsRegion(collision, region)) {
    // A pack with the same deterministic ID can only be a previous attempt.
    // Attach progress listeners before resuming it rather than failing with
    // "already exists" after an interrupted app session.
    await offlineManager.subscribe(
      collision.name,
      (_pack: unknown, progress: NativeProgress) => reportProgress(collision.name!, report, progress),
      (_pack: unknown, error: { message?: string }) =>
        report({ phase: "failed", progress: 0, packName, message: error.message || "Offline map download failed" }),
    );
    await collision.resume();
    report({ phase: "downloading", progress: 0, packName, message: "Resuming offline map download" });
    return;
  }

  // A previous app version or an interrupted partial pack can share the
  // deterministic name without covering the requested bounds. Replace only
  // that exact managed pack; never touch a user's unrelated Mapbox pack.
  if (collision?.name && isManagedPack(collision)) {
    await offlineManager.deletePack(collision.name);
  }

  await pruneOldPacks(packs);
  const downloadBounds = expandedBounds(region);
  report({ phase: "downloading", progress: 0, packName, message: "Preparing offline map" });
  await offlineManager.createPack(
    {
      name: packName,
      styleURL: MAPBOX_STYLE_SATELLITE,
      bounds: [downloadBounds.ne, downloadBounds.sw],
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      metadata: {
        app: PACK_PREFIX,
        version: 1,
        styleURL: MAPBOX_STYLE_SATELLITE,
        bounds: downloadBounds,
        createdAt: Date.now(),
      },
    },
    (_pack: unknown, progress: NativeProgress) => reportProgress(packName, report, progress),
    (_pack: unknown, error: { message?: string }) =>
      report({ phase: "failed", progress: 0, packName, message: error.message || "Offline map download failed" }),
  );
}
