/**
 * Self-subscribing live panels for MissionReportScreen.
 *
 * Each panel reads only its own slice of live telemetry through
 * useLiveTelemetrySelector, so a cross-track or position change re-renders
 * that panel alone -- never the whole MissionReportScreen or WaypointsTable.
 *
 * Authority is unchanged: values are passed through exactly as the backend
 * forwarded them from /rpp/debug and /rpp/accuracy.
 */

import React, { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  shallowEqual,
  useLiveTelemetrySelector,
  type LiveTelemetrySnapshot,
} from "../../context/liveTelemetryStore";
import {
  resolveRppAccuracyDataState,
  resolveRppDebugDataState,
} from "../../utils/liveAccuracyState";
import {
  isRobotStatusDebugEnabled,
  patchRobotStatusDebug,
} from "../../utils/robotStatusDebug";
import { AccuracyMonitorCard } from "./AccuracyMonitorCard";
import { DistanceToTargetCard } from "./DistanceToTargetCard";
import { MissionMapNative } from "./MissionMapNative";
import { VehicleStatusCard } from "./VehicleStatusCard";
import type { VehicleStatus } from "./types";
import { isSocketTelemetryStalled } from "../../utils/socketPacketClock";

/**
 * True when no telemetry packet has arrived within the live-panel window.
 * Polled at 4 Hz inside the panel only, so it never re-renders the screen.
 */
export function useSocketPacketStall(pollMs = 250): boolean {
  const [stalled, setStalled] = useState(() => isSocketTelemetryStalled());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = isSocketTelemetryStalled();
      setStalled((previous) => (previous === next ? previous : next));
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);
  return stalled;
}

const ACTIVE_TELEMETRY_MISSION_STATES = new Set([
  "running",
  "paused",
  "waiting_for_next",
  "arming",
  "switching_offboard",
  "loading",
  "stopping",
]);

const ACTIVE_BACKEND_MISSION_STATES = new Set([
  "RUNNING",
  "PAUSED",
  "ARMING",
  "SWITCHING_OFFBOARD",
  "LOADING",
]);

export function isTelemetryMissionActive(status: unknown): boolean {
  return ACTIVE_TELEMETRY_MISSION_STATES.has(String(status ?? "").toLowerCase());
}

