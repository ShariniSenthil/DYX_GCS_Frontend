/**
 * Maps GET /api/rtk/status to the telemetry fields used by the rover UI.
 *
 * Correction-stream health is independent from GNSS RTK FIXED.
 * LoRa is not part of the production RTK API.
 */

import type { TelemetryEnvelope } from "../types/telemetry";
import type { RtkStatus, RtkStatusResponse } from "../types/rtk";
import { unwrapRtkStatus } from "./rtkControlAdapter";

export function rtkStatusToEnvelope(
  status: RtkStatusResponse | RtkStatus | null | undefined,
): TelemetryEnvelope {
  const payload = unwrapRtkStatus(status);
  const correctionHealthy = Boolean(payload?.correction_stream?.healthy);
  const fixType = payload?.gnss_solution?.fix_type ?? 0;
  const correctionAge = payload?.correction_stream?.correction_age_sec ?? 0;

  const envelope: TelemetryEnvelope & {
    rtk_stream_active?: boolean;
    rtk_source?: string;
  } = {
    timestamp: Date.now(),
    network: {
      lora_connected: false,
    },
    rtk: {
      fix_type: fixType,
      baseline_age: correctionAge,
      base_linked: correctionHealthy,
    },
    rtk_stream_active: correctionHealthy,
    rtk_source: "ntrip",
  };

  return envelope;
}
