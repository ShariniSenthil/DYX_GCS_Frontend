/**
 * TelemetryContext — 20Hz real-time rover telemetry (isolated)
 *
 * Split from RoverContext to prevent telemetry updates from causing
 * re-renders on mission/connection screens. Only components that render
 * live numbers (speed, battery, GPS, etc.) should subscribe here.
 *
 * Components needing BOTH telemetry + mission state should use the
 * split pattern:
 *   OuterComponent (reads useTelemetry(), passes primitives as props)
 *   → InnerComponent wrapped in React.memo (receives primitives only)
 *
 * NOTE: Cross-context socket event forwarding is handled by
 * SocketEventCoordinator, not this provider. TelemetryProvider
 * does NOT read from MissionContext.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import useRoverTelemetry, {
  UseRoverTelemetryResult,
  RoverServices,
} from '../hooks/useRoverTelemetry';
import { RoverTelemetry, ConnectionState, GpsFailsafeMode, GpsFailsafeStatus, GpsFailsafeEvent } from '../types/telemetry';
import type { Socket } from 'socket.io-client';


export interface TelemetryContextValue {
  telemetry: RoverTelemetry;
  roverPosition: { lat: number; lng: number; timestamp: number } | null;
  connectionState: ConnectionState;
  reconnect: () => void;
  services: RoverServices;
  onMissionEvent: (callback: (event: any) => void) => () => void;
  socket: Socket | null;
  // GPS failsafe — derived from telemetry, managed here
  gpsFailsafeMode: GpsFailsafeMode;
  setGpsFailsafeMode: (mode: GpsFailsafeMode) => void;
  gpsFailsafeStatus: GpsFailsafeStatus | null;
  onFailsafeAcknowledge: () => void;
  onFailsafeResume: () => void;
  onFailsafeRestart: () => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

interface TelemetryProviderProps {
  children: ReactNode;
}

export function TelemetryProvider({ children }: TelemetryProviderProps): React.ReactElement {
  const rover = useRoverTelemetry();

  const [gpsFailsafeMode, setGpsFailsafeModeState] = useState<GpsFailsafeMode>('disable');
  const [gpsFailsafeStatus, setGpsFailsafeStatus] = useState<GpsFailsafeStatus | null>(null);

  // Update GPS failsafe status from telemetry
  useEffect(() => {
    if (rover.telemetry.gps_failsafe) {
      setGpsFailsafeStatus(rover.telemetry.gps_failsafe);
    }
  }, [rover.telemetry.gps_failsafe]);

  const setGpsFailsafeMode = useCallback((mode: GpsFailsafeMode) => {
    setGpsFailsafeModeState(mode);
    // NRP_ROS LEGACY DISABLED — socket.emit('set_gps_failsafe_mode')
  }, []);

  const onFailsafeAcknowledge = useCallback(() => {
    // NRP_ROS LEGACY DISABLED — socket.emit('failsafe_acknowledge')
  }, []);

  const onFailsafeResume = useCallback(() => {
    // 4WD_SERVER — GPS safety abort recovery via REST
    import('../services/missionLifecycleService').then(({ resumeMission }) => {
      resumeMission().catch(console.error);
    });
  }, []);

  const onFailsafeRestart = useCallback(() => {
    // 4WD_SERVER — GPS safety abort recovery via REST
    import('../services/missionLifecycleService').then(({ restartMission }) => {
      restartMission().catch(console.error);
    });
  }, []);

  // Listen for GPS failsafe events (mission_status forwarding moved to SocketEventCoordinator)
  useEffect(() => {
    if (!rover.socket || rover.connectionState !== 'connected') {
      return;
    }

    const handleServoSuppressed = (event: GpsFailsafeEvent) => {
      // Event received — logged at verbose level if needed
    };

    const handleFailsafeModeChanged = (data: { mode: GpsFailsafeMode }) => {
      setGpsFailsafeModeState(data.mode);
    };

    // NRP_ROS LEGACY DISABLED — servo_suppressed / failsafe_mode_changed / request_gps_failsafe_mode
    // rover.socket.on('servo_suppressed', handleServoSuppressed);
    // rover.socket.on('failsafe_mode_changed', handleFailsafeModeChanged);
    // rover.socket.emit('request_gps_failsafe_mode');

    return () => {
      // rover.socket?.off('servo_suppressed', handleServoSuppressed);
      // rover.socket?.off('failsafe_mode_changed', handleFailsafeModeChanged);
    };
  }, [rover.socket, rover.connectionState]);

  const contextValue = React.useMemo<TelemetryContextValue>(() => ({
    telemetry: rover.telemetry,
    roverPosition: rover.roverPosition,
    connectionState: rover.connectionState,
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
  }), [
    rover.telemetry,
    rover.roverPosition,
    rover.connectionState,
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
  ]);

  return React.createElement(
    TelemetryContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Hook: useTelemetry
 *
 * Subscribe to 20Hz telemetry data. Components using this hook
 * will re-render on every telemetry tick (~20 times per second).
 * Only use this in components that render live numbers.
 */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return ctx;
}

export default TelemetryContext;