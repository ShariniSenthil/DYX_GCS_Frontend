/**
 * Maps GET /api/rtk/status → partial telemetry envelope (RTK + LoRa link flag).
 */

import type { TelemetryEnvelope } from '../types/telemetry';
import type { RtkStatusResponse } from '../services/rtkService';

export function rtkStatusToEnvelope(status: RtkStatusResponse): TelemetryEnvelope {
  const source = (status.active_source ?? status.mode ?? '').toLowerCase();
  const loraActive =
    Boolean(status.running) &&
    (source.includes('lora') || Boolean(status.serial_open));
  const ntripActive =
    Boolean(status.running) &&
    (source.includes('ntrip') || source.includes('tcp'));

  const fixType =
    typeof status.gps_fix_type === 'number'
      ? status.gps_fix_type
      : typeof status.fix_type === 'number'
        ? status.fix_type
        : undefined;

  const envelope: TelemetryEnvelope & {
    rtk_stream_active?: boolean;
    rtk_source?: string;
  } = {
    timestamp: Date.now(),
    network: {
      lora_connected: loraActive || ntripActive,
    },
    rtk: {
      fix_type: fixType,
      baseline_age: status.last_valid_rtcm_age_s ?? status.last_frame_age_s ?? 0,
      base_linked: Boolean(status.running && (status.stream_healthy ?? status.healthy)),
    },
    rtk_stream_active: Boolean(status.running && (status.stream_healthy ?? status.healthy)),
    rtk_source: status.active_source ?? status.mode,
  };

  return envelope;
}