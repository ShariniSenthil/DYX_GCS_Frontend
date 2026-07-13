/**
 * MissionContext — Low-frequency mission/waypoint state (user-triggered)
 *
 * Split from RoverContext so that mission-related screens (PathPlanScreen,
 * TabNavigator, AppHeader) don't re-render on 20Hz telemetry ticks.
 * Updates ONLY on user actions: waypoint import, mission start/stop, mode change.
 *
 * Composes from WaypointContext for waypoint state and adds
 * PathPlan modal state and TTS language.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { WaypointProvider, useWaypointContext } from './WaypointContext';
import { Waypoint } from '../components/missionreport/types';

export interface MissionContextValue {
  // Waypoint state (delegated to WaypointContext internally)
  missionWaypoints: Waypoint[];
  setMissionWaypoints: (waypoints: Waypoint[]) => void;
  clearMissionWaypoints: () => void;

  // Mission mode
  missionMode: string;
  setMissionMode: (mode: string) => void;

  // TTS language
  ttsLanguage: string;
  setTTSLanguage: (language: string) => void;

  // PathPlan modal state
  showUploadPreview: boolean;
  setShowUploadPreview: (visible: boolean) => void;
  showManualConnectionCanvas: boolean;
  setShowManualConnectionCanvas: (visible: boolean) => void;
}

const MissionContext = createContext<MissionContextValue | null>(null);

interface MissionProviderProps {
  children: ReactNode;
}

export function MissionProvider({ children }: MissionProviderProps): React.ReactElement {
  const waypointCtx = useWaypointContext();

  const contextValue = React.useMemo<MissionContextValue>(() => ({
    missionWaypoints: waypointCtx.missionWaypoints,
    setMissionWaypoints: waypointCtx.setMissionWaypoints,
    clearMissionWaypoints: waypointCtx.clearMissionWaypoints,
    missionMode: waypointCtx.missionMode,
    setMissionMode: waypointCtx.setMissionMode,
    ttsLanguage: waypointCtx.ttsLanguage,
    setTTSLanguage: waypointCtx.setTTSLanguage,
    showUploadPreview: waypointCtx.showUploadPreview,
    setShowUploadPreview: waypointCtx.setShowUploadPreview,
    showManualConnectionCanvas: waypointCtx.showManualConnectionCanvas,
    setShowManualConnectionCanvas: waypointCtx.setShowManualConnectionCanvas,
  }), [
    waypointCtx.missionWaypoints,
    waypointCtx.setMissionWaypoints,
    waypointCtx.clearMissionWaypoints,
    waypointCtx.missionMode,
    waypointCtx.setMissionMode,
    waypointCtx.ttsLanguage,
    waypointCtx.setTTSLanguage,
    waypointCtx.showUploadPreview,
    waypointCtx.setShowUploadPreview,
    waypointCtx.showManualConnectionCanvas,
    waypointCtx.setShowManualConnectionCanvas,
  ]);

  return React.createElement(
    MissionContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Hook: useMission
 *
 * Access mission/waypoint state without subscribing to telemetry updates.
 * Components using this hook will NOT re-render on 20Hz telemetry ticks.
 */
export function useMission(): MissionContextValue {
  const ctx = useContext(MissionContext);
  if (!ctx) {
    throw new Error('useMission must be used within a MissionProvider');
  }
  return ctx;
}

export default MissionContext;