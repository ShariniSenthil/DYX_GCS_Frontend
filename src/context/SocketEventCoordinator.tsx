/**
 * SocketEventCoordinator — Bridges socket events between contexts.
 *
 * Decouples TelemetryContext from MissionContext by moving socket
 * event listeners out of TelemetryProvider into this coordinator.
 *
 * 4WD_SERVER additions (when ROVER_ENABLED):
 *   - mission_completed / mission_completion_degraded (continuous/dash)
 *   - point_mission_event is owned by usePointMissionEvents
 *   - gps_safety_abort (replaces legacy failsafe emits)
 *   - mission_status → MissionStagingContext state sync
 *   - auth_revoked handled by AuthContext (not here)
 *
 * Provider tree:
 *   <WaypointProvider>
 *     <MissionProvider>
 *       <TelemetryProvider>
 *         <ConnectionProvider>
 *           <SocketEventCoordinator>  ← this component
 *             {children}
 *           </SocketEventCoordinator>
 *         </ConnectionProvider>
 *       </TelemetryProvider>
 *     </MissionProvider>
 *   </WaypointProvider>
 */

import React, { useEffect, useCallback } from 'react';
import { useTelemetry } from './TelemetryContext';
import { useMission } from './MissionContext';
import { useTelemetry } from './TelemetryContext';
import { ROVER_ENABLED } from '../config/featureFlags';
import type { GpsSafetyAbortEvent } from '../types/px4/mission';

/**
 * SocketEventCoordinator
 *
 * Subscribes to socket events from TelemetryContext and forwards them
 * to the appropriate context or callback handlers.
 */
export function SocketEventCoordinator({ children }: { children: React.ReactNode }): React.ReactElement {
  const { socket, connectionState } = useTelemetry();
  const { setMissionMode } = useMission();
  const { reportGpsSafetyAbort } = useTelemetry();

  // ── Legacy: Forward mission mode updates → MissionContext ─────────────────
  useEffect(() => {
    if (!socket || connectionState !== 'connected') return;
    if (ROVER_ENABLED) return; // PX4 mode: spray mode comes from API, not socket

    const handleMissionModeUpdate = (event: any) => {
      if (event.mission_mode) {
        const backendMode = String(event.mission_mode).trim();
        setMissionMode(backendMode);
      }
    };

    socket.on('mission_status', handleMissionModeUpdate);
    return () => { socket?.off('mission_status', handleMissionModeUpdate); };
  }, [socket, connectionState, setMissionMode]);

  // ── PX4: Register new socket event listeners ──────────────────────────────
  useEffect(() => {
    if (!socket || connectionState !== 'connected' || !ROVER_ENABLED) return;

    // GPS safety abort (replaces legacy failsafe socket events)
    const handleGpsSafetyAbort = (event: unknown) => {
      if (!isValidGpsSafetyAbort(event)) {
        console.warn('[SocketEventCoordinator] gps_safety_abort: unexpected payload shape', event);
        return;
      }
      console.warn('[SocketEventCoordinator] gps_safety_abort:', event.reason, 'manual_resume_required:', event.manual_resume_required);
      reportGpsSafetyAbort(
        event.reason || 'GPS safety abort — resume from the rover is required',
      );
    };

    // Mission completed events (continuous/dash)
    const handleMissionCompleted = (event: unknown) => {
      console.log('[SocketEventCoordinator] mission_completed', event);
    };

    const handleMissionCompletionDegraded = (event: unknown) => {
      console.warn('[SocketEventCoordinator] mission_completion_degraded', event);
    };

    // Safety abort (general)
    const handleSafetyAbort = (event: unknown) => {
      console.warn('[SocketEventCoordinator] safety_abort', event);
    };

    socket.on('gps_safety_abort', handleGpsSafetyAbort);
    socket.on('mission_completed', handleMissionCompleted);
    socket.on('mission_completion_degraded', handleMissionCompletionDegraded);
    socket.on('safety_abort', handleSafetyAbort);

    return () => {
      socket?.off('gps_safety_abort', handleGpsSafetyAbort);
      socket?.off('mission_completed', handleMissionCompleted);
      socket?.off('mission_completion_degraded', handleMissionCompletionDegraded);
      socket?.off('safety_abort', handleSafetyAbort);
    };
  }, [socket, connectionState, reportGpsSafetyAbort]);

  // This component only coordinates side-effects — just pass through children
  return React.createElement(React.Fragment, null, children);
}

export default SocketEventCoordinator;
