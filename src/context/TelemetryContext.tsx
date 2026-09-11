/**
 * TelemetryContext — 20Hz real-time rover telemetry (isolated)
 *
 * Live rover values are exposed only while Socket.IO reports a confirmed
 * rover connection. During connecting, disconnected or error states, the UI
 * receives a clean disconnected snapshot and no rover position.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useRoverTelemetry, {
  type RoverServices,
} from "../hooks/useRoverTelemetry";
import type {
  ConnectionState,
  GpsFailsafeMode,
  GpsFailsafeStatus,
  RoverTelemetry,
} from "../types/telemetry";
import type { Socket } from "socket.io-client";

/**
 * Safe empty snapshot exposed whenever the tablet is not currently connected
 * to the rover backend through Socket.IO.
 *
 * This prevents the UI from continuing to show the last battery, GPS, RTK,
 * position, mission and vehicle values after rover Wi-Fi is lost.
 */
const DISCONNECTED_TELEMETRY: RoverTelemetry = {
  state: {
    armed: false,
    mode: "UNKNOWN",
    system_status: "DISCONNECTED",
    heartbeat_ts: 0,
  },
  global: {
    lat: 0,
    lon: 0,
    alt_rel: 0,
    vel: 0,
    satellites_visible: 0,
  },
  battery: {
    voltage: 0,
    current: 0,
    percentage: 0,
  },
  rtk: {
    fix_type: 0,
    baseline_age: 0,
    base_linked: false,
  },
  mission: {
    total_wp: 0,
    current_wp: 0,
    status: "DISCONNECTED",
    progress_pct: 0,
  },
  servo: {
    servo_id: 0,
    active: false,
    last_command_ts: 0,
  },
  network: {
    connection_type: "none",
    wifi_signal_strength: 0,
    wifi_rssi: -100,
    interface: "",
    wifi_connected: false,
    lora_connected: false,
  },
  hrms: 0,
  vrms: 0,
  imu_status: "DISCONNECTED",
  lastMessageTs: null,
  wp_dist_cm: undefined,
  xtrack_cm: undefined,
  wp_brg: undefined,
  position_error_cm: undefined,
  distance_to_next_m: undefined,
  accuracy: {
    available: false,
    goal_number: null,

    cross_track_error_mm: null,
    cross_track_abs_mm: null,
    cross_track_side: null,

    front_back_error_mm: null,
    front_back_abs_mm: null,
    front_back_position: null,

    radial_error_mm: null,
    closest_radial_error_mm: null,

    accuracy_target_mm: null,
    test_tolerance_mm: null,

    accuracy_status: null,
    accuracy_pass: false,
    within_test_tolerance: false,
  },

  accuracy_available: false,

  cross_track_error_mm: null,
  cross_track_abs_mm: null,
  cross_track_side: null,

  front_back_error_mm: null,
  front_back_abs_mm: null,
  front_back_position: null,

  radial_error_mm: null,
  closest_radial_error_mm: null,

  accuracy_target_mm: null,
  test_tolerance_mm: null,

  accuracy_status: null,
  accuracy_pass: false,
  within_test_tolerance: false,

  rpp_debug_available: false,
  rpp_debug_fresh: false,
  rpp_control_mode: null,
  rpp_goal_number: null,
  rpp_actual_speed_mps: null,
  rpp_command_speed_mps: null,
  rpp_current_yaw_deg: null,
  rpp_path_bearing_deg: null,
  rpp_guidance_bearing_deg: null,
  rpp_heading_error_deg: null,
  rpp_distance_to_goal_m: null,
  rpp_cross_track_error_mm: null,
  rpp_cross_track_side: null,
  rpp_along_remaining_mm: null,
  rpp_along_position: null,
};

