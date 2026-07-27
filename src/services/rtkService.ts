/**
 * RTK service for the current rover backend.
 *
 * Current backend contract:
 *   GET  /api/rtk/config
 *   PUT  /api/rtk/config
 *   POST /api/rtk/reconnect
 *   GET  /api/rtk/status
 *
 * Selecting an NTRIP profile sends PUT /api/rtk/config once. The backend
 * persists the values and requests an immediate RTK bridge reconnect.
 *
 * This file also keeps a few legacy aliases and method signatures so the
 * existing Settings screen and RTK adapters continue to compile while the UI
 * is migrated to the new backend contract.
 */

import { apiGet, apiPost, apiPut } from './apiClient';
import { PX4_RTK } from '../config/px4Endpoints';

export interface ActiveRtkConfiguration {
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password_configured: boolean;
  caster_url: string;
}

export interface RtkConfigurationState {
  configured: boolean;
  active: ActiveRtkConfiguration | null;
  last_good_available: boolean;
  persistent: boolean;
  changes_only_on_explicit_update: boolean;
}

export interface GetRtkConfigurationResponse {
  success: boolean;
  configuration: RtkConfigurationState;
}

export interface UpdateRtkConfigurationRequest {
  caster_url?: string;
  host?: string;
  port?: number;
  mountpoint?: string;
  username?: string;
  password?: string;
}

export interface RtkReloadResult {
  accepted: boolean;
  message: string;
  requested_at: string;
}

export interface UpdateRtkConfigurationResponse {
  success: boolean;
  message: string;
  configuration: ActiveRtkConfiguration & {
    configured: boolean;
    active: boolean;
    persisted: boolean;
  };
  reload: RtkReloadResult;
}

export interface ReconnectRtkResponse {
  success: boolean;
  message: string;
  configuration: RtkConfigurationState;
  reload: RtkReloadResult;
}

/** Exact response returned by GET /api/rtk/status. */
export interface BackendRtkStatusResponse {
  healthy: boolean;
  status: string;
  correction_age_sec: number | null;
  correction_fresh: boolean;
  fix_type: number;
  fix_name: string;
  rtk_fixed: boolean;
  satellites_visible: number;
  hdop: number | null;
  vdop: number | null;
  gps_updated_at: string | null;
  rtk_updated_at: string | null;
}

/**
 * Normalized RTK status used by the current UI plus compatibility fields used
 * by older SettingsScreen and telemetry adapters.
 */
export interface RtkStatusResponse extends BackendRtkStatusResponse {
  mode: 'NTRIP';
  running: boolean;
  active_source: 'ntrip';
  desired_source: 'ntrip';
  lifecycle_state: string;
  source_state: string;
  stream_healthy: boolean;
  gps_fix_type: number;
  last_valid_rtcm_age_s: number | null;
  last_frame_age_s: number | null;
  last_error: string | null;
  last_process_error: string | null;

  // Compatibility aliases for legacy callers.
  active?: boolean;
  connected?: boolean;
  source?: 'ntrip' | 'lora' | string | null;
  bytes_received?: number;
  serial_open?: boolean;
}

export interface NtripStartRequest {
  host: string;
  port: number;
  mountpoint: string;
  user?: string;
  username?: string;
  pass?: string;
  password?: string;
}

export interface LoraStartRequest {
  serial_port: string;
  baudrate?: number;
}

export async function getRtkConfiguration(): Promise<GetRtkConfigurationResponse> {
  return apiGet<GetRtkConfigurationResponse>(PX4_RTK.CONFIG);
}

export async function updateRtkConfiguration(
  request: UpdateRtkConfigurationRequest,
): Promise<UpdateRtkConfigurationResponse> {
  return apiPut<UpdateRtkConfigurationResponse>(PX4_RTK.CONFIG, request);
}

export async function reconnectRtk(): Promise<ReconnectRtkResponse> {
  return apiPost<ReconnectRtkResponse>(PX4_RTK.RECONNECT);
}

export async function getRtkStatus(): Promise<RtkStatusResponse> {
  const raw = await apiGet<BackendRtkStatusResponse>(PX4_RTK.STATUS);
  const state = String(raw.status ?? 'UNAVAILABLE').trim().toUpperCase();

  const running = ![
    'UNAVAILABLE',
    'DISCONNECTED',
    'STOPPED',
    'OFF',
  ].includes(state);

  const streamHealthy = Boolean(raw.healthy && raw.correction_fresh);

  return {
    ...raw,
    mode: 'NTRIP',
    running,
    active_source: 'ntrip',
    desired_source: 'ntrip',
    lifecycle_state: state,
    source_state: state,
    stream_healthy: streamHealthy,
    gps_fix_type: raw.fix_type,
    last_valid_rtcm_age_s: raw.correction_age_sec,
    last_frame_age_s: raw.correction_age_sec,
    last_error:
      !raw.healthy &&
      !['STARTING', 'CONNECTING', 'RELOADING', 'RECONNECT_WAIT'].includes(state)
        ? state
        : null,
    last_process_error: null,

    // Legacy aliases.
    active: running,
    connected: streamHealthy,
    source: 'ntrip',
    bytes_received: 0,
    serial_open: false,
  };
}

/**
 * Compatibility wrapper for older callers.
 * It does not call a separate start endpoint. It saves the selected profile
 * through PUT /api/rtk/config; the backend reconnects automatically.
 */
export async function startNtripStream(
  request: NtripStartRequest,
): Promise<RtkStatusResponse> {
  const username = request.username ?? request.user ?? '';
  const password = request.password ?? request.pass ?? '';

  await updateRtkConfiguration({
    host: request.host,
    port: request.port,
    mountpoint: request.mountpoint,
    username,
    ...(password.trim() ? { password } : {}),
  });

  return getRtkStatus();
}

/**
 * The current backend deliberately has no RTK stop endpoint. The explicit
 * return type prevents old callers from becoming Promise<never> at compile
 * time, while runtime use still reports the unsupported operation clearly.
 */
export async function stopAllRtk(): Promise<RtkStatusResponse> {
  throw new Error(
    'RTK stop is not supported by the current backend. Change the saved profile or use RTK reconnect.',
  );
}

export async function stopNtripStream(): Promise<RtkStatusResponse> {
  return stopAllRtk();
}

export async function startLoraStream(
  _request?: LoraStartRequest,
): Promise<RtkStatusResponse> {
  throw new Error('LoRa RTK is not supported by the current backend.');
}

export async function stopLoraStream(): Promise<RtkStatusResponse> {
  throw new Error('LoRa RTK is not supported by the current backend.');
}

export default {
  getRtkConfiguration,
  updateRtkConfiguration,
  reconnectRtk,
  getRtkStatus,
  startNtripStream,
  stopAllRtk,
  stopNtripStream,
  startLoraStream,
  stopLoraStream,
};