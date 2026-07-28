/**
 * Production RTK/NTRIP API client.
 *
 * Contract:
 *   GET  /api/rtk/config
 *   PUT  /api/rtk/config
 *   POST /api/rtk/reconnect
 *   GET  /api/rtk/status
 *
 * A successful PUT means "configuration persisted and reload accepted".
 * It does not mean the caster authenticated or RTCM is flowing. Only
 * healthy=true + correction_fresh=true is treated as an active RTK stream.
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

export interface BackendRtkStatusResponse {
  healthy: boolean;
  connected?: boolean;
  configured?: boolean;
  persistent?: boolean;
  status: string;
  correction_age_sec: number | null;
  correction_fresh: boolean;
  fix_type: number;
  fix_name: string;
  rtk_fixed: boolean;
  satellites_visible: number;
  hdop: number | null;
  vdop: number | null;
  total_bytes?: number;
  total_chunks?: number;
  last_error?: string | null;
  last_error_code?: string | null;
  retry_in_sec?: number | null;
  mavros_subscribers?: number;
  caster_host?: string | null;
  caster_port?: number | null;
  mountpoint?: string | null;
  password_configured?: boolean;
  gps_updated_at: string | null;
  rtk_updated_at: string | null;
}

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

export type RtkConnectionOutcome =
  | { kind: 'healthy'; status: RtkStatusResponse }
  | { kind: 'failed'; status: RtkStatusResponse }
  | { kind: 'pending'; status: RtkStatusResponse };

const TERMINAL_FAILURE_STATES = new Set([
  'AUTH_FAILED',
  'CONFIG_REQUIRED',
  'DNS_FAILED',
  'NETWORK_TIMEOUT',
  'NETWORK_ERROR',
  'CASTER_UNREACHABLE',
  'CASTER_REJECTED',
  'STREAM_STALE',
  'ERROR',
  'UNAVAILABLE',
]);

export function isRtkStreamHealthy(status: RtkStatusResponse | null | undefined): boolean {
  return Boolean(status?.healthy && status?.correction_fresh);
}

export function isRtkTerminalFailure(status: RtkStatusResponse): boolean {
  return TERMINAL_FAILURE_STATES.has(
    String(status.status || '').trim().toUpperCase(),
  );
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
  const streamHealthy = Boolean(raw.healthy && raw.correction_fresh);

  return {
    ...raw,
    status: state,
    mode: 'NTRIP',
    running: streamHealthy,
    active_source: 'ntrip',
    desired_source: 'ntrip',
    lifecycle_state: state,
    source_state: state,
    stream_healthy: streamHealthy,
    gps_fix_type: raw.fix_type,
    last_valid_rtcm_age_s: raw.correction_age_sec,
    last_frame_age_s: raw.correction_age_sec,
    last_error:
      raw.last_error ??
      (TERMINAL_FAILURE_STATES.has(state) ? state : null),
    last_process_error: null,
    active: streamHealthy,
    connected: streamHealthy,
    source: 'ntrip',
    bytes_received: raw.total_bytes ?? 0,
    serial_open: false,
  };
}

export async function waitForRtkOutcome(
  timeoutMs = 20_000,
  pollIntervalMs = 750,
): Promise<RtkConnectionOutcome> {
  const deadline = Date.now() + timeoutMs;
  let latest = await getRtkStatus();

  while (Date.now() < deadline) {
    if (isRtkStreamHealthy(latest)) {
      return { kind: 'healthy', status: latest };
    }

    if (isRtkTerminalFailure(latest)) {
      return { kind: 'failed', status: latest };
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
    latest = await getRtkStatus();
  }

  return { kind: 'pending', status: latest };
}

export async function applyNtripConfiguration(
  request: UpdateRtkConfigurationRequest,
): Promise<{
  update: UpdateRtkConfigurationResponse;
  outcome: RtkConnectionOutcome;
}> {
  const update = await updateRtkConfiguration(request);
  const outcome = await waitForRtkOutcome();
  return { update, outcome };
}

export async function startNtripStream(
  request: NtripStartRequest,
): Promise<RtkStatusResponse> {
  const username = request.username ?? request.user ?? '';
  const password = request.password ?? request.pass ?? '';

  const { outcome } = await applyNtripConfiguration({
    host: request.host.trim(),
    port: request.port,
    mountpoint: request.mountpoint.trim().replace(/^\/+/, ''),
    username: username.trim(),
    ...(password.trim() ? { password } : {}),
  });

  return outcome.status;
}

export async function stopAllRtk(): Promise<RtkStatusResponse> {
  throw new Error(
    'RTK stop is not supported. The persistent bridge reconnects automatically.',
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
  waitForRtkOutcome,
  applyNtripConfiguration,
  startNtripStream,
  stopAllRtk,
  stopNtripStream,
  startLoraStream,
  stopLoraStream,
};
