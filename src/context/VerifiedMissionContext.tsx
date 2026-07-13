/**
 * VerifiedMissionContext — Lightweight state for the loaded 4-wheel mission.
 *
 * Owns:
 *   missionId    — server-assigned ID from uploadVerifiedMission
 *   missionName  — display name
 *   totalTargets — confirmed count from getVerifiedMission
 *   isLoaded     — true only after BOTH upload AND backend confirmation succeed
 *   reconfirmState — 'idle' | 'reconfirming' | 'error' (hydration status)
 *
 * Does NOT own:
 *   waypoints       (WaypointContext)
 *   telemetry       (TelemetryContext / RoverContext)
 *   mission_status  (socket, via useRoverTelemetry)
 *   progress events (useVerifiedMissionProgress)
 *
 * Persistence / hydration:
 *   missionId is written to AsyncStorage so it survives cold restarts and tab
 *   switches. On mount, getVerifiedMission(id) re-confirms the mission still
 *   exists on the server.
 *
 *   The persisted id is cleared ONLY on a confirmed backend 404 (NotFoundError).
 *   Transient failures (network unavailable, timeout, auth-not-ready, temporary
 *   5xx) PRESERVE the stored mission and surface reconfirmState='error' so the
 *   operator can retry — they never silently drop a valid mission. isLoaded is
 *   never set true until a GET confirmation actually succeeds.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import PersistentStorage from '../services/PersistentStorage';
import { getVerifiedMission } from '../services/verifiedMissionService';
import { NotFoundError } from '../services/apiError';

// ── Context shape ─────────────────────────────────────────────────────────────

export type VerifiedReconfirmState = 'idle' | 'reconfirming' | 'error';

export interface VerifiedMissionContextValue {
  missionId: string | null;
  missionName: string | null;
  totalTargets: number | null;
  /** True only after upload AND backend confirmation both succeed. */
  isLoaded: boolean;
  /** Hydration/re-confirmation status for a persisted mission. */
  reconfirmState: VerifiedReconfirmState;
  /** Call after both uploadVerifiedMission() and getVerifiedMission() succeed. */
  setLoadedMission: (
    missionId: string,
    missionName: string,
    totalTargets: number,
  ) => void;
  /** Call on clear / new upload / confirmed 404. */
  clearLoadedMission: () => void;
  /** Retry re-confirmation of a persisted mission after a transient failure. */
  retryReconfirm: () => void;
}

const VerifiedMissionContext = createContext<VerifiedMissionContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface VerifiedMissionProviderProps {
  children: ReactNode;
}

export function VerifiedMissionProvider({
  children,
}: VerifiedMissionProviderProps): React.ReactElement {
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missionName, setMissionName] = useState<string | null>(null);
  const [totalTargets, setTotalTargets] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [reconfirmState, setReconfirmState] =
    useState<VerifiedReconfirmState>('idle');

  // Guard against state updates after unmount.
  const mountedRef = useRef(true);
  // Bump to trigger a re-confirmation attempt.
  const [reconfirmNonce, setReconfirmNonce] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // On mount (and on retry): read persisted mission_id and re-confirm.
  useEffect(() => {
    let cancelled = false;

    const reconfirm = async () => {
      const savedId = await PersistentStorage.loadVerifiedMissionId();
      const savedName = await PersistentStorage.loadVerifiedMissionName();
      if (!savedId || cancelled || !mountedRef.current) return;

      if (!cancelled && mountedRef.current) setReconfirmState('reconfirming');

      try {
        const confirmed = await getVerifiedMission(savedId);
        if (cancelled || !mountedRef.current) return;

        setMissionId(confirmed.mission_id);
        setMissionName(confirmed.mission_name ?? savedName ?? null);
        setTotalTargets(confirmed.total_targets);
        setIsLoaded(true);
        setReconfirmState('idle');
        console.log('[VerifiedMissionContext] Re-confirmed mission:', confirmed.mission_id);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;

        if (err instanceof NotFoundError) {
          // Confirmed gone on the server — clear the stale id.
          console.log('[VerifiedMissionContext] Mission 404 — clearing stale mission:', savedId);
          await PersistentStorage.clearVerifiedMissionState();
          if (cancelled || !mountedRef.current) return;
          setMissionId(null);
          setMissionName(null);
          setTotalTargets(null);
          setIsLoaded(false);
          setReconfirmState('idle');
        } else {
          // Transient failure (network / timeout / auth-not-ready / 5xx).
          // PRESERVE the stored mission; do NOT set isLoaded. Surface error.
          console.warn(
            '[VerifiedMissionContext] Re-confirm failed (transient); preserving stored mission:',
            err,
          );
          setIsLoaded(false);
          setReconfirmState('error');
        }
      }
    };

    reconfirm();
    return () => { cancelled = true; };
  }, [reconfirmNonce]);

  const retryReconfirm = useCallback(() => {
    setReconfirmNonce(n => n + 1);
  }, []);

  const setLoadedMission = useCallback(
    (id: string, name: string, total: number) => {
      setMissionId(id);
      setMissionName(name);
      setTotalTargets(total);
      setIsLoaded(true);
      setReconfirmState('idle');
      // Persist so it survives cold restarts.
      PersistentStorage.saveVerifiedMissionId(id);
      PersistentStorage.saveVerifiedMissionName(name);
    },
    [],
  );

  const clearLoadedMission = useCallback(() => {
    setMissionId(null);
    setMissionName(null);
    setTotalTargets(null);
    setIsLoaded(false);
    setReconfirmState('idle');
    PersistentStorage.clearVerifiedMissionState();
  }, []);

  return (
    <VerifiedMissionContext.Provider
      value={{
        missionId,
        missionName,
        totalTargets,
        isLoaded,
        reconfirmState,
        setLoadedMission,
        clearLoadedMission,
        retryReconfirm,
      }}
    >
      {children}
    </VerifiedMissionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVerifiedMissionContext(): VerifiedMissionContextValue {
  const ctx = useContext(VerifiedMissionContext);
  if (!ctx) {
    throw new Error(
      'useVerifiedMissionContext must be used inside VerifiedMissionProvider',
    );
  }
  return ctx;
}
