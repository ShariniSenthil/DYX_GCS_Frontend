/**
 * Bridge backend point events into the existing Mission Report status map.
 *
 * The active backend uses zero-based point_index values. The UI table is keyed
 * by the waypoint serial number (wp.sn). Accuracy is calculated from the target
 * GPS coordinate and the rover coordinate captured when the terminal point
 * event arrives.
 */

import type { PointMissionEvent } from "../types/px4/mission";
import type { Waypoint } from "../components/missionreport/types";
import type { WaypointUiStatus } from "../types/missionWaypointStatus";
import {
  toStatusEntry,
  type WaypointStatusEntry,
  type WaypointStatusKey,
} from "./pointEventAdapter";
import { calculateAccuracy } from "../utils/accuracyCalculation";

export type LegacyWpStatus = {
  reached?: boolean;
  marked?: boolean;
  status?: WaypointUiStatus;
  timestamp?: string;
  pile?: string | number;
  rowNo?: string | number;
  remark?: string;
  hrms?: number;
  vrms?: number;
  lat_achieved?: number;
  lon_achieved?: number;
  accuracy_level?: string;
  position_error_cm?: number;
};

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  loading: 1,
  reached: 2,
  passed: 2,
  spray_on: 3,
  spray_off: 3,
  marked: 3,
  completed: 4,
  skipped: 4,
  mission_end: 4,
  failed: 4,
  aborted: 4,
  stopped: 4,
};

const ADAPTER_TO_UI: Record<WaypointStatusKey, LegacyWpStatus["status"]> = {
  pending: "pending",
  active: "loading",
  arrived: "reached",
  marked: "marked",
  completed: "completed",
  skipped: "skipped",
  waiting: "reached",
  paused: "loading",
  failed: "failed",
  aborted: "aborted",
};

function isStatusDowngrade(existing?: string, incoming?: string): boolean {
  if (!existing || !incoming) return false;
  return (STATUS_PRIORITY[incoming] ?? 0) < (STATUS_PRIORITY[existing] ?? 0);
}

function finiteCoordinate(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function accuracyForEntry(
  entry: WaypointStatusEntry,
  targetWaypoint: Waypoint | undefined,
): Pick<LegacyWpStatus, "accuracy_level" | "position_error_cm"> {
  const terminalOrArrival = [
    "arrived",
    "marked",
    "completed",
  ].includes(entry.status);

  if (!terminalOrArrival || !targetWaypoint) return {};

  const targetLat = finiteCoordinate(targetWaypoint.lat);
  const targetLon = finiteCoordinate(targetWaypoint.lon);
  const achievedLat = finiteCoordinate(entry.lat);
  const achievedLon = finiteCoordinate(entry.lon);

  if (
    targetLat === null ||
    targetLon === null ||
    achievedLat === null ||
    achievedLon === null ||
    targetLat < -90 ||
    targetLat > 90 ||
    achievedLat < -90 ||
    achievedLat > 90 ||
    targetLon < -180 ||
    targetLon > 180 ||
    achievedLon < -180 ||
    achievedLon > 180
  ) {
    return {};
  }

  const { errorMm, accuracy } = calculateAccuracy(
    targetLat,
    targetLon,
    achievedLat,
    achievedLon,
  );

  return {
    accuracy_level: accuracy.level,
    position_error_cm: errorMm / 10,
  };
}

/** Zero-based backend point index → one-based waypoint serial number. */
export function pointIndexToSn(
  pointIndex: number,
  waypoints: Waypoint[],
): number {
  const waypoint = waypoints[pointIndex];
  return waypoint?.sn ?? pointIndex + 1;
}

/** Waypoint serial number → zero-based array index. */
export function snToArrayIndex(
  sn: number,
  waypoints: Waypoint[],
): number | null {
  const index = waypoints.findIndex((waypoint) => waypoint.sn === sn);
  return index >= 0 ? index : null;
}

export function adapterEntryToWpStatus(
  entry: WaypointStatusEntry,
  telemetry?: { hrms?: number; vrms?: number },
  targetWaypoint?: Waypoint,
): LegacyWpStatus {
  const uiStatus = ADAPTER_TO_UI[entry.status] ?? "pending";
  const accuracy = accuracyForEntry(entry, targetWaypoint);

  return {
    reached:
      uiStatus === "reached" ||
      uiStatus === "marked" ||
      uiStatus === "completed" ||
      uiStatus === "loading" ||
      entry.status === "arrived",
    marked: entry.status === "marked" || entry.status === "completed",
    status: uiStatus,
    timestamp: entry.timestamp,
    remark: entry.message ?? entry.reason,
    lat_achieved: entry.lat,
    lon_achieved: entry.lon,
    hrms: telemetry?.hrms,
    vrms: telemetry?.vrms,
    ...accuracy,
  };
}

export function pointEventToWpStatus(
  event: PointMissionEvent,
  waypoints: Waypoint[],
  telemetry?: { hrms?: number; vrms?: number },
): { sn: number; status: LegacyWpStatus } | null {
  const entry = toStatusEntry(event);
  if (!entry) return null;

  return {
    sn: pointIndexToSn(event.point_index, waypoints),
    status: adapterEntryToWpStatus(
      entry,
      telemetry,
      waypoints[event.point_index],
    ),
  };
}

/**
 * Rebuild the Mission Report status map from backend point-index entries.
 */
export function buildLegacyStatusMapFromPointMap(
  pointMap: Record<number, WaypointStatusEntry>,
  waypoints: Waypoint[],
  telemetry?: { hrms?: number; vrms?: number },
): Record<number, LegacyWpStatus> {
  const result: Record<number, LegacyWpStatus> = {};

  for (const [indexText, entry] of Object.entries(pointMap)) {
    const pointIndex = Number.parseInt(indexText, 10);
    if (!Number.isFinite(pointIndex)) continue;

    const serialNumber = pointIndexToSn(pointIndex, waypoints);
    result[serialNumber] = adapterEntryToWpStatus(
      entry,
      telemetry,
      waypoints[pointIndex],
    );
  }

  return result;
}

/** Merge backend-derived statuses without regressing a terminal point. */
export function mergeLegacyStatusMap(
  base: Record<number, LegacyWpStatus>,
  backend: Record<number, LegacyWpStatus>,
): Record<number, LegacyWpStatus> {
  const next = { ...base };

  for (const [serialText, incoming] of Object.entries(backend)) {
    const serialNumber = Number.parseInt(serialText, 10);
    const previous = next[serialNumber];

    if (
      previous?.status &&
      isStatusDowngrade(previous.status, incoming.status)
    ) {
      continue;
    }

    next[serialNumber] = { ...previous, ...incoming };
  }

  return next;
}
