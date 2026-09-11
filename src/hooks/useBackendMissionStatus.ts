import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getMissionStatus,
  type MissionExtensionMode,
} from "../services/missionApi";

import {
  on as socketOn,
} from "../services/socketClient";

import {
  PX4_SOCKET_EVENTS,
} from "../config/px4Endpoints";

type UnknownRecord =
  Record<string, unknown>;

export interface BackendPointEvent {
  event: string;
  pointId: string | null;
  pointIndex: number | null;
  pathIndex: number | null;
  x: number | null;
  y: number | null;
  timestamp: string | null;
  raw: UnknownRecord;
}

export interface BackendMissionStatus {
  missionId: string | null;
  filename: string | null;
  checksumSha256: string | null;

  coordinateMode: string | null;

pauseReason: string | null;
resumeAvailable: boolean;

rtkState: string | null;
rtkFixed: boolean;
rtkHealthy: boolean;
rtkMotionOk: boolean;
rtkReason: string | null;
rtkCorrectionAgeSec: number | null;

arrivalSettleElapsedSec: number;
arrivalSettleRequiredSec: number;

  extensionMode:
    | MissionExtensionMode
    | null;

  dummyPointDistanceM:
    | number
    | null;

  rowTransitionThresholdM:
    | number
    | null;

  state: string;
  loaded: boolean;
  ready: boolean;

  totalPoints: number;
  navigationPointCount: number;
  dummyPointCount: number;

  completedPoints: number;
  skippedPoints: number;
  failedPoints: number;
  remainingPoints: number;

  progressPercent: number;

  activePointId: string | null;
  activePointIndex: number | null;
  activePointNumber: number | null;
  activePointState: string | null;
  nextPointIndex: number | null;

  markingActive: boolean;
  alignmentActive: boolean;

  holdElapsedSec: number;
  holdRequiredSec: number;

  pointStatus: unknown[];
  lastPointEvent: BackendPointEvent | null;

  uploadedAt: string | null;
  preparedAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;

  message: string | null;
  error: string | null;
}

export interface UseBackendMissionStatusResult {
  mission: BackendMissionStatus;
  isLoading: boolean;
  lastError: string | null;
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_MISSION: BackendMissionStatus = {
  missionId: null,
  filename: null,
  checksumSha256: null,

  coordinateMode: null,
  extensionMode: null,

pauseReason: null,
resumeAvailable: false,

rtkState: null,
rtkFixed: false,
rtkHealthy: false,
rtkMotionOk: false,
rtkReason: null,
rtkCorrectionAgeSec: null,

arrivalSettleElapsedSec: 0,
arrivalSettleRequiredSec: 0.30,

  dummyPointDistanceM: null,
  rowTransitionThresholdM: null,

  state: "EMPTY",
  loaded: false,
  ready: false,

  totalPoints: 0,
  navigationPointCount: 0,
  dummyPointCount: 0,

  completedPoints: 0,
  skippedPoints: 0,
  failedPoints: 0,
  remainingPoints: 0,

  progressPercent: 0,

  activePointId: null,
  activePointIndex: null,
  activePointNumber: null,
  activePointState: null,
  nextPointIndex: null,

  markingActive: false,
  alignmentActive: false,

  holdElapsedSec: 0,
  holdRequiredSec: 0.30,

  pointStatus: [],
  lastPointEvent: null,

  uploadedAt: null,
  preparedAt: null,
  startedAt: null,
  pausedAt: null,
  completedAt: null,
  updatedAt: null,

  message: null,
  error: null,
};

function asRecord(
  value: unknown,
): UnknownRecord | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as UnknownRecord;
}

function unwrapMissionPayload(
  payload: unknown,
): UnknownRecord {
  const root =
    asRecord(payload) ?? {};

  const nestedMission =
    asRecord(root.mission);

  return nestedMission ?? root;
}

function toStringOrNull(
  value: unknown,
): string | null {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  return null;
}

