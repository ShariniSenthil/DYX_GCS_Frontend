/**
 * useVerifiedMissionUpload — Three-step verified mission upload pipeline.
 *
 * Steps:
 *   1. pathplanToVerifiedWaypoints() — strict validation, reject on ANY error
 *   2. uploadVerifiedMission()       — POST FOURWD_MISSION.UPLOAD_WAYPOINTS
 *   3. getVerifiedMission()          — GET  FOURWD_MISSION.GET(id)
 *   4. VerifiedMissionContext.setLoadedMission()  ← ONLY after steps 2+3 succeed
 *   5. Clear stale runtime UI state from PersistentStorage
 *
 * The context and persistent storage are NEVER updated unless all three steps
 * complete successfully.
 *
 * Safety:
 *   - A ref-based in-flight guard prevents concurrent uploads; a second call
 *     while one is running returns immediately without starting a new request.
 *   - Local React state updates are guarded against unmount.
 *   - Registering the confirmed mission is a provider-level task: setLoadedMission
 *     targets VerifiedMissionProvider (mounted above this hook), so a confirmed
 *     upload is still recorded even if the initiating screen unmounts mid-flight.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  uploadVerifiedMission,
  getVerifiedMission,
} from '../services/verifiedMissionService';
import {
  pathplanToVerifiedWaypoints,
  buildValidationErrorMessage,
  type WaypointValidationError,
} from '../utils/pathplanToVerifiedWaypoints';
import { useVerifiedMissionContext } from '../context/VerifiedMissionContext';
import PersistentStorage from '../services/PersistentStorage';
import type { PathPlanWaypoint } from '../types/pathplan';
import type { VerifiedMissionSettings } from '../types/fourwd/mission';

// ── Public types ──────────────────────────────────────────────────────────────

export interface VerifiedUploadOptions {
  missionName?: string;
  settings?: VerifiedMissionSettings;
  /**
   * When true, any waypoint with mark === undefined is a validation error.
   * The 4WD_SERVER verified contract requires `mark` on every waypoint, so this
   * defaults to true. Pass false only for a mode that does not require marks.
   */
  requireMark?: boolean;
}

export interface VerifiedUploadResult {
  success: boolean;
  mission_id?: string;
  total_targets?: number;
  /** Human-readable error message (for Alert dialogs and notifications). */
  message?: string;
  /** Structured per-waypoint validation errors (for detailed display if needed). */
  validationErrors?: WaypointValidationError[];
  /** True when the call was rejected because another upload is in flight. */
  inFlight?: boolean;
}

export interface UseVerifiedMissionUploadResult {
  upload: (
    waypoints: PathPlanWaypoint[],
    options?: VerifiedUploadOptions,
  ) => Promise<VerifiedUploadResult>;
  isUploading: boolean;
  uploadError: string | null;
  /** Upload progress: 0 = idle, 10 = starting, 50 = uploaded, 80 = confirmed, 100 = done */
  progress: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVerifiedMissionUpload(): UseVerifiedMissionUploadResult {
  const ctx = useVerifiedMissionContext();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // In-flight guard — survives re-renders, prevents concurrent uploads.
  const inFlightRef = useRef(false);
  // Unmount guard for local React state updates.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetUploading = useCallback((v: boolean) => {
    if (mountedRef.current) setIsUploading(v);
  }, []);
  const safeSetError = useCallback((v: string | null) => {
    if (mountedRef.current) setUploadError(v);
  }, []);
  const safeSetProgress = useCallback((v: number) => {
    if (mountedRef.current) setProgress(v);
  }, []);

  const upload = useCallback(
    async (
      sourceWaypoints: PathPlanWaypoint[],
      options: VerifiedUploadOptions = {},
    ): Promise<VerifiedUploadResult> => {
      // ── Concurrency guard: reject a second concurrent upload ─────────────
      if (inFlightRef.current) {
        console.warn('[useVerifiedMissionUpload] Upload already in flight; ignoring re-entrant call');
        return {
          success: false,
          inFlight: true,
          message: 'An upload is already in progress.',
        };
      }
      inFlightRef.current = true;

      safeSetUploading(true);
      safeSetError(null);
      safeSetProgress(0);

      try {
        // ── Step 1: Strict validation — reject on any error ──────────────────
        const { waypoints, errors } = pathplanToVerifiedWaypoints(sourceWaypoints, {
          requireMark: options.requireMark ?? true,
        });

        if (errors.length > 0) {
          const msg = buildValidationErrorMessage(errors);
          safeSetError(msg);
          return { success: false, message: msg, validationErrors: errors };
        }

        if (waypoints.length === 0) {
          const msg = 'No waypoints to upload.';
          safeSetError(msg);
          return { success: false, message: msg };
        }

        const missionName =
          options.missionName ??
          `Mission ${new Date().toISOString().slice(0, 16)}`;

        // ── Step 2: Upload ───────────────────────────────────────────────────
        safeSetProgress(10);
        const uploadResp = await uploadVerifiedMission({
          mission_name: missionName,
          waypoints,
          settings: options.settings,
        });

        if (!uploadResp.success) {
          const msg = uploadResp.message ?? 'Server rejected the mission upload.';
          safeSetError(msg);
          return { success: false, message: msg };
        }

        const { mission_id, total_targets } = uploadResp;
        safeSetProgress(50);

        // ── Step 3: Confirm via GET (404 if not stored) ──────────────────────
        const confirmed = await getVerifiedMission(mission_id);
        if (confirmed.total_targets !== total_targets) {
          const msg =
            `Server confirmed ${confirmed.total_targets} targets but upload ` +
            `reported ${total_targets}. Aborting — data mismatch.`;
          safeSetError(msg);
          return { success: false, message: msg };
        }
        safeSetProgress(80);

        // ── Step 4: Register in context (provider-level task) ────────────────
        // ONLY after both steps 2 and 3 pass. Done even if the initiating
        // screen unmounted: the provider above this hook owns the state.
        ctx.setLoadedMission(mission_id, missionName, total_targets);

        // ── Step 5: Clear stale runtime UI state ─────────────────────────────
        await Promise.all([
          PersistentStorage.saveMissionActive(false),
          PersistentStorage.saveStatusMap({}),
          PersistentStorage.saveMissionStartTime(null),
          PersistentStorage.saveMissionEndTime(null),
        ]);

        safeSetProgress(100);
        return { success: true, mission_id, total_targets };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        safeSetError(msg);
        return { success: false, message: msg };
      } finally {
        // In-flight guard MUST clear on every path.
        inFlightRef.current = false;
        safeSetUploading(false);
      }
    },
    [ctx, safeSetUploading, safeSetError, safeSetProgress],
  );

  return { upload, isUploading, uploadError, progress };
}