export interface TelemetryContextValue {
  telemetry: RoverTelemetry;
  roverPosition: { lat: number; lng: number; timestamp: number } | null;
  connectionState: ConnectionState;
  socketTransport: "websocket" | "polling" | null;
  reconnect: () => void;
  services: RoverServices;
  onMissionEvent: (callback: (event: any) => void) => () => void;
  socket: Socket | null;
  gpsFailsafeMode: GpsFailsafeMode;
  setGpsFailsafeMode: (mode: GpsFailsafeMode) => void;
  gpsFailsafeStatus: GpsFailsafeStatus | null;
  onFailsafeAcknowledge: () => void;
  onFailsafeResume: () => void;
  onFailsafeRestart: () => void;
  reportGpsSafetyAbort: (reason: string) => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

interface TelemetryProviderProps {
  children: ReactNode;
}

export function TelemetryProvider({
  children,
}: TelemetryProviderProps): React.ReactElement {
  const rover = useRoverTelemetry();
  const isRoverConnected = rover.connectionState === "connected";

  /**
   * Even if an older REST request finishes after disconnection, consumers do
   * not receive it until Socket.IO confirms that the rover is connected again.
   */
  const visibleTelemetry = useMemo<RoverTelemetry>(
    () => (isRoverConnected ? rover.telemetry : DISCONNECTED_TELEMETRY),
    [isRoverConnected, rover.telemetry],
  );

  const visibleRoverPosition = isRoverConnected ? rover.roverPosition : null;

  const [gpsFailsafeMode, setGpsFailsafeModeState] =
    useState<GpsFailsafeMode>("disable");
  const [gpsFailsafeStatus, setGpsFailsafeStatus] =
    useState<GpsFailsafeStatus | null>(null);

  useEffect(() => {
    if (!isRoverConnected) {
      setGpsFailsafeStatus(null);
      return;
    }

    if (visibleTelemetry.gps_failsafe) {
      setGpsFailsafeStatus(visibleTelemetry.gps_failsafe);
    }
  }, [isRoverConnected, visibleTelemetry.gps_failsafe]);

  const setGpsFailsafeMode = useCallback((mode: GpsFailsafeMode) => {
    setGpsFailsafeModeState(mode);
  }, []);

  const onFailsafeAcknowledge = useCallback(() => {
    // Reserved for backend integration.
  }, []);

  const onFailsafeResume = useCallback(() => {
    import("../services/missionLifecycleService").then(({ resumeMission }) => {
      resumeMission().catch(console.error);
    });
  }, []);

  const onFailsafeRestart = useCallback(() => {
    import("../services/missionLifecycleService").then(({ restartMission }) => {
      restartMission().catch(console.error);
    });
  }, []);

  const reportGpsSafetyAbort = useCallback((reason: string) => {
    setGpsFailsafeStatus({
      mode: gpsFailsafeMode,
      triggered: true,
      reason,
      servo_suppressed: true,
      requires_ack: true,
      action: "abort",
    });
  }, [gpsFailsafeMode]);

  const contextValue = useMemo<TelemetryContextValue>(
    () => ({
      telemetry: visibleTelemetry,
      roverPosition: visibleRoverPosition,
      connectionState: rover.connectionState,
      socketTransport: rover.socketTransport,
      reconnect: rover.reconnect,
      services: rover.services,
      onMissionEvent: rover.onMissionEvent,
      socket: rover.socket,
      gpsFailsafeMode,
      setGpsFailsafeMode,
      gpsFailsafeStatus,
      onFailsafeAcknowledge,
      onFailsafeResume,
      onFailsafeRestart,
      reportGpsSafetyAbort,
    }),
    [
      visibleTelemetry,
      visibleRoverPosition,
      rover.connectionState,
      rover.socketTransport,
      rover.reconnect,
      rover.services,
      rover.onMissionEvent,
      rover.socket,
      gpsFailsafeMode,
      setGpsFailsafeMode,
      gpsFailsafeStatus,
      onFailsafeAcknowledge,
      onFailsafeResume,
      onFailsafeRestart,
      reportGpsSafetyAbort,
    ],
  );

  return React.createElement(
    TelemetryContext.Provider,
    { value: contextValue },
    children,
  );
}

export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry must be used within a TelemetryProvider");
  }
  return ctx;
}

export default TelemetryContext;
