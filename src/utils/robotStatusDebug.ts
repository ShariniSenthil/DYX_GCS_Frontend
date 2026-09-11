/**
 * Robot Status debug trace — socket receive vs UI render.
 * Enable with EXPO_PUBLIC_ROBOT_STATUS_DEBUG=true (on by default in __DEV__).
 */

import type { VehicleStatus } from '../components/missionreport/types';

export type RobotStatusDebugSource =
  | 'none'
  | 'socket_telemetry'
  | 'socket_mission_status'
  | 'rest_telemetry'
  | 'rest_poll'
  | 'rejected';

export interface RobotStatusDebugSnapshot {
  updatedAt: number;
  connectionState: string;
  socketConnected: boolean;
  telemetryEventCount: number;
  missionStatusEventCount: number;
  rejectedEventCount: number;
  lastSource: RobotStatusDebugSource;
  rejectReason: string | null;
  px4Detected: boolean;
  rawPayload: Record<string, unknown> | null;
  adapted: {
    battery_pct?: number;
    battery_v?: number;
    gps_fix?: number;
    gps_fix_name?: string;
    gps_sat?: number;
    hrms?: number;
    vrms?: number;
    mode?: string;
    armed?: boolean;
    fcu_connected?: boolean;
    rpp_state_name?: string;
    imu_status?: string;
    lat?: number;
    lon?: number;
  };
  uiStatus: Partial<VehicleStatus> | null;
  uiConnected: boolean;
  lastMessageTs: number | null;
}

const DEFAULT_SNAPSHOT: RobotStatusDebugSnapshot = {
  updatedAt: 0,
  connectionState: 'disconnected',
  socketConnected: false,
  telemetryEventCount: 0,
  missionStatusEventCount: 0,
  rejectedEventCount: 0,
  lastSource: 'none',
  rejectReason: null,
  px4Detected: false,
  rawPayload: null,
  adapted: {},
  uiStatus: null,
  uiConnected: false,
  lastMessageTs: null,
};

let snapshot: RobotStatusDebugSnapshot = { ...DEFAULT_SNAPSHOT };
const listeners = new Set<() => void>();

export function isRobotStatusDebugEnabled(): boolean {
  const env = process.env.EXPO_PUBLIC_ROBOT_STATUS_DEBUG;
  if (env?.toLowerCase() === 'false' || env === '0') return false;
  if (env?.toLowerCase() === 'true' || env === '1') return true;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Always-on connection diagnostics (Metro terminal) — not gated on telemetry events. */
export function telemetryDiagLog(_message: string, _extra?: Record<string, unknown>): void {
  // const env = process.env.EXPO_PUBLIC_TELEMETRY_DIAG;
  // if (env?.toLowerCase() === 'false' || env === '0') return;
  // const suffix = _extra ? ` ${JSON.stringify(_extra)}` : '';
  // console.log(`[GCS-Telemetry] ${_message}${suffix}`);
}

export function getRobotStatusDebug(): RobotStatusDebugSnapshot {
  return snapshot;
}

export function subscribeRobotStatusDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchRobotStatusDebug(
  patch: Partial<RobotStatusDebugSnapshot>,
): void {
  snapshot = {
    ...snapshot,
    ...patch,
    updatedAt: Date.now(),
    adapted: patch.adapted ? { ...snapshot.adapted, ...patch.adapted } : snapshot.adapted,
  };
  listeners.forEach((fn) => fn());
}

// function formatRobotStatusDebugLine(s: RobotStatusDebugSnapshot): string {
//   const raw = s.rawPayload;
//   const keys = raw ? Object.keys(raw).slice(0, 12).join(',') : '—';
//   return [
//     `src=${s.lastSource}`,
//     `sock=${s.socketConnected ? 'up' : 'down'}`,
//     `conn=${s.connectionState}`,
//     `px4=${s.px4Detected}`,
//     `tel#=${s.telemetryEventCount}`,
//     `rej#=${s.rejectedEventCount}`,
//     raw ? `raw{battery_pct:${raw.battery_pct},gps_fix:${raw.gps_fix},gps_sat:${raw.gps_sat},lat:${raw.lat},connected:${raw.connected}}` : 'raw=—',
//     `ui{battery:${s.uiStatus?.battery ?? '—'},gps:${s.uiStatus?.gps ?? '—'},sats:${s.uiStatus?.satellites ?? '—'}}`,
//     `keys=${keys}`,
//     s.rejectReason ? `reject=${s.rejectReason}` : '',
//   ]
//     .filter(Boolean)
//     .join(' | ');
// }

/** Pick robot-status-relevant fields from a socket/REST payload. */
export function pickRawRobotFields(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const pick = [
    'battery_pct', 'battery_v', 'gps_fix', 'gps_fix_name', 'gps_sat',
    'hrms', 'vrms', 'armed', 'mode', 'connected', 'lat', 'lon', 'alt',
    'rpp_state', 'rpp_state_name', 'rpp_debug_available',
    'rpp_actual_speed_mps', 'rpp_cross_track_error_mm', 'rpp_along_remaining_mm',
    'imu_status', 'pos_n', 'pos_e',
    'heading_ned_deg', 'speed_m_s',
  ];
  const out: Record<string, unknown> = {};
  for (const k of pick) {
    if (k in payload) out[k] = payload[k as keyof typeof payload];
  }
  return Object.keys(out).length > 0 ? out : null;
}