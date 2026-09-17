/**
 * VerifiedMissionContext — Lightweight state for the loaded 4-wheel mission.
 *
 * Owns:
 *   missionId    — server-assigned ID from the canonical mission upload
 *   missionName  — display name
 *   totalTargets — confirmed count from canonical mission status/history
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
 *   switches. On mount, canonical mission status/history re-confirms it.
 *
 *   Transient failures (network unavailable, timeout, auth-not-ready, temporary
 *   5xx) preserve the stored mission and surface reconfirmState='error'.
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
import { getMissionHistory, getMissionStatus } from '../services/missionApi';

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
        const status = await getMissionStatus();
        if (cancelled || !mountedRef.current) return;

        const active = status?.mission;
        if (active?.loaded === true && active.mission_id === savedId) {
          setMissionId(savedId);
          setMissionName(savedName ?? null);
          setTotalTargets(Number(active.total_points ?? 0));
          setIsLoaded(true);
          setReconfirmState('idle');
          return;
        }

        const history = await getMissionHistory();
        const archived = history.missions?.find((entry) => entry.mission_id === savedId);
        if (archived) {
          // The completed mission is still available for Restore by ID, but it
          // is not active until the operator restores it from Path Plan.
          setMissionId(savedId);
          setMissionName(archived.original_filename ?? savedName ?? null);
          setTotalTargets(Number(archived.total_points ?? 0));
          setIsLoaded(false);
          setReconfirmState('idle');
          return;
        }

        await PersistentStorage.clearVerifiedMissionState();
        setMissionId(null);
        setMissionName(null);
        setTotalTargets(null);
        setIsLoaded(false);
        setReconfirmState('idle');
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        // Transient failure (network / timeout / auth-not-ready / 5xx).
        // PRESERVE the stored mission; do NOT set isLoaded. Surface error.
        console.warn('[VerifiedMissionContext] Re-confirm failed; preserving stored mission:', err);
        setIsLoaded(false);
        setReconfirmState('error');
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