/** Live accuracy is meaningful while the backend mission is active. */
export function isAccuracyMissionActive(
  telemetryMissionStatus: unknown,
  backendMissionState: string,
): boolean {
  return (
    isTelemetryMissionActive(telemetryMissionStatus) ||
    ACTIVE_BACKEND_MISSION_STATES.has(backendMissionState)
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** DraggableCard injects drag props into its direct child; forward them. */
interface DragProps {
  dragGesture?: any;
  isDraggingActive?: boolean;
}

// ---------------------------------------------------------------- /rpp/debug

function selectRppDebug(s: LiveTelemetrySnapshot) {
  const t = s.telemetry;
  return {
    connectionState: s.connectionState,
    socketStale: t.stale === true,
    missionStatus: t.mission?.status,
    available: t.rpp_debug_available,
    fresh: t.rpp_debug_fresh,
    along: t.rpp_along_remaining_mm,
    alongPosition: t.rpp_along_position,
    cross: t.rpp_cross_track_error_mm,
    crossSide: t.rpp_cross_track_side,
    speed: t.rpp_actual_speed_mps,
    guidance: t.rpp_guidance_bearing_deg,
    headingError: t.rpp_heading_error_deg,
    distance: t.rpp_distance_to_goal_m,
  };
}

export const LiveAccuracyMonitorPanel: React.FC<
  DragProps & { backendMissionState: string; onClose?: () => void }
> = ({ backendMissionState, onClose, ...drag }) => {
  const rpp = useLiveTelemetrySelector(selectRppDebug, shallowEqual);
  const packetStalled = useSocketPacketStall();
  const missionActive = isAccuracyMissionActive(rpp.missionStatus, backendMissionState);
  const valuesPresent = [
    rpp.along,
    rpp.cross,
    rpp.speed,
    rpp.guidance,
    rpp.headingError,
    rpp.distance,
  ].some(finite);
  const dataState = resolveRppDebugDataState(
    {
      connectionState: rpp.connectionState,
      socketStale: rpp.socketStale || packetStalled,
      missionActive,
    },
    { available: rpp.available, fresh: rpp.fresh, valuesPresent },
  );
  return (
    <AccuracyMonitorCard
      {...drag}
      isMissionActive={missionActive}
      dataState={dataState}
      alongSideMm={rpp.along}
      alongSidePosition={rpp.alongPosition}
      crossTrackMm={rpp.cross}
      crossTrackSide={rpp.crossSide}
      actualSpeedMps={rpp.speed}
      targetHeadingDeg={rpp.guidance}
      headingErrorDeg={rpp.headingError}
      distanceToGoalM={rpp.distance}
      onClose={onClose}
    />
  );
};

// ------------------------------------------------------------- /rpp/accuracy

function selectRadial(s: LiveTelemetrySnapshot) {
  const t = s.telemetry;
  return {
    connectionState: s.connectionState,
    socketStale: t.stale === true,
    missionStatus: t.mission?.status,
    available: t.accuracy_available,
    fresh: t.rpp_accuracy_stream_fresh,
    radial: t.radial_error_mm,
    status: t.accuracy_status,
  };
}

export const LiveDistanceToTargetPanel: React.FC<
  DragProps & { backendMissionState: string }
> = ({ backendMissionState, ...drag }) => {
  const radial = useLiveTelemetrySelector(selectRadial, shallowEqual);
  const packetStalled = useSocketPacketStall();
  const missionActive = isAccuracyMissionActive(radial.missionStatus, backendMissionState);
  const measurementPresent = radial.available === true && finite(radial.radial);
  const dataState = resolveRppAccuracyDataState(
    {
      connectionState: radial.connectionState,
      socketStale: radial.socketStale || packetStalled,
      missionActive,
    },
    { available: radial.available, fresh: radial.fresh, measurementPresent },
  );
  const live = dataState === "live";
  return (
    <DistanceToTargetCard
      {...drag}
      isMissionActive={missionActive}
      dataState={dataState}
      accuracyAvailable={live}
      overallAccuracyMm={live ? radial.radial : null}
      accuracyStatus={radial.status}
    />
  );
};

// ------------------------------------------------------------ vehicle status

function fixTypeLabel(fixType: number): string {
  const labels: Record<number, string> = {
    0: "No GPS",
    1: "No Fix",
    2: "2D Fix",
    3: "3D Fix",
    4: "DGPS",
    5: "RTK Float",
    6: "RTK Fixed",
  };
  return labels[fixType] || "Unknown";
}

const selectTelemetry = (s: LiveTelemetrySnapshot) => s.telemetry;
const selectConnectionState = (s: LiveTelemetrySnapshot) => s.connectionState;

export const LiveVehicleStatusCard: React.FC<
  DragProps & {
    socketTransport?: "websocket" | "polling" | null;
    onClose?: () => void;
  }
> = ({ socketTransport, onClose, ...drag }) => {
  const telemetry = useLiveTelemetrySelector(selectTelemetry);
  const connectionState = useLiveTelemetrySelector(selectConnectionState);

  const status = useMemo((): VehicleStatus => {
    const hrmsValue =
      typeof telemetry.hrms === "string" ? parseFloat(telemetry.hrms) : telemetry.hrms;
    const vrmsValue =
      typeof telemetry.vrms === "string" ? parseFloat(telemetry.vrms) : telemetry.vrms;
    const rppLabel = telemetry.rpp_state_name?.trim();
    return {
      battery: `${telemetry.battery.percentage.toFixed(1)}% (${telemetry.battery.voltage.toFixed(2)}V)`,
      gps: telemetry.gps_fix_name?.trim() || fixTypeLabel(telemetry.rtk.fix_type),
      satellites: telemetry.global.satellites_visible,
      hrms: `${(hrmsValue || 0).toFixed(3)} m`,
      vrms: `${(vrmsValue || 0).toFixed(3)} m`,
      imu: rppLabel ? `RPP ${rppLabel}` : telemetry.imu_status,
      mode: telemetry.state?.mode || "UNKNOWN",
    };
  }, [
    telemetry.battery.percentage,
    telemetry.battery.voltage,
    telemetry.rtk.fix_type,
    telemetry.global.satellites_visible,
    telemetry.hrms,
    telemetry.vrms,
    telemetry.imu_status,
    telemetry.gps_fix_name,
    telemetry.rpp_state_name,
    telemetry.state?.mode,
  ]);

  const isConnected = connectionState === "connected" && telemetry.fcu_connected !== false;

  useEffect(() => {
    if (!isRobotStatusDebugEnabled()) return;
    patchRobotStatusDebug({
      uiStatus: status,
      uiConnected: isConnected,
      lastMessageTs: telemetry.lastMessageTs,
    });
  }, [status, isConnected, telemetry.lastMessageTs]);

  return (
    <VehicleStatusCard
      {...drag}
      status={status}
      telemetry={telemetry}
      isConnected={isConnected}
      socketTransport={socketTransport}
      onClose={onClose}
    />
  );
};

// ----------------------------------------------------------------------- map

function selectMapPose(s: LiveTelemetrySnapshot) {
  return {
    roverLat: s.roverPosition?.lat ?? 0,
    roverLon: s.roverPosition?.lng ?? 0,
    heading: s.telemetry.attitude?.yaw_deg ?? null,
    armed: s.telemetry.state?.armed ?? false,
    rtkFixType: s.telemetry.rtk?.fix_type ?? 0,
  };
}

type MissionMapProps = ComponentProps<typeof MissionMapNative>;

export const LiveMissionMap: React.FC<
  Omit<MissionMapProps, "roverLat" | "roverLon" | "heading" | "armed" | "rtkFixType">
> = (props) => {
  const pose = useLiveTelemetrySelector(selectMapPose, shallowEqual);
  return <MissionMapNative {...(props as MissionMapProps)} {...pose} />;
};