function toFiniteNumberOrNull(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const result =
    Number(value);

  return Number.isFinite(result)
    ? result
    : null;
}

function toNonNegativeNumber(
  value: unknown,
  fallback = 0,
): number {
  const result =
    toFiniteNumberOrNull(value);

  if (result === null) {
    return fallback;
  }

  return Math.max(
    0,
    result,
  );
}

function toNullableIndex(
  value: unknown,
): number | null {
  const result =
    toFiniteNumberOrNull(value);

  if (result === null) {
    return null;
  }

  return Math.trunc(result);
}

function toBoolean(
  value: unknown,
  fallback = false,
): boolean {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function clampPercent(
  value: number,
): number {
  return Math.min(
    100,
    Math.max(
      0,
      value,
    ),
  );
}

function normalizePointEvent(
  payload: unknown,
): BackendPointEvent | null {
  const source =
    asRecord(payload);

  if (!source) {
    return null;
  }

  const event =
    toStringOrNull(
      source.event,
    )?.toUpperCase() ?? "EVENT";

  return {
    event,

    pointId:
      toStringOrNull(
        source.point_id,
      ),

    pointIndex:
      toNullableIndex(
        source.point_index,
      ),

    pathIndex:
      toNullableIndex(
        source.path_index,
      ),

    x:
      toFiniteNumberOrNull(
        source.x,
      ),

    y:
      toFiniteNumberOrNull(
        source.y,
      ),

    timestamp:
      toStringOrNull(
        source.timestamp,
      ) ??
      toStringOrNull(
        source.updated_at,
      ),

    raw: source,
  };
}

function mergeMissionPayload(
  previous: BackendMissionStatus,
  payload: unknown,
): BackendMissionStatus {
  const source =
    unwrapMissionPayload(payload);

  const totalPoints =
    source.total_points !== undefined
      ? toNonNegativeNumber(
          source.total_points,
        )
      : previous.totalPoints;

  const completedPoints =
    source.completed_points !== undefined
      ? toNonNegativeNumber(
          source.completed_points,
        )
      : previous.completedPoints;

  const skippedPoints =
    source.skipped_points !== undefined
      ? toNonNegativeNumber(
          source.skipped_points,
        )
      : previous.skippedPoints;

  const failedPoints =
    source.failed_points !== undefined
      ? toNonNegativeNumber(
          source.failed_points,
        )
      : previous.failedPoints;

  const calculatedRemaining =
    Math.max(
      0,
      totalPoints -
        completedPoints -
        skippedPoints -
        failedPoints,
    );

  const remainingPoints =
    source.remaining_points !== undefined
      ? toNonNegativeNumber(
          source.remaining_points,
        )
      : calculatedRemaining;

  const suppliedProgress =
    toFiniteNumberOrNull(
      source.progress_percent ??
        source.progress_pct,
    );

  const calculatedProgress =
    totalPoints > 0
      ? (
          (
            completedPoints +
            skippedPoints +
            failedPoints
          ) /
          totalPoints
        ) * 100
      : 0;

  const state =
    (
      toStringOrNull(
        source.state,
      ) ??
      previous.state
    ).toUpperCase();

  const extensionModeText =
    toStringOrNull(
      source.extension_mode,
    )?.toUpperCase();

  const extensionMode =
    extensionModeText === "ENABLE" ||
    extensionModeText === "DISABLE"
      ? extensionModeText
      : previous.extensionMode;

  const incomingPointEvent =
    normalizePointEvent(
      source.last_point_event,
    );

  return {
    ...previous,

    missionId:
      source.mission_id !== undefined
        ? toStringOrNull(
            source.mission_id,
          )
        : previous.missionId,

    filename:
      source.filename !== undefined
        ? toStringOrNull(
            source.filename,
          )
        : previous.filename,

    checksumSha256:
      source.checksum_sha256 !== undefined
        ? toStringOrNull(
            source.checksum_sha256,
          )
        : previous.checksumSha256,

    coordinateMode:
      source.coordinate_mode !== undefined
        ? toStringOrNull(
            source.coordinate_mode,
          )
        : previous.coordinateMode,

    extensionMode,

    dummyPointDistanceM:
      source.dummy_point_distance_m !== undefined
        ? toFiniteNumberOrNull(
            source.dummy_point_distance_m,
          )
        : previous.dummyPointDistanceM,

    rowTransitionThresholdM:
      source.row_transition_threshold_m !== undefined
        ? toFiniteNumberOrNull(
            source.row_transition_threshold_m,
          )
        : previous.rowTransitionThresholdM,

    state,

    loaded:
      source.loaded !== undefined
        ? toBoolean(
            source.loaded,
          )
        : previous.loaded,

    ready:
      source.ready !== undefined
        ? toBoolean(
            source.ready,
          )
        : previous.ready,

    totalPoints,

    navigationPointCount:
      source.navigation_point_count !== undefined
        ? toNonNegativeNumber(
            source.navigation_point_count,
          )
        : previous.navigationPointCount,

    dummyPointCount:
      source.dummy_point_count !== undefined
        ? toNonNegativeNumber(
            source.dummy_point_count,
          )
        : previous.dummyPointCount,

    completedPoints,
    skippedPoints,
    failedPoints,
    remainingPoints,

    progressPercent:
      clampPercent(
        suppliedProgress ??
          calculatedProgress,
      ),

    activePointId:
      source.active_point_id !== undefined
        ? toStringOrNull(
            source.active_point_id,
          )
        : previous.activePointId,

    activePointIndex:
      source.active_point_index !== undefined ||
      source.current_point_index !== undefined
        ? toNullableIndex(
            source.active_point_index ??
              source.current_point_index,
          )
        : previous.activePointIndex,

    activePointNumber:
      source.active_point_number !== undefined
        ? toNullableIndex(
            source.active_point_number,
          )
        : previous.activePointNumber,

    activePointState:
      source.active_point_state !== undefined
        ? toStringOrNull(
            source.active_point_state,
          )
        : previous.activePointState,

    nextPointIndex:
      source.next_point_index !== undefined
        ? toNullableIndex(
            source.next_point_index,
          )
        : previous.nextPointIndex,

    markingActive:
      source.marking_active !== undefined
        ? toBoolean(
            source.marking_active,
          )
        : previous.markingActive,

    alignmentActive:
      source.alignment_active !== undefined
        ? toBoolean(
            source.alignment_active,
          )
        : previous.alignmentActive,

    holdElapsedSec:
      source.hold_elapsed_sec !== undefined
        ? toNonNegativeNumber(
            source.hold_elapsed_sec,
          )
        : previous.holdElapsedSec,

    holdRequiredSec:
      source.hold_required_sec !== undefined
        ? toNonNegativeNumber(
            source.hold_required_sec,
            0.30,
          )
        : previous.holdRequiredSec,

    pointStatus:
      Array.isArray(
        source.point_status,
      )
        ? source.point_status
        : previous.pointStatus,

    lastPointEvent:
      incomingPointEvent ??
      previous.lastPointEvent,

    uploadedAt:
      source.uploaded_at !== undefined
        ? toStringOrNull(
            source.uploaded_at,
          )
        : previous.uploadedAt,

    preparedAt:
      source.prepared_at !== undefined
        ? toStringOrNull(
            source.prepared_at,
          )
        : previous.preparedAt,

    startedAt:
      source.started_at !== undefined
        ? toStringOrNull(
            source.started_at,
          )
        : previous.startedAt,

    pausedAt:
      source.paused_at !== undefined
        ? toStringOrNull(
            source.paused_at,
          )
        : previous.pausedAt,

    pauseReason:
  source.pause_reason !== undefined
    ? toStringOrNull(source.pause_reason)
    : previous.pauseReason,

resumeAvailable:
  source.resume_available !== undefined
    ? toBoolean(source.resume_available)
    : previous.resumeAvailable,

rtkState:
  source.rtk_state !== undefined
    ? toStringOrNull(source.rtk_state)
    : previous.rtkState,

rtkFixed:
  source.rtk_fixed !== undefined
    ? toBoolean(source.rtk_fixed)
    : previous.rtkFixed,

rtkHealthy:
  source.rtk_healthy !== undefined
    ? toBoolean(source.rtk_healthy)
    : previous.rtkHealthy,

rtkMotionOk:
  source.rtk_motion_ok !== undefined
    ? toBoolean(source.rtk_motion_ok)
    : previous.rtkMotionOk,

rtkReason:
  source.rtk_reason !== undefined
    ? toStringOrNull(source.rtk_reason)
    : previous.rtkReason,

rtkCorrectionAgeSec:
  source.rtk_correction_age_sec !== undefined
    ? toFiniteNumberOrNull(source.rtk_correction_age_sec)
    : previous.rtkCorrectionAgeSec,

    arrivalSettleElapsedSec:
      source.arrival_settle_elapsed_sec !== undefined ||
      source.hold_elapsed_sec !== undefined
        ? toNonNegativeNumber(
            source.arrival_settle_elapsed_sec ??
              source.hold_elapsed_sec,
          )
        : previous.arrivalSettleElapsedSec,

    arrivalSettleRequiredSec:
      source.arrival_settle_required_sec !== undefined ||
      source.hold_required_sec !== undefined
        ? toNonNegativeNumber(
            source.arrival_settle_required_sec ??
              source.hold_required_sec,
            0.30,
          )
        : previous.arrivalSettleRequiredSec,

    completedAt:
      source.completed_at !== undefined
        ? toStringOrNull(
            source.completed_at,
          )
        : previous.completedAt,

    updatedAt:
      toStringOrNull(
        source.updated_at,
      ) ??
      new Date().toISOString(),

    message:
      source.message !== undefined
        ? toStringOrNull(
            source.message,
          )
        : previous.message,

    error:
      source.error !== undefined
        ? toStringOrNull(
            source.error,
          )
        : previous.error,
  };
}

export function useBackendMissionStatus(
  enabled = true,
): UseBackendMissionStatusResult {
  const [mission, setMission] =
    useState<BackendMissionStatus>(
      EMPTY_MISSION,
    );

  const [isLoading, setIsLoading] =
    useState(enabled);

  const [lastError, setLastError] =
    useState<string | null>(null);

  const mountedRef =
    useRef(true);

  const applyMissionPayload =
    useCallback(
      (payload: unknown): void => {
        if (!mountedRef.current) {
          return;
        }

        setMission(
          previous =>
            mergeMissionPayload(
              previous,
              payload,
            ),
        );

        setLastError(null);
      },
      [],
    );

  const applyPointEvent =
    useCallback(
      (payload: unknown): void => {
        const event =
          normalizePointEvent(
            payload,
          );

        if (
          !event ||
          !mountedRef.current
        ) {
          return;
        }

        /*
         * /mission_manager/point_event also transports system notifications.
         * RTK_FLOAT / RTK_RECOVERED do not identify a mission point and must
         * never overwrite activePointState or last point progress.
         */
        if (
          event.pointId === null &&
          event.pointIndex === null &&
          event.pathIndex === null
        ) {
          return;
        }

        setMission(
          previous => ({
            ...previous,

            lastPointEvent:
              event,

            activePointId:
              event.pointId ??
              previous.activePointId,

            activePointIndex:
              event.pointIndex ??
              previous.activePointIndex,

            activePointNumber:
              event.pointIndex !== null
                ? event.pointIndex + 1
                : previous.activePointNumber,

            activePointState:
              event.event,

            updatedAt:
              event.timestamp ??
              new Date().toISOString(),
          }),
        );
      },
      [],
    );

  const refresh =
    useCallback(
      async (): Promise<void> => {
        if (!enabled) {
          return;
        }

        try {
          const response =
            await getMissionStatus();

          if (
            !response.success
          ) {
            throw new Error(
              "Backend rejected the mission-status request.",
            );
          }

          applyMissionPayload(
            response.mission,
          );
        } catch (error) {
          if (!mountedRef.current) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "Unable to load mission status.";

          setLastError(
            message,
          );
        } finally {
          if (mountedRef.current) {
            setIsLoading(false);
          }
        }
      },
      [
        enabled,
        applyMissionPayload,
      ],
    );

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setIsLoading(false);

      return () => {
        mountedRef.current = false;
      };
    }

    setIsLoading(true);

    void refresh();

    const unsubscribeMissionStatus =
      socketOn(
        PX4_SOCKET_EVENTS.MISSION_STATUS,
        (...args: unknown[]) => {
          applyMissionPayload(
            args[0],
          );
        },
        "backend-mission-status-hook",
      );

    const unsubscribeMissionProgress =
      socketOn(
        PX4_SOCKET_EVENTS.MISSION_PROGRESS,
        (...args: unknown[]) => {
          applyMissionPayload(
            args[0],
          );
        },
        "backend-mission-progress-hook",
      );

    const unsubscribeMissionState =
      socketOn(
        PX4_SOCKET_EVENTS.MISSION_STATE,
        (...args: unknown[]) => {
          applyMissionPayload(
            args[0],
          );
        },
        "backend-mission-state-hook",
      );

    const unsubscribeMissionCompleted =
      socketOn(
        PX4_SOCKET_EVENTS.MISSION_COMPLETED,
        (...args: unknown[]) => {
          applyMissionPayload(
            args[0],
          );

          if (
            mountedRef.current
          ) {
            setMission(
              previous => ({
                ...previous,
                state: "COMPLETED",
                remainingPoints: 0,
                progressPercent: 100,
                markingActive: false,
                alignmentActive: false,
              }),
            );
          }
        },
        "backend-mission-completed-hook",
      );

    const unsubscribePointEvent =
      socketOn(
        PX4_SOCKET_EVENTS.POINT_EVENT,
        (...args: unknown[]) => {
          applyPointEvent(
            args[0],
          );
        },
        "backend-point-event-hook",
      );

    const unsubscribePointCompleted =
      socketOn(
        PX4_SOCKET_EVENTS.POINT_COMPLETED,
        (...args: unknown[]) => {
          applyPointEvent(
            args[0],
          );
        },
        "backend-point-completed-hook",
      );

    const unsubscribePointSkipped =
      socketOn(
        PX4_SOCKET_EVENTS.POINT_SKIPPED,
        (...args: unknown[]) => {
          applyPointEvent(
            args[0],
          );
        },
        "backend-point-skipped-hook",
      );

    const unsubscribePointFailed =
      socketOn(
        PX4_SOCKET_EVENTS.POINT_FAILED,
        (...args: unknown[]) => {
          applyPointEvent(
            args[0],
          );
        },
        "backend-point-failed-hook",
      );

    /*
     * Socket.IO supplies live changes.
     * This REST poll is only a fallback for missed socket events
     * and reconnection periods.
     */
    const pollingTimer =
      setInterval(() => {
        void refresh();
      }, 5000);

    return () => {
      mountedRef.current = false;

      clearInterval(
        pollingTimer,
      );

      unsubscribeMissionStatus();
      unsubscribeMissionProgress();
      unsubscribeMissionState();
      unsubscribeMissionCompleted();

      unsubscribePointEvent();
      unsubscribePointCompleted();
      unsubscribePointSkipped();
      unsubscribePointFailed();
    };
  }, [
    enabled,
    refresh,
    applyMissionPayload,
    applyPointEvent,
  ]);

  return {
    mission,
    isLoading,
    lastError,
    lastUpdatedAt:
      mission.updatedAt,
    refresh,
  };
}

export default useBackendMissionStatus;