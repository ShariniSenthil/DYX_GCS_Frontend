/**
 * px4PointStatusBridge — Map PX4 point_mission_event journal → legacy WpStatus / statusMap.
 *
 * PX4 uses 0-based point_index; UI statusMap keys are wp.sn (1-based serial numbers).
 */

import type { PointMissionEvent } from '../types/px4/mission';
import type { Waypoint } from '../components/missionreport/types';
import type { WaypointUiStatus } from '../types/missionWaypointStatus';
import {
  toStatusEntry,
  type WaypointStatusEntry,
  type WaypointStatusKey,
} from './pointEventAdapter';

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
  // 4-wheel distinct terminal statuses
  failed: 4,
  aborted: 4,
  stopped: 4,
};

const ADAPTER_TO_UI: Record<WaypointStatusKey, LegacyWpStatus['status']> = {
  pending: 'pending',
  active: 'loading',
  arrived: 'reached',
  marked: 'marked',
  completed: 'completed',
  skipped: 'skipped',
  waiting: 'reached',
  paused: 'loading',
  failed: 'skipped',
  aborted: 'skipped',
};

function isStatusDowngrade(existing?: string, incoming?: string): boolean {
  if (!existing || !incoming) return false;
  return (STATUS_PRIORITY[incoming] ?? 0) < (STATUS_PRIORITY[existing] ?? 0);
}

/** 0-based PX4 point_index → 1-based wp.sn statusMap key. */
export function pointIndexToSn(pointIndex: number, waypoints: Waypoint[]): number {
  const wp = waypoints[pointIndex];
  return wp?.sn ?? pointIndex + 1;
}

/** wp.sn → 0-based array index for currentIndex. */
export function snToArrayIndex(sn: number, waypoints: Waypoint[]): number | null {
  const idx = waypoints.findIndex((wp) => wp.sn === sn);
  return idx >= 0 ? idx : null;
}

export function adapterEntryToWpStatus(
  entry: WaypointStatusEntry,
  telemetry?: { hrms?: number; vrms?: number },
): LegacyWpStatus {
  const uiStatus = ADAPTER_TO_UI[entry.status] ?? 'pending';
  return {
    reached:
      uiStatus === 'reached' ||
      uiStatus === 'marked' ||
      uiStatus === 'completed' ||
      uiStatus === 'loading' ||
      entry.status === 'arrived',
    marked: entry.status === 'marked' || entry.status === 'completed',
    status: uiStatus,
    timestamp: entry.timestamp,
    remark: entry.message ?? entry.reason,
    lat_achieved: entry.lat,
    lon_achieved: entry.lon,
    hrms: telemetry?.hrms,
    vrms: telemetry?.vrms,
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
    status: adapterEntryToWpStatus(entry, telemetry),
  };
}

/** Rebuild legacy statusMap (keyed by wp.sn) from hook point map (keyed by point_index). */
export function buildLegacyStatusMapFromPointMap(
  pointMap: Record<number, WaypointStatusEntry>,
  waypoints: Waypoint[],
  telemetry?: { hrms?: number; vrms?: number },
): Record<number, LegacyWpStatus> {
  const out: Record<number, LegacyWpStatus> = {};
  for (const [idxStr, entry] of Object.entries(pointMap)) {
    const pointIndex = parseInt(idxStr, 10);
    if (!Number.isFinite(pointIndex)) continue;
    const sn = pointIndexToSn(pointIndex, waypoints);
    out[sn] = adapterEntryToWpStatus(entry, telemetry);
  }
  return out;
}

/** Merge PX4-derived statuses into an existing map without downgrading terminal states. */
export function mergeLegacyStatusMap(
  base: Record<number, LegacyWpStatus>,
  px4: Record<number, LegacyWpStatus>,
): Record<number, LegacyWpStatus> {
  const next = { ...base };
  for (const [snStr, incoming] of Object.entries(px4)) {
    const sn = parseInt(snStr, 10);
    const prev = next[sn];
    if (prev?.status && isStatusDowngrade(prev.status, incoming.status)) continue;
    next[sn] = { ...prev, ...incoming };
  }
  return next;
}