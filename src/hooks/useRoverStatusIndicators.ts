/**
 * useRoverStatusIndicators — single normalized view of the five rover status icons.
 *
 * Centralizes state ownership so the icon components only render normalized values
 * and never call APIs or inspect raw backend objects. Reads exclusively from the
 * already-polling telemetry layer (useRover → useRoverTelemetry):
 *
 *   networkType / wifiConnected / wifiSignalBars  ← GET /api/network (px4NetworkAdapter)
 *   rtkState                                      ← GET /api/rtk/status (px4RtkUiStateAdapter)
 *   gcsConnected                                  ← Socket.IO lifecycle (connect/disconnect/connect_error)
 *   fcuConnected                                  ← telemetry.connected (hydrated via /api/telemetry/latest)
 *   batteryPct / batteryVoltage                   ← telemetry battery (hydrated via /api/telemetry/latest)
 *
 * Battery is null-safe: missing telemetry is reported as `null` rather than 0%,
 * because 0% could incorrectly indicate a fully depleted battery.
 */

import { useMemo } from 'react';
import { useRover } from '../context/RoverContext';
import type { RtkUiState } from '../adapters/px4RtkUiStateAdapter';

export interface RoverStatusIndicators {
  /** Active link transport: 'wifi' | 'ethernet' | 'none'. */
  networkType: 'wifi' | 'ethernet' | 'none';
  wifiConnected: boolean;
  /** Wi-Fi signal strength as 0–4 bars (derived from RSSI dBm). */
  wifiSignalBars: number;
  /** Discrete RTK UI state. */
  rtkState: RtkUiState;
  /** Frontend ↔ backend (GCS) socket link. */
  gcsConnected: boolean;
  /** Backend ↔ PX4/MAVROS (FCU) link. */
  fcuConnected: boolean;
  /** Battery percentage, or null when no telemetry is available. */
  batteryPct: number | null;
  /** Battery voltage, or null when no telemetry is available. */
  batteryVoltage: number | null;
}

/**
 * Derive the normalized rover status indicators from the telemetry layer.
 * Must be used within <RoverProvider>.
 */
export function useRoverStatusIndicators(): RoverStatusIndicators {
  const { telemetry, connectionState } = useRover();

  return useMemo<RoverStatusIndicators>(() => {
    const ct = telemetry.network.connection_type;
    const networkType: RoverStatusIndicators['networkType'] =
      ct === 'wifi' ? 'wifi' : ct === 'ethernet' ? 'ethernet' : 'none';

    // Treat an all-zero battery (no voltage AND no percentage) as "no data"
    // rather than a depleted battery. A real low battery still reports voltage.
    const hasBatteryData = telemetry.battery.voltage > 0 || telemetry.battery.percentage > 0;

    return {
      networkType,
      wifiConnected: telemetry.network.wifi_connected,
      wifiSignalBars: telemetry.network.wifi_signal_strength,
      rtkState: telemetry.rtk_ui_state ?? 'off',
      gcsConnected: connectionState === 'connected',
      fcuConnected: telemetry.fcu_connected ?? false,
      batteryPct: hasBatteryData ? telemetry.battery.percentage : null,
      batteryVoltage: hasBatteryData ? telemetry.battery.voltage : null,
    };
  }, [
    telemetry.network,
    telemetry.battery,
    telemetry.rtk_ui_state,
    telemetry.fcu_connected,
    connectionState,
  ]);
}
