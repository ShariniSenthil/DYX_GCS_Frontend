/**
 * useMissionStaging — consumer hook for MissionStagingContext.
 *
 * Provides the full staging pipeline in a convenient hook form.
 * Also exposes convenience wrappers that update context state after
 * each API call (plan → stage → load → start sequence).
 */

import { useCallback } from 'react';
import { useMissionStaging as useStagingCtx } from '../context/MissionStagingContext';
import {
  planAndStage,
  getStaged,
  loadToController,
  getLoadedPath,
  listPaths,
} from '../services/missionStagingService';
import {
  startMission,
  stopMission,
  abortMission,
  clearMission,
} from '../services/missionLifecycleService';
import type { PathPlanRequest, MissionStartRequest } from '../types/px4/mission';

export function useMissionStaging() {
  const ctx = useStagingCtx();

  /**
   * Run the full staging pipeline: plan → stage → get staged → update context.
   * @returns The staged mission ID.
   */
  const stageMission = useCallback(
    async (pathName: string, planRequest: PathPlanRequest = {}): Promise<string> => {
      const planResult = await planAndStage(pathName, planRequest);
      const summary = await getStaged(planResult.mission_id);
      ctx.setStagingArtifact(pathName, planResult.mission_id, summary);
      return planResult.mission_id;
    },
    [ctx],
  );

  /**
   * Load a staged mission to the flight controller + confirm.
   */
  const loadMission = useCallback(
    async (missionId: string): Promise<void> => {
      await loadToController(missionId);
      const loaded = await getLoadedPath();
      ctx.setLoadedPath(loaded);
    },
    [ctx],
  );

  /**
   * Stage + load in sequence. Full pipeline from plan to controller.
   */
  const stageAndLoad = useCallback(
    async (pathName: string, planRequest: PathPlanRequest = {}): Promise<void> => {
      const missionId = await stageMission(pathName, planRequest);
      await loadMission(missionId);
    },
    [stageMission, loadMission],
  );

  /**
   * Start the loaded mission. Updates missionState from response.
   */
  const start = useCallback(
    async (request: MissionStartRequest = {}): Promise<void> => {
      const resp = await startMission(request);
      // Do NOT set isMissionActive = true here — wait for socket mission_status
      // state === 'running'. Only update the local state string as a hint.
      ctx.setMissionState(resp.state);
    },
    [ctx],
  );

  /**
   * Stop the mission. Updates missionState.
   */
  const stop = useCallback(async (): Promise<void> => {
    await stopMission();
    ctx.setMissionState('stopping');
  }, [ctx]);

  /**
   * Hard abort.
   */
  const abort = useCallback(async (): Promise<void> => {
    await abortMission();
    ctx.setMissionState('idle');
  }, [ctx]);

  /**
   * Clear loaded mission + reset staging context.
   */
  const clear = useCallback(async (): Promise<void> => {
    await clearMission();
    ctx.clearStaging();
  }, [ctx]);

  return {
    ...ctx,
    stageMission,
    loadMission,
    stageAndLoad,
    start,
    stop,
    abort,
    clear,
    listPaths,
  };
}

export default useMissionStaging;
