/**
 * MissionStagingContext — Server-side path staging state.
 *
 * Owns:
 * - `pathName` + `missionId` (server artifact identifiers)
 * - `stagedSummary` (geometry metadata)
 * - `loadedPath` (confirmed loaded path from GET /api/mission/loaded-path)
 * - `missionState` (from GET /api/mission/status + socket mission_status)
 * - `expectedGeneration` (for point skip/resume generation guard)
 *
 * State ownership principle (from plan): Server is source of truth.
 * `isMissionActive` is derived from `missionState === 'running'`, not
 * set optimistically on REST start success.
 *
 * Provider placement: inside AuthProvider, outside RoverProvider.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { getMissionStatus, getPointStatus } from '../services/missionLifecycleService';
import { getLoadedPath } from '../services/missionStagingService';
import type { StagedMissionResponse, MissionStatusResponse } from '../types/px4/mission';
import type { LoadedPathResponse, MissionState } from '../types/px4/telemetry';
import { MISSION_STAGING_ENABLED } from '../config/featureFlags';

// ── Context value ─────────────────────────────────────────────────────────────

export interface MissionStagingContextValue {
  // Staging artifact
  pathName: string | null;
  missionId: string | null;
  stagedSummary: StagedMissionResponse | null;
  // Loaded path (post load-to-controller)
  loadedPath: LoadedPathResponse | null;
  // Mission runtime state (from server)
  missionState: MissionState;
  missionStatusDetail: MissionStatusResponse | null;
  // Point mission generation guard
  expectedGeneration: number | null;
  // Derived
  isMissionActive: boolean;
  isMissionLoaded: boolean;
  // Actions
  setStagingArtifact: (pathName: string, missionId: string, summary?: StagedMissionResponse) => void;
  setLoadedPath: (loaded: LoadedPathResponse) => void;
  setMissionState: (state: MissionState) => void;
  clearStaging: () => void;
  refreshStatus: () => Promise<void>;
  refreshLoadedPath: () => Promise<void>;
  refreshExpectedGeneration: () => Promise<void>;
}

const MissionStagingContext = createContext<MissionStagingContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const STATUS_POLL_INTERVAL_MS = 10_000; // 10s background poll

interface MissionStagingProviderProps {
  children: ReactNode;
}

export function MissionStagingProvider({
  children,
}: MissionStagingProviderProps): React.ReactElement {
  const [pathName, setPathNameState] = useState<string | null>(null);
  const [missionId, setMissionIdState] = useState<string | null>(null);
  const [stagedSummary, setStagedSummaryState] = useState<StagedMissionResponse | null>(null);
  const [loadedPath, setLoadedPathState] = useState<LoadedPathResponse | null>(null);
  const [missionState, setMissionStateInternal] = useState<MissionState>('idle');
  const [missionStatusDetail, setMissionStatusDetail] = useState<MissionStatusResponse | null>(null);
  const [expectedGeneration, setExpectedGeneration] = useState<number | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isMissionActive = missionState === 'running';
  const isMissionLoaded = loadedPath?.path_name != null;

  // ── Refresh actions ──────────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    if (!MISSION_STAGING_ENABLED) return;
    const generation = requestGenerationRef.current;
    try {
      const status = await getMissionStatus();
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      if (!status || typeof status !== "object" || typeof (status as { state?: unknown }).state !== "string") {
        return;
      }
      setMissionStateInternal(status.state);
      setMissionStatusDetail(status);
    } catch {
      // Silent — don't disrupt UI on poll failure
    }
  }, []);

  const refreshLoadedPath = useCallback(async () => {
    if (!MISSION_STAGING_ENABLED) return;
    const generation = requestGenerationRef.current;
    try {
      const loaded = await getLoadedPath();
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      if (!loaded || typeof loaded !== "object") {
        return;
      }
      setLoadedPathState(loaded);
      if (loaded.path_name) {
        setPathNameState(loaded.path_name);
      }
      if (loaded.mission_id) {
        setMissionIdState(loaded.mission_id);
      }
    } catch {
      // Silent
    }
  }, []);

  const refreshExpectedGeneration = useCallback(async () => {
    if (!MISSION_STAGING_ENABLED) return;
    const generation = requestGenerationRef.current;
    try {
      const pointStatus = await getPointStatus();
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      setExpectedGeneration(pointStatus.expected_generation);
    } catch {
      // Point status only available in point mode — ignore 404/409
    }
  }, []);

  // ── Initial load + background poll ───────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!MISSION_STAGING_ENABLED) return;

    void refreshStatus();
    void refreshLoadedPath();

    pollTimerRef.current = setInterval(refreshStatus, STATUS_POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refreshStatus, refreshLoadedPath]);

  // ── Public setters ────────────────────────────────────────────────────────────

  const setStagingArtifact = useCallback(
    (pn: string, mid: string, summary?: StagedMissionResponse) => {
      setPathNameState(pn);
      setMissionIdState(mid);
      if (summary) setStagedSummaryState(summary);
    },
    [],
  );

  const setLoadedPath = useCallback((loaded: LoadedPathResponse) => {
    setLoadedPathState(loaded);
    if (loaded.path_name) setPathNameState(loaded.path_name);
    if (loaded.mission_id) setMissionIdState(loaded.mission_id);
  }, []);

  const setMissionState = useCallback((state: MissionState) => {
    setMissionStateInternal(state);
  }, []);

  const clearStaging = useCallback(() => {
    requestGenerationRef.current += 1;
    setPathNameState(null);
    setMissionIdState(null);
    setStagedSummaryState(null);
    setLoadedPathState(null);
    setMissionStateInternal('idle');
    setMissionStatusDetail(null);
    setExpectedGeneration(null);
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────────

  const contextValue = React.useMemo<MissionStagingContextValue>(
    () => ({
      pathName,
      missionId,
      stagedSummary,
      loadedPath,
      missionState,
      missionStatusDetail,
      expectedGeneration,
      isMissionActive,
      isMissionLoaded,
      setStagingArtifact,
      setLoadedPath,
      setMissionState,
      clearStaging,
      refreshStatus,
      refreshLoadedPath,
      refreshExpectedGeneration,
    }),
    [
      pathName, missionId, stagedSummary, loadedPath,
      missionState, missionStatusDetail, expectedGeneration,
      isMissionActive, isMissionLoaded,
      setStagingArtifact, setLoadedPath, setMissionState, clearStaging,
      refreshStatus, refreshLoadedPath, refreshExpectedGeneration,
    ],
  );

  return React.createElement(
    MissionStagingContext.Provider,
    { value: contextValue },
    children,
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMissionStaging(): MissionStagingContextValue {
  const ctx = useContext(MissionStagingContext);
  if (!ctx) throw new Error('useMissionStaging must be used within a MissionStagingProvider');
  return ctx;
}

export default MissionStagingContext;
