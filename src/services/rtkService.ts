/**
 * rtkService — 4WD_SERVER RTK/NTRIP/LoRa control.
 *
 * Fixes audit items:
 *   R3: ntrip_start → ntrip/start (slash-separated)
 *   R3: password → pass field rename
 *   R4: ntrip_stop → use /api/rtk/stop
 *   R5: lora_start → lora/start + required serial_port body
 *   R6: lora_stop → lora/stop
 *   R7: flat RTKStatusResponse mapping
 *   R8/R9: Remove socket LoRa path
 */

import { apiGet, apiPost } from './apiClient';
import { PX4_RTK } from '../config/px4Endpoints';

// ── Response types ────────────────────────────────────────────────────────────

/** Mirrors 4WD_SERVER/server/routes/rtk.py RTKStatusResponse. */
export interface RtkStatusResponse {
  mode: string;
  pid?: number | null;
  running: boolean;
  healthy: boolean;
  active_source?: string | null;
  desired_source?: string | null;
  source_state?: string;
  lifecycle_state?: string;
  serial_open?: boolean;
  stream_healthy?: boolean;
  last_error?: string | null;
  last_process_error?: string | null;
  transport_reason?: string | null;
  stop_reason?: string | null;
  gps_fix_type?: number | null;
  last_valid_rtcm_age_s?: number | null;
  last_frame_age_s?: number | null;
  bytes?: number;
  frames?: number;
  bytes_injected?: number;
  valid_frames?: number;
  reconnecting?: boolean;
  restart_count?: number;
  user_requested?: boolean | null;
  // Legacy / simplified aliases (older backends)
  active?: boolean;
  source?: 'ntrip' | 'lora' | null;
  host?: string;
  port?: number;
  mountpoint?: string;
  serial_port?: string;
  connected?: boolean;
  fix_type?: number;
  baseline_age?: number;
  bytes_received?: number;
  uptime_s?: number;
}

// ── NTRIP ─────────────────────────────────────────────────────────────────────

export interface NtripStartRequest {
  host: string;
  port: number;
  mountpoint: string;
  user?: string;
  /** Field name is `pass` on the PX4 backend (not `password`). */
  pass?: string;
}

/**
 * Start NTRIP RTK stream.
 * Note: field is `pass` not `password` — matches PX4 backend contract.
 */
export async function startNtripStream(
  request: NtripStartRequest,
): Promise<RtkStatusResponse> {
  return apiPost<RtkStatusResponse>(PX4_RTK.NTRIP_START, request);
}

// ── LoRa RTK ──────────────────────────────────────────────────────────────────

export interface LoraStartRequest {
  /** Serial port path on Jetson (e.g., '/dev/ttyUSB0'). Required. */
  serial_port: string;
  /** Baud rate. Optional — server uses default if omitted. */
  baudrate?: number;
}

/**
 * Start LoRa RTK stream.
 * Requires `serial_port` — backend will reject empty body.
 */
export async function startLoraStream(
  request: LoraStartRequest,
): Promise<RtkStatusResponse> {
  return apiPost<RtkStatusResponse>(PX4_RTK.LORA_START, request);
}

export async function stopLoraStream(): Promise<RtkStatusResponse> {
  return apiPost<RtkStatusResponse>(PX4_RTK.LORA_STOP);
}

// ── Stop all RTK ──────────────────────────────────────────────────────────────

/**
 * Stop all RTK streams (NTRIP + LoRa).
 * Used for both NTRIP stop and LoRa stop in PX4 backend.
 */
export async function stopAllRtk(): Promise<RtkStatusResponse> {
  return apiPost<RtkStatusResponse>(PX4_RTK.STOP);
}

// Alias for NTRIP stop
export const stopNtripStream = stopAllRtk;

// ── Status ────────────────────────────────────────────────────────────────────

/** Get current RTK status. */
export async function getRtkStatus(): Promise<RtkStatusResponse> {
  return apiGet<RtkStatusResponse>(PX4_RTK.STATUS);
}

export default {
  startNtripStream,
  startLoraStream,
  stopLoraStream,
  stopAllRtk,
  stopNtripStream,
  getRtkStatus,
};
