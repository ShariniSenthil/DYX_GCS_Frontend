/**
 * Provider tree: TelemetryProvider > MissionProvider > ConnectionProvider > SocketEventCoordinator > {children}
 * TelemetryProvider is outermost so Mission/Connection consumers skip 7Hz telemetry re-renders
 * via their own memoized context values. SocketEventCoordinator reads both Telemetry and Mission.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { RoverServices } from '../hooks/useRoverTelemetry';
import { RoverTelemetry, GpsFailsafeMode, GpsFailsafeStatus } from '../types/telemetry';
import { Waypoint } from '../components/missionreport/types';
import { TelemetryProvider, useTelemetry } from './TelemetryContext';
import { MissionProvider, useMission } from './MissionContext';
import { ConnectionProvider, useConnection } from './ConnectionContext';
import { SocketEventCoordinator } from './SocketEventCoordinator';

export interface RoverContextValue {
  telemetry: RoverTelemetry;
  roverPosition: { lat: number; lng: number; timestamp: number } | null;
  connectionState: string;
  reconnect: () => void;
  services: RoverServices;
  onMissionEvent: (callback: (event: any) => void) => () => void;
  socket: any;
  missionWaypoints: Waypoint[];
  setMissionWaypoints: (waypoints: Waypoint[]) => void;
  clearMissionWaypoints: () => void;
  missionMode: string;
  setMissionMode: (mode: string) => void;
  ttsLanguage: string;
  setTTSLanguage: (language: string) => void;
  gpsFailsafeMode: GpsFailsafeMode;
  setGpsFailsafeMode: (mode: GpsFailsafeMode) => void;
  gpsFailsafeStatus: GpsFailsafeStatus | null;
  onFailsafeAcknowledge: () => void;
  onFailsafeResume: () => void;
  onFailsafeRestart: () => void;
  showUploadPreview: boolean;
  setShowUploadPreview: (visible: boolean) => void;
  showManualConnectionCanvas: boolean;
  setShowManualConnectionCanvas: (visible: boolean) => void;
}

const RoverContext = createContext<RoverContextValue | null>(null);

interface RoverProviderProps {
  children: ReactNode;
}

/**
 * RoverProvider — composes split providers and provides backward-compat RoverContext.
 *
 * Provider tree:
 *   TelemetryProvider (owns useRoverTelemetry, 20Hz data)
 *     MissionProvider (waypoint/mission state, user-triggered updates only)
 *       ConnectionProvider (stable connection/socket/services, memoized)
 *         SocketEventCoordinator (bridges socket events between contexts)
 *           RoverContextBridge (reads split hooks → provides RoverContext for legacy useRover())
 *             {children}
 */
export function RoverProvider({ children }: RoverProviderProps): React.ReactElement {
  return React.createElement(
    TelemetryProvider,
    null,
    React.createElement(
      MissionProvider,
      null,
      React.createElement(
        ConnectionProvider,
        null,
        React.createElement(
          SocketEventCoordinator,
          null,
          React.createElement(RoverContextBridge, null, children)
        )
      )
    )
  );
}

/**
 * Inner bridge — reads from split hooks and assembles backward-compat RoverContext.
 * This allows legacy useRover() consumers to work unchanged while new code
 * can use useTelemetry()/useMission()/useConnection() directly.
 */
function RoverContextBridge({ children }: { children: ReactNode }): React.ReactElement {
  const tel = useTelemetry();
  const mis = useMission();

  const contextValue = React.useMemo<RoverContextValue>(() => ({
    // Telemetry fields
    telemetry: tel.telemetry,
    roverPosition: tel.roverPosition,
    connectionState: tel.connectionState,
    reconnect: tel.reconnect,
    services: tel.services,
    onMissionEvent: tel.onMissionEvent,
    socket: tel.socket,
    // GPS Failsafe (from TelemetryContext)
    gpsFailsafeMode: tel.gpsFailsafeMode,
    setGpsFailsafeMode: tel.setGpsFailsafeMode,
    gpsFailsafeStatus: tel.gpsFailsafeStatus,
    onFailsafeAcknowledge: tel.onFailsafeAcknowledge,
    onFailsafeResume: tel.onFailsafeResume,
    onFailsafeRestart: tel.onFailsafeRestart,
    // Mission fields (from MissionContext)
    missionWaypoints: mis.missionWaypoints,
    setMissionWaypoints: mis.setMissionWaypoints,
    clearMissionWaypoints: mis.clearMissionWaypoints,
    missionMode: mis.missionMode,
    setMissionMode: mis.setMissionMode,
    ttsLanguage: mis.ttsLanguage,
    setTTSLanguage: mis.setTTSLanguage,
    showUploadPreview: mis.showUploadPreview,
    setShowUploadPreview: mis.setShowUploadPreview,
    showManualConnectionCanvas: mis.showManualConnectionCanvas,
    setShowManualConnectionCanvas: mis.setShowManualConnectionCanvas,
  }), [
    tel.telemetry,
    tel.roverPosition,
    tel.connectionState,
    tel.reconnect,
    tel.services,
    tel.onMissionEvent,
    tel.socket,
    tel.gpsFailsafeMode,
    tel.setGpsFailsafeMode,
    tel.gpsFailsafeStatus,
    tel.onFailsafeAcknowledge,
    tel.onFailsafeResume,
    tel.onFailsafeRestart,
    mis.missionWaypoints,
    mis.setMissionWaypoints,
    mis.clearMissionWaypoints,
    mis.missionMode,
    mis.setMissionMode,
    mis.ttsLanguage,
    mis.setTTSLanguage,
    mis.showUploadPreview,
    mis.setShowUploadPreview,
    mis.showManualConnectionCanvas,
    mis.setShowManualConnectionCanvas,
  ]);

  return React.createElement(
    RoverContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Hook: useRover — backward-compatible access to all rover state.
 * New code should prefer useTelemetry(), useMission(), or useConnection().
 * Must be used within <RoverProvider>
 */
let warnedUseRover = false;

export function useRover(): RoverContextValue {
  const ctx = useContext(RoverContext);
  if (!ctx) {
    throw new Error('useRover must be used within a RoverProvider');
  }
  if (__DEV__ && !warnedUseRover) {
    warnedUseRover = true;
    console.warn(
      '[useRover] Legacy compatibility hook: this re-renders at the telemetry rate. Prefer useTelemetry(), useMission(), or useConnection().',
    );
  }
  return ctx;
}

// Re-export types
export type { RoverTelemetry, RoverServices };

export default RoverContext;