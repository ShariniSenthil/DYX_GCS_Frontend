import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isOfflineMode } from "../config";
import { useConnection } from "./ConnectionContext";
import {
  getLoadedMissionPath,
  getMissionStatus,
} from "../services/missionApi";
import {
  EMPTY_TRAJECTORY_PREVIEW,
  parseTrajectoryPathCleared,
  parseTrajectoryPathPush,
  reduceTrajectoryPreview,
  shouldFetchLoadedPath,
  shouldPollMissionStatus,
  type TrajectoryPreviewState,
} from "../utils/backendTrajectoryPreview";

const STATUS_INTERVAL_GENERATING_MS = 250;
const STATUS_INTERVAL_READY_MS = 2000;

export interface BackendTrajectoryContextValue {
  preview: TrajectoryPreviewState;
  invalidateForUpload: () => void;
  resumePreviewAfterFailedUpload: () => void;
  markLoadAccepted: () => void;
  refreshNow: () => Promise<void>;
}

const BackendTrajectoryContext =
  createContext<BackendTrajectoryContextValue | null>(null);

export function BackendTrajectoryProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const { connectionState, socket } = useConnection();
  const [preview, setPreview] = useState<TrajectoryPreviewState>(
    EMPTY_TRAJECTORY_PREVIEW,
  );

  const previewRef = useRef(preview);
  const epochRef = useRef(0);
  const lastReadyRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastStatusAtRef = useRef(0);
  const holdPreviewRef = useRef(false);
  const missionIdAtHoldRef = useRef<string | null>(null);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  const apply = useCallback(
    (event: Parameters<typeof reduceTrajectoryPreview>[1]) => {
      setPreview((previous) => {
        const next = reduceTrajectoryPreview(previous, event);
        previewRef.current = next;
        return next;
      });
    },
    [],
  );

  const invalidateForUpload = useCallback(() => {
    epochRef.current += 1;
    lastReadyRef.current = false;
    holdPreviewRef.current = true;
    missionIdAtHoldRef.current = previewRef.current.missionId;
    apply({ type: "UPLOAD_STARTED", epoch: epochRef.current });
  }, [apply]);

  const resumePreviewAfterFailedUpload = useCallback(() => {
    holdPreviewRef.current = false;
    missionIdAtHoldRef.current = null;
  }, []);

  const markLoadAccepted = useCallback(() => {
    apply({ type: "LOAD_ACCEPTED" });
  }, [apply]);

  const pollOnce = useCallback(async (): Promise<void> => {
    const offline = isOfflineMode();
    if (
      !shouldPollMissionStatus({
        isOffline: offline,
        connectionState,
      })
    ) {
      apply(offline ? { type: "OFFLINE" } : { type: "DISCONNECTED" });
      return;
    }

    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const epochAtStart = epochRef.current;

    try {
      const response = await getMissionStatus();
      if (epochAtStart !== epochRef.current) {
        return;
      }
      if (!response?.success || !response.mission) {
        apply({ type: "STATUS_ERROR" });
        return;
      }

      const mission = response.mission;
      const trajectoryReady = mission.trajectory_ready === true;
      const missionState = String(mission.state ?? "")
        .trim()
        .toUpperCase();
      const finishedRun =
        missionState === "COMPLETED" ||
        missionState === "STOPPED" ||
        missionState === "EMPTY" ||
        missionState === "LOADED";

      // A finished run often drops trajectory_ready. That is not a new
      // upload — keep the preview epoch so the last path stays drawn.
      // New uploads already bump epoch via invalidateForUpload.
      if (
        lastReadyRef.current &&
        trajectoryReady !== true &&
        !finishedRun
      ) {
        epochRef.current += 1;
      }
      lastReadyRef.current = trajectoryReady;

      const epoch = epochRef.current;
      apply({ type: "STATUS", epoch, mission });

      if (holdPreviewRef.current) {
        const nextId =
          typeof mission.mission_id === "string" ? mission.mission_id : null;
        const loadCleared = mission.trajectory_ready !== true;
        const missionChanged =
          missionIdAtHoldRef.current != null &&
          nextId != null &&
          nextId !== missionIdAtHoldRef.current;
        if (loadCleared || missionChanged) {
          holdPreviewRef.current = false;
        } else {
          return;
        }
      }

      const shouldFetch = shouldFetchLoadedPath({
        isOffline: false,
        connectionState,
        loaded: mission.loaded === true,
        trajectoryReady,
      });

      const alreadyDrawn =
        previewRef.current.phase === "ready" &&
        previewRef.current.points.length >= 2 &&
        previewRef.current.missionId != null &&
        previewRef.current.missionId === (mission.mission_id ?? null);

      if (!shouldFetch || alreadyDrawn) {
        return;
      }

      const previewResponse = await getLoadedMissionPath();
      if (epoch !== epochRef.current) {
        return;
      }

      if (!previewResponse?.success) {
        return;
      }

      apply({
        type: "PREVIEW",
        epoch,
        missionId: mission.mission_id ?? null,
        navigationPointCount: Number(
          previewResponse.navigation_point_count ?? 0,
        ),
        previewTruncated: previewResponse.preview_truncated === true,
        points: previewResponse.points,
        snapshot: previewResponse.snapshot,
        snapshotState: previewResponse.snapshot_state,
        snapshotReason: previewResponse.snapshot_reason,
        requiresReprepare: previewResponse.requires_reprepare === true,
        snapshotOrder:
          typeof previewResponse.seq === "number"
            ? {
                server_instance_id: previewResponse.server_instance_id,
                seq: previewResponse.seq,
              }
            : undefined,
      });
    } catch {
      if (epochAtStart === epochRef.current) {
        apply({ type: "STATUS_ERROR" });
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [apply, connectionState]);

  const refreshNow = useCallback(async () => {
    lastStatusAtRef.current = 0;
    await pollOnce();
  }, [pollOnce]);

  // Verified push from the backend: the generator's whole path in one event.
  // The reducer orders events, ties the path to the current mission and keeps
  // the REST fallback from overwriting it. The poll below stays as the fallback.
  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    const onPath = (raw: unknown) => {
      const push = parseTrajectoryPathPush(raw);
      if (push) {
        apply({ type: "PUSH_PATH", push });
      }
    };
    const onCleared = (raw: unknown) => {
      const cleared = parseTrajectoryPathCleared(raw);
      if (cleared) {
        apply({ type: "PUSH_CLEARED", cleared });
      }
    };
    socket.on("trajectory_path", onPath);
    socket.on("trajectory_path_cleared", onCleared);
    return () => {
      socket.off("trajectory_path", onPath);
      socket.off("trajectory_path_cleared", onCleared);
    };
  }, [socket, apply]);

  // A push for a mission STATUS has not named yet is held by the reducer; ask
  // for STATUS now instead of waiting for the next poll tick.
  const hasPendingPush = preview.pendingPush != null;
  useEffect(() => {
    if (hasPendingPush) {
      void refreshNow();
    }
  }, [hasPendingPush, refreshNow]);

  useEffect(() => {
    const offline = isOfflineMode();
    if (
      !shouldPollMissionStatus({
        isOffline: offline,
        connectionState,
      })
    ) {
      apply(offline ? { type: "OFFLINE" } : { type: "DISCONNECTED" });
      return undefined;
    }

    let cancelled = false;
    lastStatusAtRef.current = 0;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      const current = previewRef.current;
      const interval =
        current.phase === "ready"
          ? STATUS_INTERVAL_READY_MS
          : STATUS_INTERVAL_GENERATING_MS;
      const now = Date.now();
      if (now - lastStatusAtRef.current < interval) {
        return;
      }
      lastStatusAtRef.current = now;
      await pollOnce();
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, STATUS_INTERVAL_GENERATING_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apply, connectionState, pollOnce]);

  const value = useMemo<BackendTrajectoryContextValue>(
    () => ({
      preview,
      invalidateForUpload,
      resumePreviewAfterFailedUpload,
      markLoadAccepted,
      refreshNow,
    }),
    [
      preview,
      invalidateForUpload,
      resumePreviewAfterFailedUpload,
      markLoadAccepted,
      refreshNow,
    ],
  );

  return (
    <BackendTrajectoryContext.Provider value={value}>
      {children}
    </BackendTrajectoryContext.Provider>
  );
}

export function useBackendTrajectory(): BackendTrajectoryContextValue {
  const ctx = useContext(BackendTrajectoryContext);
  if (!ctx) {
    throw new Error(
      "useBackendTrajectory must be used within a BackendTrajectoryProvider",
    );
  }
  return ctx;
}

export default BackendTrajectoryContext;
