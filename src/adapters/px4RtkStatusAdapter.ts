/**
 * Maps GET /api/rtk/status to the telemetry fields used by the rover UI.
 * The current backend provides NTRIP corrections only; LoRa is not part of
 * this contract.
 */

import type { TelemetryEnvelope } from '../types/telemetry';
import type { RtkStatusResponse } from '../services/rtkService';

export function rtkStatusToEnvelope(status: RtkStatusResponse): TelemetryEnvelope {
  const correctionActive = Boolean(status.healthy && status.correction_fresh);

  const envelope: TelemetryEnvelope & {
    rtk_stream_active?: boolean;
    rtk_source?: string;
  } = {
    timestamp: Date.now(),
    network: {
      // Do not report the NTRIP internet stream as a LoRa connection.
      lora_connected: false,
    },
    rtk: {
      fix_type: status.fix_type,
      baseline_age: status.correction_age_sec ?? 0,
      base_linked: correctionActive,
    },
    rtk_stream_active: correctionActive,
    rtk_source: 'ntrip',
  };

  return envelope;
}
