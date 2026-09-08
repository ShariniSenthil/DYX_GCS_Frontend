import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  TouchableOpacity,
  View,
  StyleSheet,
  StatusBar,
  Text,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { Toast } from "../components/shared/Toast";
import { VehicleStatusCard } from "../components/missionreport/VehicleStatusCard";
import { DistanceToTargetCard } from "../components/missionreport/DistanceToTargetCard";
import { MissionProgressCard } from "../components/missionreport/MissionProgressCard";
import { AccuracyMonitorCard } from "../components/missionreport/AccuracyMonitorCard";
import { SystemStatusPanel } from "../components/missionreport/SystemStatusPanel";
import { QuickNtripStartCard } from "../components/missionreport/QuickNtripStartCard";
import { ManualDrivePanel } from "../components/manual/ManualDrivePanel";
import MissionControlCard from "../components/missionreport/MissionControlCard";
import { WaypointsTable } from "../components/missionreport/WaypointsTable";
import { MissionMap } from "../components/missionreport/MissionMap";
import { DraggableCard } from "../components/shared/DraggableCard";
import { MissionTableHeader } from "../components/missionreport/MissionTableHeader";
import { MissionTableToolbarActions } from "../components/missionreport/MissionTableToolbarActions";
import {
  useMissionProgressOverlay,
  migrateLegacyPanelVisibility,
} from "../context/MissionProgressOverlayContext";
import {
  MISSION_PROGRESS_LAYOUT,
  getMissionProgressBottomTableInsets,
} from "../constants/missionProgressLayout";
import { PATH_PLAN_GLASS } from "../constants/pathPlanGlass";
import {
  Mode,
  VehicleStatus,
  Waypoint,
} from "../components/missionreport/types";
import { RTKInjectionScreen } from "../components/missionreport/RTKInjectionScreen";
import { useTelemetry } from "../context/TelemetryContext";
import { useConnection } from "../context/ConnectionContext";
import { useMission } from "../context/MissionContext";
import { AutoAssignDialog } from "../components/missionreport/AutoAssignDialog";
import { WaypointPreviewDialog } from "../components/missionreport/WaypointPreviewDialog";
import { MissionCompletionDialog } from "../components/missionreport/MissionCompletionDialog";
import { LogClearDialog } from "../components/missionreport/LogClearDialog";
import { useScreenReadiness } from "../hooks/useComponentReadiness";
import PersistentStorage from "../services/PersistentStorage";
import { getRtkStatus, startRtk } from "../services/rtkService";
import { formatRtkApiError } from "../services/rtkService";
import {
  decideMissionRtkQuickStart,
  toRtkControlView,
  type RtkHeadlineState,
} from "../adapters/rtkControlAdapter";
import {
  armVehicle,
  releaseEmergencyStop,
  setManualMode,
} from "../services/vehicleControlService";
// NOTE: calculateAccuracy and formatAccuracyDisplay commented out - now using backend wp_dist_cm
// import { calculateAccuracy, formatAccuracyDisplay } from '../utils/accuracyCalculation';
import { getAccuracyLevel } from "../utils/accuracyCalculation";
import {
  isRobotStatusDebugEnabled,
  patchRobotStatusDebug,
} from "../utils/robotStatusDebug";
import usePointMissionEvents from "../hooks/usePointMissionEvents";
import {
  POINT_MISSION_ENABLED,
  JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS,
} from "../config/featureFlags";
import { isOfflineMode } from "../config";
import {
  buildLegacyStatusMapFromPointMap,
  mergeLegacyStatusMap,
  pointIndexToSn,
} from "../adapters/px4PointStatusBridge";
import { useVerifiedMissionUpload } from "../hooks/useVerifiedMissionUpload";
import { useVerifiedMissionContext } from "../context/VerifiedMissionContext";
import { useVerifiedMissionProgress } from "../hooks/useVerifiedMissionProgress";
import { verifiedProgressToLegacy } from "../adapters/verifiedTargetBridge";
import { clearVerifiedMission } from "../services/verifiedMissionService";
import { getMissionProgressRef } from "../utils/missionStatusPresentation";
import {
  getMissionStatus,
  getMissionReport,
  getLoadedMissionPath,
  setMissionExecutionMode,
  startMission,
  pauseMission,
  resumeMission,
  nextMissionPoint,
  skipMissionPoint,
  stopMission,
  type LoadedPathPoint,
  type MissionRuntimeState,
  type CanonicalMissionReport,
  type RawGnssSurveySnapshot,
} from "../services/missionApi";

import {
  projectBackendMissionReport,
  reconcileMissionReportRow,
} from "../adapters/backendMissionReportAdapter";

import {
  captureTerminalRppAccuracy,
  isTerminalRppAccuracyStatus,
  selectMissionReportRemark,
  type TerminalRppAccuracySnapshot,
} from "../adapters/terminalRppAccuracyFallback";

// Status map type matching web application
type WpStatus = {
  reached?: boolean;
  marked?: boolean;
  status?:
    | "completed"
    | "loading"
    | "skipped"
    | "reached"
    | "marked"
    | "pending"
    | "spray_on"
    | "spray_off"
    | "passed"
    | "mission_end"
    | "failed"
    | "aborted"
    | "stopped";
  timestamp?: string;
  pile?: string | number;
  rowNo?: string | number;
  remark?: string;
  // Accuracy tracking fields
  hrms?: number; // Horizontal accuracy (meters)
  vrms?: number; // Vertical accuracy (meters)
  lat_achieved?: number; // Actual rover lat when reached
  lon_achieved?: number; // Actual rover lon when reached
  accuracy_level?: string; // 'excellent' | 'good' | 'fair' | 'poor'
  position_error_cm?: number; // Distance error in cm (was position_error_mm)

  // DYX RAW GNSS WAYPOINT DISPLAY
  // Frozen display-only physical stop snapshot from backend.
  survey?: RawGnssSurveySnapshot | null;
};

/**
 * Calculate target-to-rover horizontal position error in millimetres.
 * Kept local so MissionReportScreen does not depend on an incompatible
 * calculateAccuracy return shape.
 */

const getRtkFailureMessage = (err: unknown, fallback: string) =>
  formatRtkApiError(err, fallback);

interface MissionReportScreenProps {
  isVisible?: boolean;
}

export default function MissionReportScreen({
  isVisible = true,
}: MissionReportScreenProps) {
  const DEBUG_MISSION_LOGS = false;
  const missionLog = (...args: any[]) => {
    if (DEBUG_MISSION_LOGS) console.log(...args);
  };
  const mapBackendMissionModeToUiMode = (backendMode: unknown): Mode | null => {
    const normalized = String(backendMode ?? "")
      .trim()
      .toLowerCase();
    if (normalized === "auto") return "AUTO";
    if (normalized === "manual") return "MANUAL";
    if (normalized === "continuous") return "CONTINUOUS";
    if (normalized === "dash") return "DASH";
    return null;
  };
  const { telemetry, roverPosition, onMissionEvent, socket } = useTelemetry();
  const { services, connectionState } = useConnection();

  // 4WD verified mission hooks
  const verifiedCtx = useVerifiedMissionContext();
  const { upload: uploadVerifiedWaypoints } = useVerifiedMissionUpload();
  const {
    verifiedProgressMap,

    currentTargetIndex: verifiedTargetIndex,

    missionTerminal: verifiedTerminal,

    waitingForContinue: verifiedWaiting,

    resetProgress: resetVerifiedProgress,

    clearMissionTerminal: clearVerifiedTerminal,
  } = useVerifiedMissionProgress(
    socket,
    connectionState,
    verifiedCtx.missionId,
    verifiedCtx.totalTargets,
  );

  const {
    statusMap: pointStatusMap,
    waitingForContinue: px4WaitingForContinue,
    currentPointIndex: px4CurrentPointIndex,
    missionTerminal: px4MissionTerminal,
    resetStatusMap: resetPointStatusMap,
    clearMissionTerminal,
  } = usePointMissionEvents(socket, connectionState);
  const {
    missionWaypoints,
    setMissionWaypoints,
    clearMissionWaypoints,
    missionMode,
    setMissionMode,
  } = useMission();
  const [mode, setMode] = useState<Mode>("AUTO");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [statusMap, setStatusMap] = useState<Record<number, WpStatus>>({});

  const [backendMission, setBackendMission] =
    useState<MissionRuntimeState | null>(null);

  const [canonicalMissionReport, setCanonicalMissionReport] =
    useState<CanonicalMissionReport | null>(null);

  /**
   * Temporary frontend fallback for terminal RPP accuracy.
   *
   * Key = waypoint serial number (1-based wp.sn).
   *
   * Once captured it NEVER follows live telemetry again.
   * The canonical Mission Report replaces it automatically
   * when report accuracy becomes available.
   */
  const [
    terminalRppAccuracyFallbackMap,
    setTerminalRppAccuracyFallbackMap,
  ] = useState<
    Record<
      number,
      TerminalRppAccuracySnapshot
    >
  >({});

  const terminalRppAccuracyFallbackRef =
    useRef<
      Record<
        number,
        TerminalRppAccuracySnapshot
      >
    >({});

  const clearTerminalRppAccuracyFallback =
    useCallback(() => {
      terminalRppAccuracyFallbackRef.current =
        {};

      setTerminalRppAccuracyFallbackMap(
        {},
      );
    }, []);

  const [trajectoryPoints, setTrajectoryPoints] = useState<LoadedPathPoint[]>(
    [],
  );

  // STATUS DOWNGRADE GUARD: Defines priority order — higher index = more "final"
  // Once a waypoint reaches 'completed' or 'skipped', backend events cannot regress it
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 0,
    loading: 1,
    reached: 2,
    passed: 2,
    spray_on: 3,
    spray_off: 3,
    marked: 3,
    completed: 4,
    skipped: 4,
    mission_end: 4,
  };

  /** Returns true if the incoming status would be a downgrade from the existing one */
  const isStatusDowngrade = (
    existingStatus: string | undefined,
    incomingStatus: string | undefined,
  ): boolean => {
    if (!existingStatus || !incomingStatus) return false;
    const existingPriority = STATUS_PRIORITY[existingStatus] ?? 0;
    const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
    return incomingPriority < existingPriority;
  };

  // Track screen readiness - prevents user actions until all components initialized
  const { isReady: screenReady } = useScreenReadiness(
    "mission-report-screen",
    "Mission Report Screen",
    async (setProgress) => {
      // No artificial delays — screen becomes ready as soon as async init completes
      setProgress(100, "Ready");
    },
    true, // critical
    [], // No dependencies
  );

  // Mission log persistence states
  const [previousMissionData, setPreviousMissionData] = useState<{
    waypoints: Waypoint[];
    statusMap: Record<number, WpStatus>;
    missionMode: string | null;
    startTime: Date | null;
    endTime: Date | null;
  } | null>(null);
  const [hasPendingMissionStart, setHasPendingMissionStart] = useState(false);
  const [notification, setNotification] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title?: string;
    message?: string;
  }>({ visible: false, type: "info", title: undefined, message: undefined });

  // Dialog states for mission upload workflow
  const [showAutoAssignDialog, setShowAutoAssignDialog] = useState(false);
  const [showWaypointPreviewDialog, setShowWaypointPreviewDialog] =
    useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isUploadingMission, setIsUploadingMission] = useState(false);

  // Mission completion dialog state
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showClearLogsDialog, setShowClearLogsDialog] = useState(false); // Post-export clear logs dialog
  const [missionStartTime, setMissionStartTime] = useState<Date | null>(null);
  const [missionEndTime, setMissionEndTime] = useState<Date | null>(null);
  const [isMissionActive, setIsMissionActive] = useState(false); // Track if mission is currently running
  const [waitingForManual, setWaitingForManual] = useState(false); // MANUAL mode: waiting for user to press NEXT

  // Skip audit / undo support
  type SkipAuditRecord = {
    id: string;
    skipFrom: number;
    skipTo: number;
    timestamp: string;
    previousStatuses: Record<number, WpStatus | null>;
    undone?: boolean;
    undoneAt?: string | null;
  };

  const [skipHistory, setSkipHistory] = useState<SkipAuditRecord[]>([]);
  const [undoPrompt, setUndoPrompt] = useState<{
    visible: boolean;
    id?: string | null;
  }>({ visible: false, id: null });
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isBottomTableExpanded, setIsBottomTableExpanded] = useState(false);

  const [robotPanelHeight, setRobotPanelHeight] = useState(0);

  const [missionProgressPanelHeight, setMissionProgressPanelHeight] =
    useState(0);

  const [systemPanelHeight, setSystemPanelHeight] = useState(0);
  const { panelVisibility, setPanelVisibility, setPanelVisible } =
    useMissionProgressOverlay();
  const {
    robotStatus: isRobotStatusVisible,
    missionProgress: isMissionProgressVisible,
    distanceToTarget: isDistanceToTargetVisible,
    accuracyMonitor: isAccuracyMonitorVisible,
    systemStatus: isSystemStatusVisible,
    missionControls: isMissionControlsVisible,
    bottom: isBottomTableVisible,
  } = panelVisibility;

  // RTK Injection overlay
  const [showRTKInjection, setShowRTKInjection] = useState(false);
  const [isQuickNtripStarting, setIsQuickNtripStarting] = useState(false);
  const [quickRtkState, setQuickRtkState] =
    useState<RtkHeadlineState>("off");
  const quickRtkStatusInFlightRef = useRef(false);
  const [isManualPreparing, setIsManualPreparing] = useState(false);
  const [isManualDriveVisible, setIsManualDriveVisible] = useState(false);
  const missionControlsRestoreRef = useRef(false);
  const joystickSwapActiveRef = useRef(false);

  const openManualDrivePanel = useCallback(() => {
    setPanelVisibility((prev) => {
      missionControlsRestoreRef.current = prev.missionControls;
      joystickSwapActiveRef.current = true;
      return prev.missionControls ? { ...prev, missionControls: false } : prev;
    });
    setIsManualDriveVisible(true);
  }, [setPanelVisibility]);

  const closeManualDrivePanel = useCallback(() => {
    setIsManualDriveVisible(false);
  }, []);

  useEffect(() => {
    if (isManualDriveVisible) return;
    if (!joystickSwapActiveRef.current) return;
    joystickSwapActiveRef.current = false;
    if (missionControlsRestoreRef.current) {
      setPanelVisible("missionControls", true);
    }
    missionControlsRestoreRef.current = false;
  }, [isManualDriveVisible, setPanelVisible]);

  useEffect(() => {
    if (isManualDriveVisible && isMissionControlsVisible) {
      setPanelVisible("missionControls", false);
    }
  }, [isManualDriveVisible, isMissionControlsVisible, setPanelVisible]);

  const openRTKInjection = () => setShowRTKInjection(true);
  const closeRTKInjection = () => setShowRTKInjection(false);

  // TRAIL DISABLED: Trail tracking for rover path visualization
  // const [trailPoints, setTrailPoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  // const MAX_TRAIL_POINTS = 500;

  // Ref to track notification timeout for cleanup
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mountedRef = useRef(true);

  // Use waypoints from shared context for persistence across screens
  const waypoints = missionWaypoints;
  const PINNED_COUNT = 4;
  const canonicalReportProjection = useMemo(
    () => projectBackendMissionReport(canonicalMissionReport),
    [canonicalMissionReport],
  );

  const px4LegacyStatusMap = useMemo(
    () =>
      buildLegacyStatusMapFromPointMap(pointStatusMap, waypoints, {
        hrms: telemetry.hrms,
        vrms: telemetry.vrms,
      }),
    [pointStatusMap, waypoints, telemetry.hrms, telemetry.vrms],
  );

  const verifiedLegacyMap = useMemo(
    () => verifiedProgressToLegacy(verifiedProgressMap),
    [verifiedProgressMap],
  );

  const effectiveStatusMap = useMemo(() => {
    const base = POINT_MISSION_ENABLED
      ? mergeLegacyStatusMap(statusMap, px4LegacyStatusMap)
      : statusMap;
    return verifiedCtx.isLoaded
      ? mergeLegacyStatusMap(base, verifiedLegacyMap)
      : base;
  }, [statusMap, px4LegacyStatusMap, verifiedLegacyMap, verifiedCtx.isLoaded]);

  /**
   * ============================================================
   * TERMINAL RPP ACCURACY FALLBACK
   * ============================================================
   *
   * pointStatusMap receives terminal state immediately from:
   *
   * - point_completed
   * - point_failed
   * - authoritative point_status snapshot reconciliation
   *
   * /api/mission/report may lag behind that terminal state.
   *
   * During that short gap, freeze the current RPP accuracy exactly
   * once for the point that just became terminal.
   *
   * IMPORTANT:
   *
   * This does NOT calculate accuracy.
   * It copies already-calculated backend/RPP telemetry.
   *
   * It also does NOT continuously follow telemetry after capture.
   */
  useEffect(() => {
    const currentPx4PointIndex =
      px4CurrentPointIndex;

    for (
      const [
        pointIndexText,
        entry,
      ] of Object.entries(
        pointStatusMap,
      )
    ) {
      const pointIndex =
        Number.parseInt(
          pointIndexText,
          10,
        );

      if (
        !Number.isInteger(
          pointIndex,
        )
        || pointIndex < 0
      ) {
        continue;
      }

      if (
        !isTerminalRppAccuracyStatus(
          entry.status,
        )
      ) {
        continue;
      }

      const serialNumber =
        pointIndexToSn(
          pointIndex,
          waypoints,
        );

      /*
       * Already frozen.
       *
       * Never update this value from later
       * live telemetry packets.
       */
      if (
        terminalRppAccuracyFallbackRef
          .current[
          serialNumber
        ]
      ) {
        continue;
      }

      const telemetryGoalNumber =
        Number(
          telemetry.accuracy
            ?.goal_number,
        );

      const telemetryActiveIndex =
        Number(
          telemetry.mission
            ?.active_point_index,
        );

      const telemetryActiveNumber =
        Number(
          telemetry.mission
            ?.active_point_number,
        );

      /*
       * Only capture telemetry belonging to
       * the terminal point.
       *
       * This prevents P1/P2/P3 from accidentally
       * receiving P4's final telemetry on reconnect.
       */
      const pointIdentityMatches =
        currentPx4PointIndex
          === pointIndex
        || (
          Number.isFinite(
            telemetryGoalNumber,
          )
          && Math.trunc(
            telemetryGoalNumber,
          ) === pointIndex + 1
        )
        || (
          Number.isFinite(
            telemetryActiveIndex,
          )
          && Math.trunc(
            telemetryActiveIndex,
          ) === pointIndex
        )
        || (
          Number.isFinite(
            telemetryActiveNumber,
          )
          && Math.trunc(
            telemetryActiveNumber,
          ) === pointIndex + 1
        );

      if (!pointIdentityMatches) {
        continue;
      }

      /*
       * Don't reconstruct historical terminal
       * accuracy from current rover position.
       *
       * Snapshot reconciliation normally happens
       * immediately, so five seconds gives enough
       * time for the telemetry packet to arrive.
       */
      const terminalTimeMs =
        Date.parse(
          entry.timestamp ?? "",
        );

      if (
        Number.isFinite(
          terminalTimeMs,
        )
        && Math.abs(
          Date.now()
          - terminalTimeMs
        ) > 5000
      ) {
        continue;
      }

      const snapshot =
        captureTerminalRppAccuracy(
          telemetry,
          pointIndex,
          entry.timestamp
            ?? new Date()
              .toISOString(),
        );

      if (!snapshot) {
        /*
         * Accuracy may arrive one telemetry packet
         * after the terminal status.
         *
         * Because this effect also depends on the
         * RPP telemetry fields below, it will retry
         * during the five-second capture window.
         */
        continue;
      }

      const next = {
        ...terminalRppAccuracyFallbackRef
          .current,
        [serialNumber]:
          snapshot,
      };

      terminalRppAccuracyFallbackRef.current =
        next;

      setTerminalRppAccuracyFallbackMap(
        next,
      );

      console.log(
        "[MissionReportScreen] Frozen terminal RPP accuracy",
        {
          pointIndex,
          serialNumber,

          status:
            entry.status,

          alongMm:
            snapshot
              .alongTrackErrorMm,

          crossMm:
            snapshot
              .crossTrackErrorMm,

          overallMm:
            snapshot
              .overallAccuracyMm,
        },
      );
    }
  }, [
    pointStatusMap,
    px4CurrentPointIndex,
    waypoints,

    telemetry.accuracy_available,

    telemetry.front_back_error_mm,
    telemetry.cross_track_error_mm,
    telemetry.radial_error_mm,

    telemetry.accuracy
      ?.front_back_error_mm,
    telemetry.accuracy
      ?.cross_track_error_mm,
    telemetry.accuracy
      ?.radial_error_mm,

    telemetry.accuracy
      ?.goal_number,

    telemetry.mission
      ?.active_point_index,

    telemetry.mission
      ?.active_point_number,
  ]);

  const telemetryMissionActive = useMemo(() => {
    const ms = String(telemetry.mission?.status ?? "").toLowerCase();
    return [
      "running",
      "paused",
      "waiting_for_next",
      "arming",
      "switching_offboard",
      "loading",
      "stopping",
    ].includes(ms);
  }, [telemetry.mission?.status]);

  const effectiveMissionActive = isMissionActive || telemetryMissionActive;

  const backendMissionState = String(backendMission?.state ?? "")
    .trim()
    .toUpperCase();

  /**
   * Live accuracy must depend on the backend mission state,
   * not the locally persisted isMissionActive value.
   */
  const accuracyMissionActive =
    telemetryMissionActive ||
    ["RUNNING", "PAUSED", "ARMING", "SWITCHING_OFFBOARD", "LOADING"].includes(
      backendMissionState,
    );

  const accuracyDataAvailable =
    connectionState === "connected" &&
    accuracyMissionActive &&
    telemetry.accuracy_available === true &&
    typeof telemetry.front_back_error_mm === "number" &&
    Number.isFinite(telemetry.front_back_error_mm) &&
    typeof telemetry.cross_track_error_mm === "number" &&
    Number.isFinite(telemetry.cross_track_error_mm);

  const overallAccuracyDataAvailable =
    connectionState === "connected" &&
    accuracyMissionActive &&
    telemetry.accuracy_available === true &&
    typeof telemetry.radial_error_mm === "number" &&
    Number.isFinite(telemetry.radial_error_mm);

  /**
   * Controls whether the main button displays
   * NO MISSION or START.
   */
  const hasUploadedMission = backendMission?.loaded === true;

  /**
   * AUTO and MANUAL are both autonomous OFFBOARD
   * mission execution modes.
   *
   * MANUAL means the backend waits for NEXT after
   * each completed marking point.
   */
  const canStartMission =
    connectionState === "connected" &&
    hasUploadedMission &&
    backendMission?.ready === true &&
    (mode === "AUTO" || mode === "MANUAL");

  const isBackendMissionPaused = backendMissionState === "PAUSED";

  const backendResumeAvailable = backendMission?.resume_available === true;

  const backendPauseReason =
    typeof backendMission?.pause_reason === "string"
      ? backendMission.pause_reason.trim().toUpperCase()
      : null;

  const backendRtkReason =
    typeof backendMission?.rtk_reason === "string"
      ? backendMission.rtk_reason
      : null;

  /**
   * Current marking-point index selected from
   * the currently active mission workflow.
   */
  const effectiveCurrentIndex = useMemo<number | null>(() => {
    /*
     * Canonical Mission Report active point
     * has first priority for the table.
     */
    if (canonicalReportProjection?.activeIndex != null) {
      return canonicalReportProjection.activeIndex;
    }

    if (verifiedCtx.isLoaded && verifiedTargetIndex !== null) {
      return verifiedTargetIndex;
    }

    if (POINT_MISSION_ENABLED && px4CurrentPointIndex !== null) {
      return px4CurrentPointIndex;
    }

    return currentIndex;
  }, [
    canonicalReportProjection,
    verifiedCtx.isLoaded,
    verifiedTargetIndex,
    px4CurrentPointIndex,
    currentIndex,
  ]);

  /**
   * Mission Report uses only stored waypoint results.
   *
   * Live rover-to-target distance is displayed separately
   * by DistanceToTargetCard and must not overwrite report accuracy.
   */
  const reportStatusMap = useMemo<Record<number, WpStatus>>(() => {
    const next: Record<number, WpStatus> = {};

    for (const waypoint of waypoints) {
      const reportRow =
        canonicalReportProjection
          ?.statusMap[
            waypoint.sn
          ];

      const runtimeRow =
        effectiveStatusMap[
          waypoint.sn
        ];

      const reconciledRow =
        reconcileMissionReportRow(
          reportRow,
          runtimeRow,
        );

      // DYX KEEP RPP ADD RAW LIVE
      //
      // Keep the original table contract:
      //   REMARK = RPP Along | Cross | Overall
      // Add only one independent column:
      //   RAW GNSS = CSV-vs-raw-GNSS radial/overall error
      //
      // No frontend accuracy calculation is performed.
      const pointId =
        `P${String(waypoint.sn).padStart(4, "0")}`;

      const canonicalPoint =
        canonicalMissionReport?.points
          ?.find(
            (point) =>
              Number(point.sequence) ===
              waypoint.sn,
          );

      /*
       * Fast final-point RPP fallback.
       *
       * rover_backend puts the exact terminal point result into
       * mission.point_results immediately when the point event arrives.
       * Use that stored RPP result while /api/mission/report catches up.
       * This is copy/format only; no accuracy is reconstructed.
       */
      const runtimePointResults =
        backendMission?.point_results;

      const runtimePointResult =
        runtimePointResults &&
        typeof runtimePointResults === "object"
          ? (
              runtimePointResults as Record<string, unknown>
            )[pointId]
          : undefined;

      const runtimePointAccuracy =
        runtimePointResult &&
        typeof runtimePointResult === "object"
          ? (
              runtimePointResult as {
                accuracy?: unknown;
                received_at?: unknown;
              }
            ).accuracy
          : undefined;

      const runtimeAccuracy =
        runtimePointAccuracy &&
        typeof runtimePointAccuracy === "object"
          ? runtimePointAccuracy as Record<string, unknown>
          : null;

      // DYX RAW GNSS SAME RPP POINT
      //
      // RPP and RAW GNSS now come from the SAME point_results[Pxxxx]
      // accuracy object. This prevents RAW GNSS from using a separately
      // indexed live snapshot while RPP is already tied to the exact point.
      //
      // No frontend geometry is calculated here.
      const runtimeSurveyCandidate =
        runtimeAccuracy?.survey;

      const reportSurveyCandidate =
        canonicalPoint
          ?.accuracy
          ?.survey;

      const surveySnapshot: RawGnssSurveySnapshot | null =
        runtimeSurveyCandidate &&
        typeof runtimeSurveyCandidate === "object"
          ? runtimeSurveyCandidate as RawGnssSurveySnapshot
          : reportSurveyCandidate &&
              typeof reportSurveyCandidate === "object"
            ? reportSurveyCandidate
            : null;

      // DYX FINAL POINT RUNTIME STATUS
      //
      // Use backend mission.point_results to promote the final table row
      // immediately while /api/mission/report is still catching up.
      // Only true final outcomes are mapped here.
      const runtimePointOutcome =
        runtimePointResult &&
        typeof runtimePointResult === "object"
          ? String(
              (
                runtimePointResult as {
                  point_outcome?: unknown;
                }
              ).point_outcome ?? "",
            )
              .trim()
              .toUpperCase()
          : "";

      const runtimeTerminalStatus:
        "completed" | "failed" | "skipped" | null =
        runtimePointOutcome === "COMPLETED"
          ? "completed"
          : runtimePointOutcome === "FAILED"
            ? "failed"
            : runtimePointOutcome === "SKIPPED"
              ? "skipped"
              : null;

      const runtimeReceivedAt =
        runtimePointResult &&
        typeof runtimePointResult === "object" &&
        typeof (
          runtimePointResult as {
            received_at?: unknown;
          }
        ).received_at === "string"
          ? (
              runtimePointResult as {
                received_at: string;
              }
            ).received_at
          : undefined;

      const runtimeTerminalRow =
        runtimeTerminalStatus !== null
          ? {
              reached:
                runtimeTerminalStatus === "completed" ||
                runtimeTerminalStatus === "failed",

              marked:
                runtimeTerminalStatus === "completed",

              status:
                runtimeTerminalStatus,

              timestamp:
                runtimeReceivedAt,
            }
          : undefined;

      const displayRow =
        runtimeTerminalRow
          ? reconcileMissionReportRow(
              reconciledRow ?? undefined,
              runtimeTerminalRow,
            )
          : reconciledRow;

      const runtimeAlong =
        typeof runtimeAccuracy?.along_track_error_mm === "number" &&
        Number.isFinite(runtimeAccuracy.along_track_error_mm)
          ? runtimeAccuracy.along_track_error_mm
          : null;

      const runtimeCross =
        typeof runtimeAccuracy?.cross_track_error_mm === "number" &&
        Number.isFinite(runtimeAccuracy.cross_track_error_mm)
          ? runtimeAccuracy.cross_track_error_mm
          : null;

      const runtimeOverall =
        typeof runtimeAccuracy?.overall_accuracy_mm === "number" &&
        Number.isFinite(runtimeAccuracy.overall_accuracy_mm)
          ? runtimeAccuracy.overall_accuracy_mm
          : null;

      const runtimeRppFallback:
        TerminalRppAccuracySnapshot | undefined =
        runtimeAccuracy?.measurement_source ===
          "RPP_TERMINAL_RESULT" &&
        runtimeAccuracy.available === true &&
        runtimeAlong !== null &&
        runtimeCross !== null &&
        runtimeOverall !== null
          ? {
              pointIndex: waypoint.sn - 1,
              alongTrackErrorMm: runtimeAlong,
              crossTrackErrorMm: runtimeCross,
              overallAccuracyMm: runtimeOverall,
              capturedAt: new Date().toISOString(),
            }
          : undefined;

      const rppFallback =
        terminalRppAccuracyFallbackMap[waypoint.sn]
        ?? runtimeRppFallback;

      if (displayRow) {
        next[waypoint.sn] = {
          reached:
            displayRow.reached,

          marked:
            displayRow.marked,

          status:
            displayRow.status,

          timestamp:
            displayRow.timestamp,

          // Restore original RPP table output exactly:
          // Along ... | Cross ... | Overall ...
          remark:
            selectMissionReportRemark(
              displayRow.remark,
              rppFallback,
            ),

          // Independent RAW GNSS value for the new column only.
          survey:
            surveySnapshot,
        };

        continue;
      }

      /*
       * No canonical row yet. A terminal RPP fallback may already exist,
       * especially for the final point while the report is checkpointing.
       */
      next[waypoint.sn] = {
        reached: false,
        marked: false,

        status: "pending",

        remark:
          selectMissionReportRemark(
            null,
            rppFallback,
          ),

        survey:
          surveySnapshot,
      };
    }

    return next;
  }, [
    waypoints,
    canonicalReportProjection,
    canonicalMissionReport,
    backendMission?.point_results,
    effectiveStatusMap,
    terminalRppAccuracyFallbackMap,
  ]);

  const effectiveWaitingForManual =
    backendMissionState === "WAITING_FOR_NEXT" ||
    String(telemetry.mission?.status ?? "")
      .trim()
      .toUpperCase() === "WAITING_FOR_NEXT" ||
    waitingForManual ||
    px4WaitingForContinue ||
    (verifiedCtx.isLoaded && verifiedWaiting);

  // Check if showing previous mission data
  const isShowingPreviousMission =
    previousMissionData &&
    !isMissionActive &&
    Object.keys(statusMap).length === 0;

  // Refs to store latest values for mission event handler (prevents stale closures)
  const waypointsRef = useRef(waypoints);
  const statusMapRef = useRef(statusMap);
  const reportStatusMapRef = useRef<Record<number, WpStatus>>({});
  const missionStartTimeRef = useRef(missionStartTime);
  const missionEndTimeRef = useRef(missionEndTime);
  const isMissionActiveRef = useRef(isMissionActive);
  const modeRef = useRef(mode);
  const missionModeRef = useRef(missionMode);
  const telemetryRef = useRef(telemetry);

  // Keep refs in sync with state
  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  useEffect(() => {
    reportStatusMapRef.current = reportStatusMap;
  }, [reportStatusMap]);

  useEffect(() => {
    missionStartTimeRef.current = missionStartTime;
  }, [missionStartTime]);

  useEffect(() => {
    missionEndTimeRef.current = missionEndTime;
  }, [missionEndTime]);

  useEffect(() => {
    isMissionActiveRef.current = isMissionActive;
  }, [isMissionActive]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    missionModeRef.current = missionMode;
  }, [missionMode]);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  const showNotification = (
    type: "success" | "error" | "info",
    title: string,
    message?: string,
    duration = 3000,
  ) => {
    // Clear any existing notification timeout to prevent memory leaks
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    setNotification({ visible: true, type, title, message });
    notificationTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setNotification((prev) => ({ ...prev, visible: false }));
      }
      notificationTimeoutRef.current = null;
    }, duration);
  };

  const refreshBackendMission = useCallback(async (): Promise<void> => {
    if (isOfflineMode()) {
      return;
    }

    try {
      const response = await getMissionStatus();

      if (!response?.success || !response?.mission) {
        return;
      }

      const mission = response.mission;

      setBackendMission(mission);

      const state = String(mission.state ?? "")
        .trim()
        .toUpperCase();

      const executionMode = String(mission.execution_mode ?? "")
        .trim()
        .toUpperCase();

      /*
       * Keep AUTO/MANUAL UI synchronized with mission_manager.
       */
      if (executionMode === "AUTO" || executionMode === "MANUAL") {
        setMode(executionMode);
      }

      /*
       * MANUAL mission waits here after finishing one marking point.
       */
      setWaitingForManual(state === "WAITING_FOR_NEXT");

      /*
       * Backend is the source of truth for whether the mission
       * is currently active.
       */
      if (
        state === "RUNNING" ||
        state === "PAUSED" ||
        state === "WAITING_FOR_NEXT"
      ) {
        setIsMissionActive(true);
      } else if (
        state === "READY" ||
        state === "PREPARING" ||
        state === "EMPTY" ||
        state === "COMPLETED" ||
        state === "ERROR"
      ) {
        setIsMissionActive(false);
      }

      // console.log("[MissionReportScreen] Backend mission:", {
      //   state,
      //   loaded: mission.loaded,
      //   ready: mission.ready,
      //   executionMode,
      //   navigationPoints: mission.navigation_point_count,
      // });
    } catch (error) {
      /*
       * IMPORTANT:
       * Do not erase the previous valid mission state because one
       * 500 ms status request failed.
       *
       * connectionState already handles actual disconnection.
       */
      console.warn(
        "[MissionReportScreen] Mission status refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const refreshCanonicalMissionReport = useCallback(async (): Promise<void> => {
    if (isOfflineMode()) {
      return;
    }

    try {
      const response = await getMissionReport();

      if (!response?.success) {
        return;
      }

      if (response.available === true && response.report) {
        setCanonicalMissionReport(response.report);
      } else {
        setCanonicalMissionReport(null);
      }
    } catch (error) {
      /*
       * Do not destroy the last valid
       * report because one request failed.
       */
      console.warn(
        "[MissionReportScreen] " + "Mission report refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const refreshTrajectoryPreview = useCallback(async (): Promise<boolean> => {
    if (isOfflineMode()) {
      return false;
    }

    try {
      const response = await getLoadedMissionPath();

      if (!response?.success) {
        return false;
      }

      /**
       * Map display uses only authoritative geographic coordinates produced
       * by rover_backend from PX4 gp_origin. Local ENU x/y remain backend
       * diagnostics and are never reprojected by the frontend.
       */
      const validPoints = Array.isArray(response.points)
        ? response.points.filter(
            (
              point,
            ): point is LoadedPathPoint & {
              latitude: number;
              longitude: number;
            } =>
              typeof point.latitude === "number" &&
              Number.isFinite(point.latitude) &&
              point.latitude >= -90 &&
              point.latitude <= 90 &&
              typeof point.longitude === "number" &&
              Number.isFinite(point.longitude) &&
              point.longitude >= -180 &&
              point.longitude <= 180,
          )
        : [];

      /**
       * Do not erase an existing fixed path because one preview read is early.
       * The lifecycle effect retries until the already-generated backend path
       * contains at least two geographic points.
       */
      if (
        Number(response.navigation_point_count ?? 0) < 2 ||
        validPoints.length < 2
      ) {
        console.warn(
          "[MissionReportScreen] Fixed trajectory preview not ready yet:",
          {
            navigationPoints: response.navigation_point_count,
            projectedPoints: validPoints.length,
            frameId: response.frame_id,
          },
        );
        return false;
      }

      setTrajectoryPoints(validPoints);

      const firstPoint = validPoints[0];
      const lastPoint = validPoints[validPoints.length - 1];

      console.log("[MissionReportScreen] Fixed P1->Pn trajectory displayed:", {
        frameId: response.frame_id,
        displayedPoints: validPoints.length,
        totalPoints: response.navigation_point_count,
        previewTruncated: response.preview_truncated,
        firstGps: {
          latitude: firstPoint.latitude,
          longitude: firstPoint.longitude,
        },
        lastGps: {
          latitude: lastPoint.latitude,
          longitude: lastPoint.longitude,
        },
      });

      return true;
    } catch (error) {
      console.warn(
        "[MissionReportScreen] Generated trajectory unavailable; will retry:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }, []);

  /*
   * ============================================================
   * MISSION STATUS SYNCHRONIZATION
   * ============================================================
   *
   * LOAD MISSION is asynchronous:
   *
   * PREPARING
   *   ↓
   * trajectory_generator READY
   *   ↓
   * mission_manager accepts complete trajectory
   *   ↓
   * READY
   *
   * Therefore Mission Report must continue checking state instead
   * of reading it only once.
   */
  useEffect(() => {
    if (!isVisible || connectionState !== "connected" || isOfflineMode()) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const pollMission = async () => {
      if (cancelled || requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        await refreshBackendMission();
      } finally {
        requestInFlight = false;
      }
    };

    /*
     * Immediate read when opening Mission Report.
     */
    void pollMission();

    /*
     * Continue synchronizing.
     *
     * Fast operator display refresh.
     * Backend already owns the data; this only shortens UI observation latency.
     */
    const timer = setInterval(() => {
      void pollMission();
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isVisible, connectionState, refreshBackendMission]);

  /*
   * ============================================================
   * CANONICAL MISSION REPORT SYNCHRONIZATION
   * ============================================================
   *
   * Mission Report point status + terminal
   * RPP accuracy comes only from:
   *
   * GET /api/mission/report
   */
  useEffect(() => {
    if (!isVisible || connectionState !== "connected" || isOfflineMode()) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const pollReport = async () => {
      if (cancelled || requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        await refreshCanonicalMissionReport();
      } finally {
        requestInFlight = false;
      }
    };

    /*
     * Immediate first request.
     */
    void pollReport();

    /*
     * Keep terminal RPP/report rows close to live runtime state.
     * The in-flight guard prevents overlapping requests.
     */
    const timer = setInterval(() => {
      void pollReport();
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isVisible, connectionState, refreshCanonicalMissionReport]);

  /*
   * ============================================================
   * FIXED GENERATED TRAJECTORY DISPLAY
   * ============================================================
   *
   * LOAD owns the fixed surveyed P1->Pn trajectory.
   *
   * trajectory_ready is the DISPLAY gate.
   * mission-manager READY remains the START gate.
   *
   * RPP's temporary current C->P1 runtime entry path is intentionally
   * separate and must never replace or re-anchor this displayed path.
   */
  useEffect(() => {
    if (
      !isVisible ||
      connectionState !== "connected" ||
      isOfflineMode()
    ) {
      return;
    }

    const navigationPointCount = Number(
      backendMission?.navigation_point_count ?? 0,
    );

    /*
     * No stored mission means there is no fixed trajectory to display.
     */
    if (backendMission?.loaded !== true) {
      setTrajectoryPoints([]);
      return;
    }

    /*
     * While a new mission is being generated, trajectory_ready is false.
     * The Jetson lifecycle patch will explicitly reset it at each LOAD.
     */
    if (backendMission?.trajectory_ready !== true) {
      setTrajectoryPoints([]);
      return;
    }

    if (
      !Number.isFinite(navigationPointCount) ||
      navigationPointCount < 2
    ) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadFixedTrajectory = async (): Promise<void> => {
      if (cancelled || requestInFlight) {
        return;
      }

      requestInFlight = true;
      let displayed = false;

      try {
        displayed = await refreshTrajectoryPreview();
      } finally {
        requestInFlight = false;
      }

      if (cancelled || displayed) {
        return;
      }

      /*
       * Retry only the REST preview read.
       * This NEVER regenerates or changes P1->Pn geometry.
       */
      retryTimer = setTimeout(() => {
        void loadFixedTrajectory();
      }, 500);
    };

    void loadFixedTrajectory();

    return () => {
      cancelled = true;

      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    isVisible,
    connectionState,

    backendMission?.mission_id,
    backendMission?.loaded,
    backendMission?.trajectory_ready,
    backendMission?.navigation_point_count,

    refreshTrajectoryPreview,
  ]);

  const refreshQuickNtripStatus = useCallback(async () => {
    if (connectionState !== "connected") {
      setQuickRtkState("rover_offline");
      return;
    }

    if (quickRtkStatusInFlightRef.current) {
      return;
    }

    quickRtkStatusInFlightRef.current = true;

    try {
      const response = await getRtkStatus();
      const view = toRtkControlView(response, { connected: true });
      setQuickRtkState(view.headline);
    } catch {
      setQuickRtkState("rover_offline");
    } finally {
      quickRtkStatusInFlightRef.current = false;
    }
  }, [connectionState]);

  useEffect(() => {
    if (
      !isVisible ||
      connectionState !== "connected" ||
      showRTKInjection
    ) {
      return undefined;
    }

    void refreshQuickNtripStatus();

    const timer = setInterval(() => {
      void refreshQuickNtripStatus();
    }, 3000);

    return () => clearInterval(timer);
  }, [
    connectionState,
    isVisible,
    refreshQuickNtripStatus,
    showRTKInjection,
  ]);

  const handleQuickStartNtrip = async () => {
    if (isQuickNtripStarting) return;

    setIsQuickNtripStarting(true);

    try {
      const response = await getRtkStatus();
      const view = toRtkControlView(response, {
        connected: connectionState === "connected",
      });

      setQuickRtkState(view.headline);

      const decision = decideMissionRtkQuickStart({
        connected: connectionState === "connected",
        activeProfileId: view.activeProfileId,
      });

      if (decision === "offline") {
        Alert.alert(
          "Rover Offline",
          "Connect to the rover before starting RTK.",
        );
        return;
      }

      if (decision === "open_config") {
        openRTKInjection();
        return;
      }

      // A running/transitional/error lifecycle is status-only here.
      // Mission Progress must never issue a duplicate start.
      if (!view.canStart) {
        return;
      }

      const intent = await startRtk();

      if (intent.persisted.desired_state === "RUNNING") {
        setQuickRtkState("start_requested");
      }

      showNotification(
        "success",
        "RTK Start Requested",
        intent.message ||
          "Desired RUNNING accepted. Waiting for backend status.",
      );
    } catch (err) {
      const message = getRtkFailureMessage(err, "Failed to start RTK.");
      showNotification("error", "RTK Start Failed", message, 5000);
      Alert.alert("RTK Start Failed", message);
    } finally {
      setIsQuickNtripStarting(false);
      void refreshQuickNtripStatus();
    }
  };

  const handleOpenManualDrive = async () => {
    if (isManualPreparing) return;

    if (JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS && isOfflineMode()) {
      openManualDrivePanel();
      return;
    }

    setIsManualPreparing(true);
    try {
      const currentMode = String(telemetry.state?.mode || "").toUpperCase();
      if (currentMode !== "MANUAL") {
        console.log(
          "[ManualDrive] Setting mode to MANUAL from",
          currentMode || "UNKNOWN",
        );
        const modeResponse = await setManualMode();
        if (!modeResponse.success) {
          const message =
            modeResponse.message || "Unable to switch vehicle to MANUAL mode.";
          showNotification("error", "Manual Mode Failed", message, 5000);
          Alert.alert("Manual Mode Failed", message);
          return;
        }
      }

      if (!telemetry.state?.armed) {
        console.log("[ManualDrive] Arming vehicle before opening joystick");
        const armResponse = await armVehicle();
        if (!armResponse.success) {
          const message = armResponse.message || "Unable to arm vehicle.";
          showNotification("error", "Arm Failed", message, 5000);
          Alert.alert("Arm Failed", message);
          return;
        }
      }

      openManualDrivePanel();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to prepare manual control.";
      console.error("[ManualDrive] Prepare failed", err);
      showNotification("error", "Manual Control Failed", message, 5000);
      Alert.alert("Manual Control Failed", message);
    } finally {
      setIsManualPreparing(false);
    }
  };

  // Check for missing Block/Row/Pile fields in waypoints
  const checkMissingFields = (): string[] => {
    const missing: string[] = [];
    let hasRow = false;
    let hasBlock = false;
    let hasPile = false;

    waypoints.forEach((wp) => {
      if (wp.row) hasRow = true;
      if (wp.block) hasBlock = true;
      if (wp.pile) hasPile = true;
    });

    if (!hasRow) missing.push("Row");
    if (!hasBlock) missing.push("Block");
    if (!hasPile) missing.push("Pile");

    return missing;
  };

  // Auto-assign sequence numbers to missing fields
  const handleAutoAssignSequence = () => {
    setShowAutoAssignDialog(false);

    try {
      const updatedWaypoints = waypoints.map((wp, idx) => ({
        ...wp,
        row: wp.row || `R${idx + 1}`,
        block: wp.block || "B1",
        pile: wp.pile || `${idx + 1}`,
      }));

      setMissionWaypoints(updatedWaypoints);
      showNotification(
        "success",
        "Success",
        "Sequence numbers auto-assigned successfully!",
      );

      // Show preview dialog after auto-assignment
      const previewTimer = setTimeout(() => {
        if (mountedRef.current) {
          setShowWaypointPreviewDialog(true);
        }
      }, 100);

      // Cleanup timer (though component should be mounted, this is defensive)
      return () => clearTimeout(previewTimer);
    } catch (error) {
      console.error("[MissionReportScreen] Auto-assign error:", error);
      showNotification(
        "error",
        "Error",
        "Failed to auto-assign sequence numbers",
      );
    }
  };

  // Proceed without auto-assignment
  const handleProceedWithoutAssign = () => {
    setShowAutoAssignDialog(false);
    setShowWaypointPreviewDialog(true);
  };

  // Confirm and upload mission to controller (verified 4WD flow)
  const handleConfirmUpload = async () => {
    setShowWaypointPreviewDialog(false);
    setIsUploadingMission(true);

    try {
      console.log("[MissionReportScreen] Uploading verified mission...");

      // Map Waypoint[] → PathPlanWaypoint[] for the verified upload hook.
      const pathPlanWps = waypoints.map((wp) => ({
        id: wp.sn,
        lat: wp.lat,
        lon: wp.lon,
        alt: wp.alt,
        row: wp.row,
        block: wp.block,
        pile: wp.pile,
        distance: wp.distance,
        mark: wp.mark,
      }));

      const result = await uploadVerifiedWaypoints(pathPlanWps, {
        requireMark: true, // confirmed: 4WD_SERVER requires mark on every waypoint
      });

      if (result.success) {
        console.log("[MissionReportScreen] Mission uploaded successfully");
        // PersistentStorage clearing is handled inside useVerifiedMissionUpload.
        setIsMissionActive(false);
        setStatusMap({});
        setMissionStartTime(null);
        setMissionEndTime(null);
        setCurrentIndex(null);
        // Defensive redundancy: the progress hook also resets on mission-id
        // change, but clear here too so a replacement upload can never show the
        // previous mission's target progress.
        resetVerifiedProgress();
        clearVerifiedTerminal();
        showNotification(
          "success",
          "Success",
          "Mission uploaded successfully!",
        );

        await refreshBackendMission();
        await refreshTrajectoryPreview();
      } else {
        console.error("[MissionReportScreen] Upload failed:", result.message);
        showNotification(
          "error",
          "Upload Failed",
          result.message ?? "Failed to upload mission",
        );
      }
    } catch (error) {
      console.error("[MissionReportScreen] Upload Error:", error);
      showNotification("error", "Error", "Failed to upload mission");
    } finally {
      setIsUploadingMission(false);
    }
  };

  // Debug waypoints setup
  React.useEffect(() => {
    missionLog("[MissionReportScreen] Waypoints updated:", {
      count: waypoints.length,
      waypoints: waypoints.map((wp) => ({ sn: wp.sn, status: wp.status })),
    });
  }, [waypoints]);

  // Debug current waypoint tracking
  React.useEffect(() => {
    const currentWaypointNumber =
      currentIndex !== null ? currentIndex + 1 : null;
    missionLog("[MissionReportScreen] Current waypoint tracking:", {
      currentIndex,
      currentWaypointNumber,
      waypoints_count: waypoints.length,
      target_waypoint: currentWaypointNumber
        ? waypoints.find((wp) => wp.sn === currentWaypointNumber)
        : null,
    });
  }, [currentIndex, waypoints]);

  // LIVE UPDATE FIX: Fetch fresh statusMap when component mounts or focus returns (handles tab switching)
  // This ensures table shows live data instead of stale/memorized data
  useEffect(() => {
    console.log(
      "[MissionReportScreen] 🔄 Component mounted/focused - verifying live data",
    );
    // StatusMap is updated via real-time socket events
    // No explicit fetch needed - socket listener will update it
    // This useEffect serves as a lifecycle marker for debugging
  }, []);

  // STALE STATUS CLEANUP: Clear old waypoint statuses that are no longer current
  // When rover moves from point 5 to point 9, clear marks from points that won't be revisited
  useEffect(() => {
    if (!isMissionActive || waypoints.length === 0 || currentIndex === null)
      return;

    // Only clean up old statuses during active missions
    const currentWaypointSn = currentIndex + 1; // Convert 0-based index to 1-based SN

    // Use ref to read latest statusMap without it being a dependency (prevents self-triggering loop)
    const currentStatusMap = statusMapRef.current;
    const newStatusMap = { ...currentStatusMap };
    let hasChanges = false;

    Object.keys(currentStatusMap).forEach((snStr) => {
      const sn = parseInt(snStr, 10);
      const status = currentStatusMap[sn];

      // Keep statuses that are completed or skipped (mission history)
      if (status?.status === "completed" || status?.status === "skipped") {
        return; // Keep this entry
      }

      // Only clean up 'loading' status for waypoints that are no longer current
      // IMPORTANT: Never delete 'reached' or 'marked' — waypoint_marked fires AFTER currentIndex
      // advances, so deleting 'reached' before 'waypoint_marked' arrives loses accuracy data
      if (sn !== currentWaypointSn && sn !== currentWaypointSn + 1) {
        if (status?.status === "loading") {
          delete newStatusMap[sn];
          hasChanges = true;
          console.log(
            `[MissionReportScreen] 🗑️ Cleaned up stale "loading" status for waypoint ${sn}`,
          );
        }
      }
    });

    // Update statusMap only if we removed old statuses
    if (hasChanges) {
      setStatusMap(newStatusMap);
    }
  }, [currentIndex, isMissionActive, waypoints]);

  // PRESERVE STATUS ON MISSION COMPLETION: Keep statusMap after mission ends for export and review
  // Previously this was clearing statusMap, but that prevented proper export of skipped waypoints
  // The statusMap should only be cleared when a new mission is started or user manually clears data
  useEffect(() => {
    // This effect is intentionally disabled - statusMap is preserved after mission completion
    // It will be cleared when:
    // 1. New mission is started (handleStartMission clears it)
    // 2. User manually clears mission data
    // 3. Mission is uploaded (PathPlanScreen clears it)
  }, []);

  const handleReorder = (fromIndex: number, direction: "up" | "down") => {
    // Only allow reordering of indices >= PINNED_COUNT and keep them >= PINNED_COUNT
    if (fromIndex < PINNED_COUNT) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < PINNED_COUNT || toIndex >= waypoints.length) return;
    const next = waypoints.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    // Recompute S/N if desired (optional)
    setMissionWaypoints(next.map((wp, i) => ({ ...wp, sn: i + 1 })));
  };

  // Depend on individual primitive fields, not the full telemetry object.
  // telemetry is a new object reference every 50ms (from useRoverTelemetry),
  // so [telemetry] never actually caches. Primitives only change when values change.
  const vehicleStatus = useMemo((): VehicleStatus => {
    // Handle hrms/vrms as strings or numbers (backend sends strings currently)
    const hrmsValue =
      typeof telemetry.hrms === "string"
        ? parseFloat(telemetry.hrms)
        : telemetry.hrms;
    const vrmsValue =
      typeof telemetry.vrms === "string"
        ? parseFloat(telemetry.vrms)
        : telemetry.vrms;

    const gpsLabel =
      telemetry.gps_fix_name?.trim() || getFixTypeLabel(telemetry.rtk.fix_type);

    const rppLabel = telemetry.rpp_state_name?.trim();

    return {
      battery: `${telemetry.battery.percentage.toFixed(1)}% (${telemetry.battery.voltage.toFixed(2)}V)`,
      gps: gpsLabel,
      satellites: telemetry.global.satellites_visible,
      hrms: `${(hrmsValue || 0).toFixed(3)} m`,
      vrms: `${(vrmsValue || 0).toFixed(3)} m`,
      imu: rppLabel ? `RPP ${rppLabel}` : telemetry.imu_status,
      mode: telemetry.state?.mode || "UNKNOWN",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    telemetry.battery.percentage,
    telemetry.battery.voltage,
    telemetry.rtk.fix_type,
    telemetry.global.satellites_visible,
    telemetry.hrms,
    telemetry.vrms,
    telemetry.imu_status,
    telemetry.gps_fix_name,
    telemetry.rpp_state_name,
    telemetry.state?.mode,
  ]);

  useEffect(() => {
    if (!isRobotStatusDebugEnabled()) return;
    patchRobotStatusDebug({
      uiStatus: vehicleStatus,
      uiConnected:
        connectionState === "connected" && telemetry.fcu_connected !== false,
      lastMessageTs: telemetry.lastMessageTs,
    });
  }, [
    vehicleStatus,
    connectionState,
    telemetry.fcu_connected,
    telemetry.lastMessageTs,
  ]);

  // Depend on individual primitive fields, not the full telemetry/roverPosition objects.
  // These objects are new references every 50ms, so the memo would never cache.
  const mapProps = useMemo(() => {
    const props = {
      roverLat: roverPosition?.lat ?? 0,
      roverLon: roverPosition?.lng ?? 0,
      heading: telemetry.attitude?.yaw_deg ?? null,
      armed: telemetry.state?.armed ?? false,
      rtkFixType: telemetry.rtk?.fix_type ?? 0,
    };

    // Debug log map props updates (10% sample rate)
    if (DEBUG_MISSION_LOGS && Math.random() < 0.1) {
      missionLog("[MissionReportScreen] ✦ Map props updated:", {
        lat: props.roverLat.toFixed(7),
        lon: props.roverLon.toFixed(7),
        heading:
          props.heading !== null ? props.heading.toFixed(1) + "°" : "N/A",
        armed: props.armed,
        rtkFixType: props.rtkFixType,
      });
    }

    return props;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roverPosition?.lat,
    roverPosition?.lng,
    telemetry.attitude?.yaw_deg,
    telemetry.state?.armed,
    telemetry.rtk?.fix_type,
  ]);

  const missionProgressStats = useMemo(() => {
    const totalPoints = waypoints.length;

    if (totalPoints === 0) {
      return {
        markedPoints: 0,
        currentPoint: 0,
        totalPoints: 0,
      };
    }

    const markedPoints = waypoints.reduce((count, waypoint) => {
      const pointStatus = effectiveStatusMap[waypoint.sn]?.status;

      const isMarked = pointStatus === "completed" || pointStatus === "marked";

      return isMarked ? count + 1 : count;
    }, 0);

    const safeMarkedPoints = Math.min(markedPoints, totalPoints);

    if (safeMarkedPoints >= totalPoints) {
      return {
        markedPoints: totalPoints,
        currentPoint: totalPoints,
        totalPoints,
      };
    }

    const currentFromBackend =
      effectiveCurrentIndex !== null && effectiveCurrentIndex >= 0
        ? effectiveCurrentIndex + 1
        : 1;

    const currentFromMarked = safeMarkedPoints + 1;

    const currentPoint = Math.min(
      totalPoints,
      Math.max(1, currentFromBackend, currentFromMarked),
    );

    return {
      markedPoints: safeMarkedPoints,
      currentPoint,
      totalPoints,
    };
  }, [waypoints, effectiveStatusMap, effectiveCurrentIndex]);

  // Automatically derive currentIndex from statusMap to keep UI in sync
  // This fixes the issue where currentIndex gets stuck even though statusMap updates correctly
  useEffect(() => {
    if (POINT_MISSION_ENABLED) return;
    if (waypoints.length === 0 || !isMissionActive) return;

    // Find the first waypoint that is NOT completed or skipped
    // This represents the current active waypoint
    let derivedIndex: number | null = null;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const wpStatus = statusMap[wp.sn];

      // If no status exists, this is the current waypoint (not yet reached)
      if (!wpStatus) {
        derivedIndex = i;
        break;
      }

      // If status is not completed/skipped, this is the current waypoint
      if (wpStatus.status !== "completed" && wpStatus.status !== "skipped") {
        derivedIndex = i;
        break;
      }
    }

    // If all waypoints are completed/skipped, set to null (mission complete)
    if (derivedIndex === null && waypoints.length > 0) {
      const allCompleted = waypoints.every((wp) => {
        const wpStatus = statusMap[wp.sn];
        return (
          wpStatus &&
          (wpStatus.status === "completed" || wpStatus.status === "skipped")
        );
      });

      if (!allCompleted) {
        // Mission not started yet, keep currentIndex as is
        return;
      }
    }

    // Only update if the derived index is different from current
    setCurrentIndex((prev) => {
      if (prev !== derivedIndex) {
        // Forward-guard: do not advance past a non-terminal waypoint
        // This mirrors the guard in the socket event handler (lines 1828-1837)
        if (derivedIndex !== null && prev !== null && derivedIndex > prev) {
          const leavingWp = waypoints[prev];
          if (leavingWp) {
            const leavingStatus = statusMap[leavingWp.sn];
            if (
              !leavingStatus ||
              (leavingStatus.status !== "completed" &&
                leavingStatus.status !== "skipped")
            ) {
              // The waypoint we're leaving is not yet terminal — hold position
              return prev;
            }
          }
        }
        missionLog(
          `[MissionReportScreen] 🔄 Auto-derived currentIndex from statusMap: ${prev} -> ${derivedIndex} (waypoint #${derivedIndex !== null ? derivedIndex + 1 : "null"})`,
        );
        return derivedIndex;
      }
      return prev;
    });
  }, [statusMap, waypoints, isMissionActive]);

  // Separate effect to handle mission completion detection without circular dependencies
  // Using refs to avoid infinite loops - only triggers when currentIndex becomes null
  useEffect(() => {
    // Check for mission completion: currentIndex is null, all waypoints completed, and mission is active
    if (
      currentIndex === null &&
      waypointsRef.current.length > 0 &&
      isMissionActiveRef.current
    ) {
      const allCompleted = waypointsRef.current.every((wp) => {
        const wpStatus = statusMapRef.current[wp.sn];
        return (
          wpStatus &&
          (wpStatus.status === "completed" || wpStatus.status === "skipped")
        );
      });

      if (allCompleted && !missionEndTimeRef.current) {
        console.log(
          "[MissionReportScreen] 🏁 Mission completion detected - all waypoints processed!",
        );

        // Set mission start time if not set (fallback)
        if (!missionStartTimeRef.current) {
          console.log(
            "[MissionReportScreen] ⚠️ Mission start time missing, using fallback (1 minute ago)",
          );
          setMissionStartTime(new Date(Date.now() - 60000));
        }

        const completionTime = new Date();
        setMissionEndTime(completionTime);

        // CRITICAL: Mark mission as inactive to reset START/STOP button
        setIsMissionActive(false);
        console.log(
          "[MissionReportScreen] ✅ isMissionActive set to false - button should reset to START",
        );

        // Preserve mission data for export access
        preserveCurrentMission.current();

        // Show completion notification
        showNotification(
          "success",
          "Mission Completed",
          "All marking points have been processed!",
        );

        // Show completion dialog after a brief delay to ensure UI updates
        const completionTimer = setTimeout(() => {
          if (mountedRef.current) {
            setShowCompletionDialog(true);
          }
        }, 1000);

        // Cleanup timer on unmount or re-run
        return () => clearTimeout(completionTimer);
      }
    }
  }, [currentIndex]);

  // TRAIL DISABLED: WEB APP STYLE: Trail system with timestamps, fading, and smart filtering
  // const trailPointsRef = useRef<Array<{lat: number, lng: number, timestamp: number}>>([]);
  // const lastTrailUpdateRef = useRef<number>(0);
  // const TRAIL_UPDATE_THROTTLE_MS = 100; // Update every 100ms like web app
  // const MIN_TRAIL_DISTANCE_M = 1.5; // Minimum distance between permanent points
  // const TRAIL_FADE_START_SEC = 15; // Start fading after 15 seconds
  // const TRAIL_MAX_AGE_SEC = 30; // Remove points older than 30 seconds

  // TRAIL DISABLED: Update trail when rover position changes (web app style)
  // useEffect(() => {
  //   if (roverPosition && roverPosition.lat && roverPosition.lng) {
  //     const now = Date.now();
  //
  //     // Smart trail filtering with Haversine distance calculation
  //     const shouldAddTrailPoint = (() => {
  //       if (trailPointsRef.current.length === 0) return true;
  //
  //       const lastPoint = trailPointsRef.current[trailPointsRef.current.length - 1];
  //       const timeSinceLastPoint = now - lastTrailUpdateRef.current;
  //
  //       if (timeSinceLastPoint < TRAIL_UPDATE_THROTTLE_MS) return false;
  //
  //       // Haversine distance calculation (meters)
  //       const R = 6371000; // Earth radius in meters
  //       const lat1 = lastPoint.lat * Math.PI / 180;
  //       const lat2 = roverPosition.lat * Math.PI / 180;
  //       const deltaLat = (roverPosition.lat - lastPoint.lat) * Math.PI / 180;
  //       const deltaLng = (roverPosition.lng - lastPoint.lng) * Math.PI / 180;
  //
  //       const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
  //                Math.cos(lat1) * Math.cos(lat2) *
  //                Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  //       const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  //       const distance = R * c;
  //
  //       return distance >= MIN_TRAIL_DISTANCE_M;
  //     })();
  //
  //     if (shouldAddTrailPoint) {
  //       trailPointsRef.current.push({
  //         lat: roverPosition.lat,
  //         lng: roverPosition.lng,
  //         timestamp: now
  //       });
  //       lastTrailUpdateRef.current = now;
  //     }
  //
  //     // Remove old trail points (older than TRAIL_MAX_AGE_SEC)
  //     const maxAgeMs = TRAIL_MAX_AGE_SEC * 1000;
  //     trailPointsRef.current = trailPointsRef.current.filter(p => (now - p.timestamp) < maxAgeMs);
  //
  //     // Keep only MAX_TRAIL_POINTS
  //     if (trailPointsRef.current.length > MAX_TRAIL_POINTS) {
  //       trailPointsRef.current = trailPointsRef.current.slice(-MAX_TRAIL_POINTS);
  //     }
  //
  //     // Convert to format expected by MissionMap with fading
  //     const trailWithFading = trailPointsRef.current.map(p => {
  //       const ageSeconds = (now - p.timestamp) / 1000;
  //       let opacity = 1.0;
  //
  //       // Start fading after TRAIL_FADE_START_SEC
  //       if (ageSeconds > TRAIL_FADE_START_SEC) {
  //         const fadeProgress = (ageSeconds - TRAIL_FADE_START_SEC) / (TRAIL_MAX_AGE_SEC - TRAIL_FADE_START_SEC);
  //         opacity = Math.max(0.1, 1.0 - fadeProgress);
  //       }
  //
  //       return {
  //         latitude: p.lat,
  //         longitude: p.lng,
  //         opacity: opacity,
  //         timestamp: p.timestamp
  //       };
  //     });
  //
  //     // Only update trailPoints state when the trail actually changes (new point added or old point removed)
  //     // Don't trigger updates on every position change - this prevents unnecessary re-renders
  //     setTrailPoints(trailWithFading);
  //   }
  // }, [roverPosition]);

  // Preserve current mission data as previous mission (for export access)
  // Using a stable ref callback that always has access to current values
  const preserveCurrentMission = useRef(() => {
    const wps = waypointsRef.current;
    const sMap = reportStatusMapRef.current;
    if (wps.length > 0 || Object.keys(sMap).length > 0) {
      console.log(
        "[MissionReportScreen] Preserving current mission data for export access",
      );
      setPreviousMissionData({
        waypoints: [...wps],
        statusMap: { ...sMap },
        missionMode: missionModeRef.current,
        startTime: missionStartTimeRef.current,
        endTime: missionEndTimeRef.current,
      });
    }
  });

  // PX4 point journal terminal events (point_completed / point_failed / point_aborted)
  useEffect(() => {
    // Flow isolation: when a verified GPS mission is loaded, the PX4 point
    // terminal handler must NOT fire — the verified handler owns terminal state.
    // This prevents duplicate completion dialogs across the two flows.
    if (verifiedCtx.isLoaded) return;
    if (!POINT_MISSION_ENABLED || !px4MissionTerminal) return;

    const { outcome, event } = px4MissionTerminal;
    console.log(
      "[MissionReportScreen] PX4 point mission terminal:",
      outcome,
      event.event_type,
    );

    setIsMissionActive(false);
    preserveCurrentMission.current();

    if (!missionEndTimeRef.current) {
      const endTime = event.timestamp ? new Date(event.timestamp) : new Date();
      setMissionEndTime(endTime);
    }

    if (outcome === "completed") {
      showNotification(
        "success",
        "Mission Completed",
        "All marking points have been processed!",
      );
      if (mountedRef.current) {
        setShowCompletionDialog(true);
      }
      clearMissionTerminal();
      return;
    }

    const detail = event.message || event.reason || `Mission ${outcome}`;
    showNotification("error", "Mission Ended", detail);
    clearMissionTerminal();
  }, [px4MissionTerminal, clearMissionTerminal, verifiedCtx.isLoaded]);

  // 4WD verified mission terminal handler
  useEffect(() => {
    // Flow isolation: only handle verified terminal state for a verified mission.
    if (!verifiedCtx.isLoaded) return;
    if (!verifiedTerminal) return;

    setIsMissionActive(false);
    preserveCurrentMission.current();

    if (!missionEndTimeRef.current) {
      const endTime = verifiedTerminal.event.timestamp
        ? new Date(verifiedTerminal.event.timestamp)
        : new Date();
      setMissionEndTime(endTime);
    }

    if (verifiedTerminal.outcome === "completed") {
      showNotification(
        "success",
        "Mission Completed",
        "All marking points processed!",
      );
      const t = setTimeout(() => {
        if (mountedRef.current) setShowCompletionDialog(true);
        clearVerifiedTerminal();
      }, 1000);
      return () => clearTimeout(t);
    }

    const detail =
      verifiedTerminal.event.message ??
      verifiedTerminal.event.reason ??
      `Mission ${verifiedTerminal.outcome}`;
    showNotification("error", "Mission Ended", detail);
    clearVerifiedTerminal();
  }, [verifiedTerminal, clearVerifiedTerminal, verifiedCtx.isLoaded]);

  // Get mission data for display (current or previous) — memoized to avoid
  // creating new object references on every telemetry-driven re-render
  const displayData = useMemo(() => {
    // If we have a completed previous mission and no current mission activity, show previous
    if (
      previousMissionData &&
      !isMissionActive &&
      Object.keys(statusMap).length === 0
    ) {
      return {
        waypoints: previousMissionData.waypoints,
        statusMap: previousMissionData.statusMap,
        missionMode: previousMissionData.missionMode,
        startTime: previousMissionData.startTime,
        endTime: previousMissionData.endTime,
      };
    }
    // Otherwise show current mission data
    return {
      waypoints,
      statusMap: reportStatusMap,
      missionMode,
      startTime: missionStartTime,
      endTime: missionEndTime,
    };
  }, [
    previousMissionData,
    isMissionActive,
    statusMap,
    reportStatusMap,
    waypoints,
    missionMode,
    missionStartTime,
    missionEndTime,
  ]);

  const missionProgressRef = useMemo(
    () =>
      getMissionProgressRef(
        displayData.waypoints,
        effectiveCurrentIndex,
        effectiveMissionActive,
      ),
    [displayData.waypoints, effectiveCurrentIndex, effectiveMissionActive],
  );

  // Calculate mission statistics for completion dialog
  const getMissionStats = () => {
    const totalWaypoints = displayData.waypoints.length;
    const completedWaypoints = displayData.waypoints.filter((wp) => {
      const wpStatus = displayData.statusMap[wp.sn];
      return wpStatus && wpStatus.status === "completed";
    }).length;
    const skippedWaypoints = displayData.waypoints.filter((wp) => {
      const wpStatus = displayData.statusMap[wp.sn];
      return wpStatus && wpStatus.status === "skipped";
    }).length;

    const formatTime = (date: Date | null) => {
      if (!date) return "N/A";
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    };

    const formatDuration = () => {
      const startTime = displayData.startTime;
      const endTime = displayData.endTime;
      if (!startTime || !endTime) return "N/A";
      const durationMs = endTime.getTime() - startTime.getTime();
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    };

    return {
      totalWaypoints,
      completedWaypoints,
      skippedWaypoints,
      missionDuration: formatDuration(),
      startTime: formatTime(displayData.startTime),
      endTime: formatTime(displayData.endTime),
    };
  };

  // DEBUG: Manual function to test completion dialog
  const testCompletionDialog = () => {
    console.log(
      "[MissionReportScreen] 🧪 TEST: Manually opening completion dialog",
    );
    console.log("[MissionReportScreen] 🧪 Current state:", {
      showCompletionDialog,
      isMissionActive,
      missionStartTime,
      missionEndTime,
      waypointCount: waypoints.length,
      statusMapKeys: Object.keys(statusMap).length,
    });
    setShowCompletionDialog(true);
  };

  // Check if there's existing mission data that would be cleared
  const hasExistingMissionData = () => {
    const hasWaypoints = waypoints.length > 0;
    const hasProgress = Object.keys(statusMap).length > 0;
    const hasPreviousData = previousMissionData !== null;
    return hasWaypoints || hasProgress || hasPreviousData;
  };

  // Get existing mission info for confirmation dialog
  const getExistingMissionInfo = () => {
    return {
      waypointCount: waypoints.length,
      hasProgress: Object.keys(statusMap).length > 0,
    };
  };

  // Clear current mission data when starting new mission
  const clearCurrentMissionData = () => {
    console.log(
      "[MissionReportScreen] Clearing current mission data for new mission",
    );
    setStatusMap({});
    resetPointStatusMap();

    /*
     * Never allow terminal accuracy from the
     * previous mission run to leak into the next run.
     */
    clearTerminalRppAccuracyFallback();
    setCurrentIndex(null);
    setMissionStartTime(null);
    setMissionEndTime(null);
    setWaitingForManual(false);
    // TRAIL DISABLED: Clear trail commented out
    // setTrailPoints([]);
    // trailPointsRef.current = [];
  };

  const handleSetExecutionMode = async (newMode: "AUTO" | "MANUAL") => {
    try {
      console.log("[MissionReportScreen] Setting execution mode:", newMode);

      const response = await setMissionExecutionMode(newMode);

      if (!response.success) {
        return {
          success: false,
          message:
            response.mission?.message || "Backend rejected execution mode.",
        };
      }

      setBackendMission(response.mission);

      setMode(newMode);

      setWaitingForManual(
        String(response.mission?.state ?? "")
          .trim()
          .toUpperCase() === "WAITING_FOR_NEXT",
      );

      console.log("[MissionReportScreen] Execution mode accepted:", {
        executionMode: response.mission?.execution_mode,

        state: response.mission?.state,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to set mission execution mode.";

      console.error("[MissionReportScreen] Execution mode failed:", error);

      void refreshBackendMission();

      return {
        success: false,
        message,
      };
    }
  };

  const handleStart = async () => {
    if (!mountedRef.current) {
      return {
        success: false,
        message: "Mission screen is not active.",
      };
    }

    try {
      console.log("[MissionReportScreen] Requesting mission start...");

      // The backend mission must exist and its trajectory must
      // have been prepared successfully.
      if (!canStartMission) {
        const message =
          backendMission?.loaded === true
            ? "The mission file is stored, but its trajectory is not ready."
            : "Upload and prepare a mission before starting.";

        showNotification("error", "Mission Not Ready", message, 4000);

        return {
          success: false,
          message,
        };
      }

      // Keep the frontend waypoint display as a second safety check.
      if (waypoints.length === 0) {
        const message = "No marking points are available in the frontend.";

        showNotification("error", "No Marking Points", message);

        return {
          success: false,
          message,
        };
      }

      // Never allow mission start while manual joystick control owns
      // the rover.
      if (telemetry.joystick_active || telemetry.control_owner === "joystick") {
        const message = "Release manual drive before starting the mission.";

        showNotification("error", "Joystick Active", message, 4000);

        return {
          success: false,
          message,
        };
      }

      // Validate locally displayed GPS marking coordinates.
      const invalidWaypoints = waypoints.filter(
        (waypoint) =>
          !Number.isFinite(waypoint.lat) ||
          !Number.isFinite(waypoint.lon) ||
          waypoint.lat === 0 ||
          waypoint.lon === 0,
      );

      if (invalidWaypoints.length > 0) {
        const message =
          `${invalidWaypoints.length} marking point(s) ` +
          "have invalid coordinates.";

        showNotification("error", "Invalid Marking Points", message);

        return {
          success: false,
          message,
        };
      }

      if (mode !== "AUTO" && mode !== "MANUAL") {
        const message = "Select AUTO or MANUAL before starting.";

        showNotification("error", "Invalid Mission Mode", message);

        return {
          success: false,
          message,
        };
      }

      /**
       * Set execution mode immediately before START.
       * This guarantees backend and frontend agree
       * even after reconnect/reload.
       */
      const modeResponse = await setMissionExecutionMode(mode);

      setBackendMission(modeResponse.mission);

      console.log(
        "[MissionReportScreen] Start execution mode confirmed:",
        modeResponse.mission?.execution_mode,
      );

      // A prior mission's auto-completion latches E-stop on the backend
      // (mission_manager's shared STOP contract), and only an explicit
      // RELEASE can clear it. There's no separate Release control in the
      // UI, so clear it transparently here. If this fails because a real,
      // newer E-stop is active, the START call below still enforces that
      // safety gate and reports it.
      try {
        await releaseEmergencyStop();
      } catch (releaseError) {
        console.log(
          "[MissionReportScreen] Pre-start E-stop release skipped/failed:",
          releaseError,
        );
      }

      // Current backend contract:
      // POST /api/mission/start
      // No mission_id body is required.
      const response = await startMission();

      if (!response.success) {
        const message =
          response.mission?.message ||
          "The backend rejected the mission start request.";

        showNotification("error", "Start Failed", message, 4000);

        return {
          success: false,
          message,
        };
      }

      // The backend accepted Start. Clear old runtime display data,
      // but retain the uploaded marking points.
      clearCurrentMissionData();

      setBackendMission(response.mission);
      setIsMissionActive(true);
      setMissionStartTime(new Date());
      setMissionEndTime(null);
      setCurrentIndex(0);

      /**
       * Backend rebuilds the trajectory from the rover's current
       * position when Start is pressed.
       */

      showNotification(
        "success",
        "Mission Started",
        "The rover mission started successfully.",
      );

      console.log("[MissionReportScreen] Mission start accepted:", {
        state: response.mission.state,
        loaded: response.mission.loaded,
        ready: response.mission.ready,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start mission.";

      console.error("[MissionReportScreen] Mission start failed:", error);

      /*
       * Backend remains the source of truth.
       * Refresh immediately so the diagnostic fields on the
       * screen also reflect the failed Start attempt.
       */
      void refreshBackendMission();

      showNotification("error", "Mission Start Blocked", message, 8000);

      /*
       * Field-test requirement:
       * Don't make the operator guess why Start failed.
       */
      Alert.alert("Mission Start Blocked", message, [
        {
          text: "OK",
        },
      ]);

      return {
        success: false,
        message,
      };
    }
  };

  const handlePause = async () => {
    try {
      console.log("[MissionReportScreen] Pausing mission...");

      const response = await pauseMission();

      setBackendMission(response.mission);

      if (response.success) {
        // A paused mission is still an active mission.
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Paused",
          response.mission.message || "Mission paused successfully.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to pause mission.";

      console.error("[MissionReportScreen] Pause failed:", error);

      void refreshBackendMission();

      showNotification("error", "Pause Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleResume = async () => {
    if (backendMission?.resume_available !== true) {
      const reason =
        typeof backendMission?.rtk_reason === "string" &&
        backendMission.rtk_reason.trim()
          ? backendMission.rtk_reason
          : typeof backendMission?.pause_reason === "string" &&
              backendMission.pause_reason.trim()
            ? `Resume blocked: ${backendMission.pause_reason}`
            : "Mission is not ready to resume.";

      showNotification("info", "Resume Blocked", reason, 4500);

      return {
        success: false,
        message: reason,
      };
    }

    try {
      console.log("[MissionReportScreen] Resuming mission...");

      const response = await resumeMission();

      setBackendMission(response.mission);

      if (response.success) {
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Resumed",
          response.mission.message || "Mission resumed successfully.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resume mission.";

      console.error("[MissionReportScreen] Resume failed:", error);

      void refreshBackendMission();

      showNotification("error", "Resume Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleStop = async () => {
    try {
      console.log("[MissionReportScreen] Stopping mission...");

      const response = await stopMission();

      setBackendMission(response.mission);

      if (response.success) {
        setCurrentIndex(null);
        setIsMissionActive(false);
        setWaitingForManual(false);

        preserveCurrentMission.current();

        showNotification(
          "success",
          "Mission Stopped",
          response.mission.message || "Mission stopped successfully.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop mission.";

      console.error("[MissionReportScreen] Stop failed:", error);

      void refreshBackendMission();

      showNotification("error", "Stop Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleNext = async () => {
    try {
      console.log("[MissionReportScreen] Moving to next marking point...");

      const response = await nextMissionPoint();

      setBackendMission(response.mission);

      if (response.success) {
        setWaitingForManual(false);

        showNotification(
          "success",
          "Next Marking Point",
          response.mission.message || "Moving to the next marking point.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to move to the next marking point.";

      console.error("[MissionReportScreen] Next point failed:", error);

      void refreshBackendMission();

      showNotification("error", "Next Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleSkip = async () => {
    try {
      console.log("[MissionReportScreen] Skipping current marking point...");

      const response = await skipMissionPoint();

      setBackendMission(response.mission);

      if (response.success) {
        showNotification(
          "success",
          "Marking Point Skipped",
          response.mission.message || "Current marking point was skipped.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to skip the marking point.";

      console.error("[MissionReportScreen] Skip point failed:", error);

      void refreshBackendMission();

      showNotification("error", "Skip Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleClearMission = async () => {
    try {
      console.log("[MissionReportScreen] Clearing verified mission...");
      await clearVerifiedMission();
      verifiedCtx.clearLoadedMission();
      resetVerifiedProgress();
      showNotification("success", "Cleared", "Mission cleared from controller");
    } catch (err) {
      console.error("[MissionReportScreen] Clear mission error:", err);
      showNotification("error", "Clear Failed", String(err));
    }
  };

  const handleExport = () => {
    console.log("[MissionReportScreen] Export report triggered");
  };

  // Handle export completion - prompt user to clear logs or keep for review
  const handleExportComplete = () => {
    console.log(
      "[MissionReportScreen] 📤 Export completed - showing clear logs prompt",
    );
    // Show dialog asking if user wants to clear mission logs
    setShowClearLogsDialog(true);
  };

  // User confirmed to clear logs after export
  const handleClearLogsAfterExport = async () => {
    try {
      console.log(
        "[MissionReportScreen] 🗑️ User confirmed - clearing mission logs after export",
      );
      // Clear all mission data
      await PersistentStorage.clearMissionData();

      // Clear local state
      setStatusMap({});
      setPreviousMissionData(null);
      setCurrentIndex(null);
      setMissionStartTime(null);
      setMissionEndTime(null);
      setShowClearLogsDialog(false);

      showNotification(
        "success",
        "Logs Cleared",
        "Mission logs cleared successfully",
      );
      console.log("[MissionReportScreen] ✅ Mission logs cleared after export");
    } catch (error) {
      console.error("[MissionReportScreen] ❌ Failed to clear logs:", error);
      showNotification("error", "Clear Failed", "Failed to clear mission logs");
    }
  };

  // User declined to clear logs - keep for review
  const handleKeepLogsAfterExport = () => {
    console.log(
      "[MissionReportScreen] 📋 User declined - keeping mission logs for review",
    );
    setShowClearLogsDialog(false);
    showNotification("info", "Logs Kept", "Mission logs preserved for review");
  };

  // Clear all mission data (user-initiated)
  const handleClearMissionData = async () => {
    Alert.alert(
      "Clear Mission Data",
      "This will clear all marking points, progress, and mission logs. This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              // Clear from persistent storage
              await PersistentStorage.clearMissionData();

              // Clear local state
              clearMissionWaypoints();
              setStatusMap({});
              setMissionStartTime(null);
              setMissionEndTime(null);
              setIsMissionActive(false);
              setMissionMode("DGPS Mark");
              setCurrentIndex(null);

              showNotification(
                "success",
                "Mission Data Cleared",
                "All mission data has been cleared from storage",
              );
              console.log("[MissionReportScreen] ✅ All mission data cleared");
            } catch (error) {
              console.error(
                "[MissionReportScreen] ❌ Failed to clear mission data:",
                error,
              );
              showNotification(
                "error",
                "Clear Failed",
                "Failed to clear mission data",
              );
            }
          },
        },
      ],
    );
  };

  // Debug function to test mission events (for development/testing)
  const simulateWaypointReached = (wpSn: number) => {
    console.log(`[MissionReportScreen] 🧪 Simulating waypoint ${wpSn} reached`);
    setStatusMap((prev) => ({
      ...prev,
      [wpSn]: {
        ...(prev[wpSn] || {}),
        reached: true,
        status: "reached",
        timestamp: new Date().toISOString(),
      },
    }));
  };

  const simulateWaypointCompleted = (wpSn: number) => {
    console.log(
      `[MissionReportScreen] 🧪 Simulating waypoint ${wpSn} completed`,
    );
    setStatusMap((prev) => ({
      ...prev,
      [wpSn]: {
        ...(prev[wpSn] || {}),
        marked: true,
        status: "completed",
        timestamp: new Date().toISOString(),
        remark: "Test completion",
      },
    }));
  };

  // Test mission events by triggering them manually
  const testMissionEvents = () => {
    console.log(
      "[MissionReportScreen] 🧪 Testing mission events with waypoints:",
      waypoints.length,
    );

    if (waypoints.length === 0) {
      showNotification(
        "error",
        "No Marking Points",
        "Please load marking points first to test mission events",
      );
      return;
    }

    // Test waypoint 1 reached
    setTimeout(() => {
      console.log("[MissionReportScreen] 🧪 Simulating waypoint 1 reached...");
      simulateWaypointReached(1);
    }, 1000);

    // Test waypoint 1 completed
    setTimeout(() => {
      console.log(
        "[MissionReportScreen] 🧪 Simulating waypoint 1 completed...",
      );
      simulateWaypointCompleted(1);
    }, 3000);

    // Test current waypoint change
    setTimeout(() => {
      console.log(
        "[MissionReportScreen] 🧪 Simulating current waypoint change to 2...",
      );
      setCurrentIndex(1); // Waypoint 2 (0-based index)
    }, 5000);

    showNotification(
      "info",
      "Test Started",
      "Mission event simulation started - check console logs",
    );
  };

  // Add to window for debugging in development
  React.useEffect(() => {
    if (__DEV__) {
      (global as any).simulateWaypointReached = simulateWaypointReached;
      (global as any).simulateWaypointCompleted = simulateWaypointCompleted;
      (global as any).testMissionEvents = testMissionEvents;
      console.log(
        "[MissionReportScreen] Debug functions added to global scope:",
      );
      console.log("  - simulateWaypointReached(wpSn)");
      console.log("  - simulateWaypointCompleted(wpSn)");
      console.log("  - testMissionEvents() - runs full test sequence");
    }
  }, [waypoints.length]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      // Clear notification timeout on unmount to prevent memory leaks
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }

      console.log(
        "[MissionReportScreen] Component unmounting - cleaned up timers",
      );
    };
  }, []);

  // Load persisted mission state on mount — single batch read for speed
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        // BATCH READ: Single AsyncStorage.multiGet instead of 6 separate reads
        const data = await PersistentStorage.loadAllMissionReportData();
        if (!data) return;

        if (data.statusMap && Object.keys(data.statusMap).length > 0) {
          setStatusMap(data.statusMap);
          console.log(
            "[MissionReportScreen] 📂 Restored status map with",
            Object.keys(data.statusMap).length,
            "entries",
          );
        }

        if (data.startTime) {
          setMissionStartTime(data.startTime);
          console.log("[MissionReportScreen] 📂 Restored mission start time");
        }

        if (data.endTime) {
          setMissionEndTime(data.endTime);
          console.log("[MissionReportScreen] 📂 Restored mission end time");
        }

        if (data.isActive) {
          // 🔧 FIX: Only restore mission active state if backend telemetry confirms mission is actually running
          // This prevents showing STOP button when backend mission is not running
          const currentBackendStatus = telemetry?.mission?.status
            ?.toString()
            .toLowerCase();
          const isBackendActuallyRunning =
            currentBackendStatus === "running" ||
            currentBackendStatus === "active";

          if (isBackendActuallyRunning) {
            setIsMissionActive(data.isActive);
            console.log(
              "[MissionReportScreen] 📂 Restored mission active state:",
              data.isActive,
              "(confirmed by backend)",
            );
          } else if (
            currentBackendStatus === undefined ||
            currentBackendStatus === ""
          ) {
            // If no telemetry yet, temporarily restore but will be corrected by MissionControlCard sync
            setIsMissionActive(data.isActive);
            console.log(
              "[MissionReportScreen] 📂 Restored mission active state temporarily (no telemetry yet):",
              data.isActive,
            );
          } else {
            setIsMissionActive(false);
            console.log(
              "[MissionReportScreen] 📂 Skipped restoring mission active state - backend shows:",
              currentBackendStatus || "no status",
            );
          }
        }

        if (data.mode) {
          setMissionMode(data.mode);
          console.log(
            "[MissionReportScreen] 📂 Restored mission mode:",
            data.mode,
          );
        } else {
          // Ensure mode is set to default if no saved mode
          setMissionMode("DGPS Mark");
        }

        // Restore UI state
        if (data.uiState) {
          if (data.uiState.currentIndex !== undefined) {
            setCurrentIndex(data.uiState.currentIndex);
            console.log(
              "[MissionReportScreen] 📂 Restored current waypoint index:",
              data.uiState.currentIndex,
            );
          }
          if (data.uiState.mode) {
            setMode(data.uiState.mode);
            console.log(
              "[MissionReportScreen] 📂 Restored mode:",
              data.uiState.mode,
            );
          }
          const migratedPanels = migrateLegacyPanelVisibility(data.uiState);
          if (Object.keys(migratedPanels).length > 0) {
            setPanelVisibility((prev) => ({ ...prev, ...migratedPanels }));
          }
          if (data.uiState.isBottomTableExpanded !== undefined) {
            setIsBottomTableExpanded(data.uiState.isBottomTableExpanded);
          }
        }
      } catch (error) {
        console.error(
          "[MissionReportScreen] Failed to load persisted state:",
          error,
        );
      }
    };

    loadPersistedState();
  }, []);

  // Auto-save statusMap changes
  useEffect(() => {
    if (Object.keys(statusMap).length > 0) {
      PersistentStorage.saveStatusMap(statusMap).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist statusMap:",
          error,
        );
      });
    }
  }, [statusMap]);

  // Auto-save mission times and active state
  useEffect(() => {
    if (missionStartTime) {
      PersistentStorage.saveMissionStartTime(missionStartTime).catch(
        (error) => {
          console.error(
            "[MissionReportScreen] Failed to persist start time:",
            error,
          );
        },
      );
    }
  }, [missionStartTime]);

  useEffect(() => {
    if (missionEndTime) {
      PersistentStorage.saveMissionEndTime(missionEndTime).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist end time:",
          error,
        );
      });
    }
  }, [missionEndTime]);

  useEffect(() => {
    PersistentStorage.saveMissionActive(isMissionActive).catch((error) => {
      console.error(
        "[MissionReportScreen] Failed to persist active state:",
        error,
      );
    });
  }, [isMissionActive]);

  useEffect(() => {
    if (missionMode) {
      PersistentStorage.saveMissionMode(missionMode).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist mission mode:",
          error,
        );
      });
    }
  }, [missionMode]);

  // Auto-save UI state changes
  useEffect(() => {
    PersistentStorage.saveMissionReportUIState({
      currentIndex,
      mode,
      isRobotStatusVisible,
      isMissionProgressVisible,
      isDistanceToTargetVisible,
      isAccuracyMonitorVisible,
      isSystemStatusVisible,
      isMissionControlsVisible,
      isBottomTableVisible,
      isBottomTableExpanded,
    });
  }, [
    currentIndex,
    mode,
    isRobotStatusVisible,
    isMissionProgressVisible,
    isAccuracyMonitorVisible,
    isDistanceToTargetVisible,
    isSystemStatusVisible,
    isMissionControlsVisible,
    isBottomTableVisible,
    isBottomTableExpanded,
  ]);
  useEffect(() => {
    // Subscribe to mission events from backend
    const unsubscribe = onMissionEvent((event: any) => {
      if (!mountedRef.current) return;

      const rawEventType = event.type || event.event || event.event_type;
      const eventType = (() => {
        if (rawEventType) {
          const raw = String(rawEventType);
          if (raw.startsWith("point_")) return "point_mission_event";
          return raw;
        }
        if (
          event.state !== undefined &&
          (event.dist_to_goal !== undefined || event.rpp_state !== undefined)
        ) {
          return "mission_status";
        }
        if (
          event.mission_state !== undefined ||
          event.mission_mode !== undefined ||
          event.current_waypoint !== undefined ||
          event.total_waypoints !== undefined
        ) {
          return "mission_status";
        }
        return "unknown";
      })();

      // NRP_ROS LEGACY DISABLED — ignore old mission_event types (use point_mission_event on PX4)
      const NRP_ROS_LEGACY_EVENTS = new Set([
        "bulk_skip",
        "waypoint_reached",
        "waypoint_marked",
        "waypoint_completed",
        "waiting_for_manual",
        "mission_event",
        "failsafe_resumed",
        "failsafe_restarted",
        "obstacle_detection_changed",
        "led_controller_changed",
      ]);
      if (NRP_ROS_LEGACY_EVENTS.has(eventType)) {
        return;
      }
      // NRP_ROS LEGACY DISABLED — nested NRP mission_status shape (mission_state + current_waypoint)
      if (
        event.mission_state !== undefined &&
        event.current_waypoint !== undefined &&
        event.state === undefined
      ) {
        return;
      }

      // WORKAROUND: Check if this is a spray suppressed message from SERVER_ACTIVITY
      // Backend logs "Mission: Spray suppressed: accuracy XXmm > YYmm" but doesn't send proper events
      // Match only the full "Mission: Spray suppressed" pattern to avoid duplicates
      if (
        event.message &&
        typeof event.message === "string" &&
        event.message.includes("Mission: Spray suppressed")
      ) {
        console.log(
          "[MissionReportScreen] 🚫 Detected spray suppression message:",
          event.message,
        );
        // Mark the most recent waypoint as skipped — read prev inside functional updater
        setStatusMap((prev) => {
          const currentWpIndex = Object.keys(prev).length;
          const allWps = waypointsRef.current;
          if (currentWpIndex > 0 && currentWpIndex <= allWps.length) {
            const wpId = allWps[currentWpIndex - 1]?.sn;
            if (wpId && prev[wpId]) {
              console.log(
                `[MissionReportScreen] ⏭️ Marking waypoint ${wpId} as SKIPPED (spray suppressed)`,
              );
              return {
                ...prev,
                [wpId]: {
                  ...prev[wpId],
                  status: "skipped",
                  remark: "Skipped - GPS accuracy too low",
                },
              };
            }
          }
          return prev;
        });
      }

      // Handle bulk skip events (backend emits event_type: 'bulk_skip')
      if (
        eventType === "bulk_skip" ||
        event.event_type === "bulk_skip" ||
        (event.data && event.data.event_type === "bulk_skip")
      ) {
        try {
          const skipFrom =
            event.skip_from ??
            event.data?.skip_from ??
            event.skipped_from ??
            event.data?.skipped_from;
          const skipTo =
            event.skip_to ??
            event.data?.skip_to ??
            event.skipped_to ??
            event.data?.skipped_to;
          const nextWp =
            event.next_waypoint ??
            event.data?.next_waypoint ??
            event.next_waypoint_id ??
            null;
          console.log("[MissionReportScreen] ⏭️ Bulk skip event received", {
            skipFrom,
            skipTo,
            nextWp,
          });

          if (
            typeof skipFrom === "number" &&
            typeof skipTo === "number" &&
            skipTo >= skipFrom
          ) {
            const timestamp = event.timestamp
              ? typeof event.timestamp === "string"
                ? event.timestamp
                : new Date(event.timestamp).toISOString()
              : new Date().toISOString();

            // Capture previous statuses for audit/undo and mark as skipped —
            // both read prev inside the functional updater to avoid stale refs
            setStatusMap((prev) => {
              const copy = { ...prev };
              const prevStatuses: Record<number, WpStatus | null> = {};
              waypointsRef.current.forEach((wp) => {
                if (wp.sn >= skipFrom && wp.sn <= skipTo) {
                  prevStatuses[wp.sn] = prev[wp.sn] ?? null;
                  copy[wp.sn] = {
                    ...(copy[wp.sn] || {}),
                    status: "skipped",
                    timestamp,
                    remark: "Skipped (bulk)",
                  } as WpStatus;
                }
              });

              // Fire-and-forget: persist audit then update UI history
              const recordId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const auditRecord: any = {
                id: recordId,
                skipFrom,
                skipTo,
                timestamp,
                previousStatuses: prevStatuses,
              };
              PersistentStorage.saveSkipAuditRecord(auditRecord).catch((err) =>
                console.warn(
                  "[MissionReportScreen] Failed to save skip audit",
                  err,
                ),
              );
              setSkipHistory((h) => [auditRecord as any].concat(h));
              setUndoPrompt({ visible: true, id: recordId });
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              undoTimerRef.current = setTimeout(() => {
                setUndoPrompt({ visible: false, id: null });
                undoTimerRef.current = null;
              }, 8000);

              return copy;
            });

            // Advance current index to next waypoint if provided
            if (typeof nextWp === "number" && nextWp > 0) {
              const newIndex = Math.max(0, nextWp - 1);
              setCurrentIndex(newIndex);
            }
          }
        } catch (err) {
          console.error(
            "[MissionReportScreen] Error processing bulk_skip event",
            err,
          );
        }
      }

      // DEBUG: Log ALL mission events to diagnose the issue
      // console.log(`[MissionReportScreen] 🔔 ALL Mission Events [${eventType}]`, {
      //   eventType,
      //   event,
      //   waypoint_id: event.waypoint_id,
      //   id: event.id,
      //   current_waypoint: event.current_waypoint,
      //   waypoints_count: waypoints.length
      // });

      // DEBUG: Log distance-to-next-waypoint from backend
      const distToNext =
        event.wp_dist_cm ??
        event.distance_to_next ??
        event.dist_to_wp ??
        event.data?.wp_dist_cm ??
        event.data?.distance_to_next ??
        telemetryRef.current.wp_dist_cm;
      if (distToNext != null) {
        console.log(
          `[MissionReportScreen] 📏 Distance to next WP: ${distToNext} cm (${(distToNext / 100).toFixed(2)} m) [eventType: ${eventType}]`,
        );
      }

      // Skip high-frequency events (mission_status, unknown telemetry updates)
      if (eventType === "mission_status" || eventType === "unknown") {
        // Process state updates silently without logging
        if (
          eventType === "unknown" &&
          event.data?.message === "Telemetry update"
        ) {
          return; // Ignore telemetry update events
        }
      }

      // Handle waypoint reached events (multiple possible event formats)
      if (
        eventType === "waypoint_reached" ||
        event.event_type === "waypoint_reached" ||
        (event.data && event.data.event_type === "waypoint_reached")
      ) {
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.data?.waypoint_id ??
          event.data?.waypointId ??
          event.data?.id ??
          0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();

        console.log(
          `[MissionReportScreen] 🎯 Processing waypoint_reached: wpId=${wpId}, mode=${modeRef.current}, waypoints.length=${waypointsRef.current.length}`,
        );

        // Find the corresponding waypoint by waypoint_id to get the correct sn
        const targetWaypoint = waypointsRef.current.find(
          (wp) => wp.sn === wpId,
        );
        const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;
        const currentMode = modeRef.current;

        // CONTINUOUS / DASH modes — simplified status, no accuracy tracking
        if (currentMode === "CONTINUOUS" || currentMode === "DASH") {
          let status: WpStatus["status"];
          let remark: string;

          if (currentMode === "CONTINUOUS") {
            if (event.is_first) {
              status = "spray_on";
              remark = "Spray ON";
            } else if (event.is_last) {
              status = "spray_off";
              remark = "Spray OFF";
            } else {
              status = "passed";
              remark = "Passed";
            }
          } else {
            // DASH mode
            if (event.is_first) {
              status = "spray_on";
              remark = "Dash Started";
            } else {
              status = "passed";
              remark = "Passed";
            }
          }

          // Move downgrade guard and nextEntry construction inside functional updater
          // so they read fresh state from `prev` instead of stale `statusMapRef.current`
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];
            if (isStatusDowngrade(prevEntry?.status, status)) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${status}`,
              );
              return prev;
            }
            const nextEntry = {
              ...(prevEntry || {}),
              reached: true,
              status,
              timestamp,
              remark,
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
            } as WpStatus;

            if (!prevEntry || prevEntry.status !== nextEntry.status) {
              console.log(
                `[MissionReportScreen] ✅ [${currentMode}] Waypoint ${statusKey} → ${status} at ${timestamp}`,
              );
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
        } else {
          // AUTO / MANUAL modes — existing logic with accuracy tracking
          const roverLat =
            event.position?.lat ?? telemetryRef.current.global?.lat;
          const roverLon =
            event.position?.lng ?? telemetryRef.current.global?.lon;
          const hrms = telemetryRef.current.hrms;
          const vrms = telemetryRef.current.vrms;

          const rawBackendAccuracyMm =
            event.radial_error_mm ??
            event.accuracy_error_mm ??
            event.data?.radial_error_mm ??
            event.data?.accuracy_error_mm ??
            telemetryRef.current.radial_error_mm ??
            telemetryRef.current.accuracy?.radial_error_mm ??
            null;

          const parsedBackendAccuracyMm =
            rawBackendAccuracyMm !== null ? Number(rawBackendAccuracyMm) : null;

          const backendAccuracyMm =
            parsedBackendAccuracyMm !== null &&
            Number.isFinite(parsedBackendAccuracyMm) &&
            parsedBackendAccuracyMm >= 0
              ? parsedBackendAccuracyMm
              : null;

          let accuracyData: {
            accuracy_level?: string;
            position_error_cm?: number;
          } = {};
          if (backendAccuracyMm != null) {
            const accuracy = getAccuracyLevel(backendAccuracyMm);
            accuracyData = {
              accuracy_level: accuracy.level,
              position_error_cm: backendAccuracyMm / 10,
            };
            console.log(
              `[MissionReportScreen] 📊 Backend accuracy for WP ${statusKey}: ${backendAccuracyMm.toFixed(1)}mm (${accuracy.label})`,
            );
          } else {
            console.log(
              `[MissionReportScreen] ⚠️ No backend accuracy for WP ${statusKey}, sources checked:`,
              {
                event_accuracy_error_mm: event.accuracy_error_mm,
              },
            );
          }

          // Move downgrade guard and nextEntry inside functional updater
          // to read fresh state from `prev` instead of stale `statusMapRef.current`
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];

            // GUARD: Don't downgrade a completed/skipped waypoint back to reached
            if (isStatusDowngrade(prevEntry?.status, "reached")) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → reached`,
              );
              return prev;
            }

            const nextEntry = {
              ...(prevEntry || {}),
              reached: true,
              status: "reached",
              timestamp,
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
              hrms: hrms ?? prevEntry?.hrms,
              vrms: vrms ?? prevEntry?.vrms,
              lat_achieved: roverLat ?? prevEntry?.lat_achieved,
              lon_achieved: roverLon ?? prevEntry?.lon_achieved,
              ...accuracyData,
            } as WpStatus;

            const changed =
              !prevEntry ||
              prevEntry.status !== nextEntry.status ||
              prevEntry.reached !== nextEntry.reached ||
              prevEntry.pile !== nextEntry.pile ||
              prevEntry.rowNo !== nextEntry.rowNo ||
              prevEntry.accuracy_level !== nextEntry.accuracy_level;

            if (changed) {
              console.log(
                `[MissionReportScreen] ✅ Waypoint ${statusKey} reached at ${timestamp}`,
              );
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
        }
      }

      // Handle waypoint marked/completed events (multiple possible event formats)
      if (
        eventType === "waypoint_marked" ||
        eventType === "waypoint_completed" ||
        event.event_type === "waypoint_marked" ||
        event.event_type === "waypoint_completed" ||
        (event.data &&
          (event.data.event_type === "waypoint_marked" ||
            event.data.event_type === "waypoint_completed"))
      ) {
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.data?.waypoint_id ??
          event.data?.waypointId ??
          event.data?.id ??
          0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();
        const markingStatus =
          event.marking_status ??
          event.markingStatus ??
          event.status ??
          event.data?.marking_status ??
          "completed";

        // DEBUG: Log the full event to see what backend is sending
        console.log(
          "[MissionReportScreen] 📦 Full waypoint event:",
          JSON.stringify(event, null, 2),
        );
        console.log(
          `[MissionReportScreen] ✅ Processing waypoint_marked/completed: wpId=${wpId}, status=${markingStatus}`,
        );
        console.log("[MissionReportScreen] 🔍 Event fields:", {
          marking_status: event.marking_status,
          markingStatus: event.markingStatus,
          status: event.status,
          servo_suppressed: event.servo_suppressed,
          gps_failsafe: event.gps_failsafe,
        });

        // Find the corresponding waypoint by waypoint_id to get the correct sn
        const targetWaypoint = waypointsRef.current.find(
          (wp) => wp.sn === wpId,
        );
        const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

        // Get hrms from telemetry for accuracy fallback
        const hrms = telemetryRef.current.hrms;

        const rawAccuracyMm =
          event.accuracy_error_mm ?? event.data?.accuracy_error_mm ?? null;

        const parsedAccuracyMm =
          rawAccuracyMm !== null ? Number(rawAccuracyMm) : null;

        const backendAccuracyMm =
          parsedAccuracyMm !== null &&
          Number.isFinite(parsedAccuracyMm) &&
          parsedAccuracyMm >= 0
            ? parsedAccuracyMm
            : null;

        const isSkipped = String(markingStatus).toLowerCase() === "skipped";

        setStatusMap((prev) => {
          const prevEntry = prev[statusKey];

          /**
           * Once a completed point has a valid accuracy,
           * later events must not replace it.
           */
          const hasFrozenAccuracy =
            prevEntry?.status === "completed" &&
            typeof prevEntry.position_error_cm === "number" &&
            Number.isFinite(prevEntry.position_error_cm);

          const accuracyData:
            | {
                accuracy_level: string;
                position_error_cm: number;
              }
            | Record<string, never> =
            !isSkipped && !hasFrozenAccuracy && backendAccuracyMm !== null
              ? {
                  accuracy_level: getAccuracyLevel(backendAccuracyMm).level,

                  /**
                   * Mission Report currently stores this
                   * field in centimetres.
                   */
                  position_error_cm: backendAccuracyMm / 10,
                }
              : {};

          const nextEntry: WpStatus = {
            ...(prevEntry ?? {}),

            marked: !isSkipped,

            status: isSkipped ? "skipped" : "completed",

            timestamp,

            pile: event.pile ?? event.data?.pile ?? prevEntry?.pile,

            rowNo:
              event.rowNo ??
              event.row_no ??
              event.data?.rowNo ??
              event.data?.row_no ??
              prevEntry?.rowNo,

            remark:
              event.remark ??
              event.data?.remark ??
              (isSkipped ? "Skipped" : "Marked"),

            ...accuracyData,
          };

          const changed =
            !prevEntry ||
            prevEntry.status !== nextEntry.status ||
            prevEntry.marked !== nextEntry.marked ||
            prevEntry.timestamp !== nextEntry.timestamp ||
            prevEntry.pile !== nextEntry.pile ||
            prevEntry.rowNo !== nextEntry.rowNo ||
            prevEntry.remark !== nextEntry.remark ||
            prevEntry.accuracy_level !== nextEntry.accuracy_level ||
            prevEntry.position_error_cm !== nextEntry.position_error_cm;

          if (!changed) {
            return prev;
          }

          return {
            ...prev,
            [statusKey]: nextEntry,
          };
        });

        const statusEmoji = markingStatus === "skipped" ? "⏭️" : "✅";
        console.log(
          `[MissionReportScreen] ${statusEmoji} Waypoint ${statusKey} ${markingStatus} at ${timestamp}`,
        );
      }

      // waypoint_hold_complete — hold period done, servo sequence about to run (AUTO + MANUAL)
      // No statusMap update needed here — waypoint_marked/waypoint_skipped follows immediately
      if (
        eventType === "waypoint_hold_complete" ||
        event.event_type === "waypoint_hold_complete"
      ) {
        const wpId =
          event.waypoint_id ?? event.waypointId ?? event.current_waypoint ?? 0;
        console.log(
          `[MissionReportScreen] ⏱️ Hold complete for WP ${wpId}, should_mark=${event.should_mark}`,
        );
        // Intentionally no statusMap change — waypoint_marked or waypoint_skipped fires next
      }

      // DASH MODE: dash_completed — overwrite last waypoint with final summary
      if (
        eventType === "dash_completed" ||
        event.event_type === "dash_completed"
      ) {
        const allWps = waypointsRef.current;
        if (allWps.length > 0) {
          const lastWpSn = allWps[allWps.length - 1].sn;
          const timestamp = event.timestamp
            ? typeof event.timestamp === "string"
              ? event.timestamp
              : new Date(event.timestamp).toISOString()
            : new Date().toISOString();
          const distance =
            event.cumulative_distance ?? event.total_distance ?? "";
          const distanceDisplay = distance
            ? ` | ${Number(distance).toFixed(1)}m`
            : "";

          setStatusMap((prev) => ({
            ...prev,
            [lastWpSn]: {
              ...(prev[lastWpSn] || {}),
              status: "mission_end",
              remark: `Done${distanceDisplay}`,
              timestamp,
            } as WpStatus,
          }));
          console.log(
            `[MissionReportScreen] 🏁 [DASH] dash_completed: last WP ${lastWpSn} → mission_end${distanceDisplay}`,
          );
        }
      }

      // MANUAL MODE ONLY: waypoint_completed_manual — WP is done, mission paused waiting for user NEXT
      if (
        eventType === "waypoint_completed_manual" ||
        event.event_type === "waypoint_completed_manual"
      ) {
        const wpId =
          event.waypoint_id ?? event.waypointId ?? event.current_waypoint ?? 0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();

        console.log(
          `[MissionReportScreen] 🖐️ MANUAL waypoint_completed_manual: wpId=${wpId}, waiting_for_manual=${event.waiting_for_manual}`,
        );

        if (wpId > 0) {
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          // Move downgrade guard inside functional updater for fresh state
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];
            if (isStatusDowngrade(prevEntry?.status, "completed")) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → completed`,
              );
              return prev;
            }
            return {
              ...prev,
              [statusKey]: {
                ...(prevEntry || {}),
                marked: true,
                status: "completed",
                timestamp,
              } as WpStatus,
            };
          });
        }

        // Signal UI that NEXT button needs to be pressed to continue
        if (event.waiting_for_manual) {
          setWaitingForManual(true);
          console.log(
            "[MissionReportScreen] 🖐️ MANUAL mode: waiting for user to press NEXT",
          );
        }
      }

      // PX4 point_mission_event — consumed by usePointMissionEvents; skip duplicate handling here
      if (
        eventType === "point_mission_event" ||
        (event.event_type && String(event.event_type).startsWith("point_"))
      ) {
        return;
      }

      // Handle mission completed event - including mission_state: completed
      if (
        eventType === "mission_completed" ||
        event.event_type === "mission_completed" ||
        event.mission_state === "completed" ||
        event.state === "completed" ||
        (event.data && event.data.event_type === "mission_completed") ||
        (event.data && event.data.mission_state === "completed")
      ) {
        console.log(
          "[MissionReportScreen] 🏁 Mission completed event received from backend",
        );
        console.log("[MissionReportScreen] Completion event details:", {
          eventType,
          mission_state: event.mission_state,
          completion_time: event.completion_time,
          mission_duration: event.mission_duration,
        });

        // Set mission start time if not set (fallback for missed start event)
        if (!missionStartTimeRef.current) {
          console.log(
            "[MissionReportScreen] ⚠️ Mission start time was not set! Using fallback.",
          );
          // Calculate start time from completion_time and mission_duration if available
          if (event.completion_time && event.mission_duration) {
            const completionDate = new Date(event.completion_time);
            const startDate = new Date(
              completionDate.getTime() - event.mission_duration * 1000,
            );
            setMissionStartTime(startDate);
            console.log(
              "[MissionReportScreen] ✅ Calculated mission start time from duration:",
              startDate,
            );
          } else {
            // Fallback: use current time minus 1 minute as approximate start
            setMissionStartTime(new Date(Date.now() - 60000));
            console.log(
              "[MissionReportScreen] ⚠️ Using fallback start time (1 minute ago)",
            );
          }
        }

        // Set mission end time if not already set
        if (!missionEndTimeRef.current) {
          const completionTime = event.completion_time
            ? new Date(event.completion_time)
            : new Date();
          setMissionEndTime(completionTime);
          console.log(
            "[MissionReportScreen] ✅ Mission end time set:",
            completionTime,
          );
        }

        // Mark mission as inactive
        setIsMissionActive(false);
        console.log(
          "[MissionReportScreen] ✅ isMissionActive set to false - button will reset to START",
        );

        // Preserve mission data for export
        preserveCurrentMission.current();

        // Show completion notification
        showNotification(
          "success",
          "Mission Completed",
          "All marking points have been processed!",
        );

        // Show completion dialog immediately after confirmed backend completion.
        if (mountedRef.current) {
          // console.log('[MissionReportScreen] 📋 Opening mission completion dialog');
          setShowCompletionDialog(true);
        }
        return;
      }

      // Handle mission status updates (high frequency - no notifications)
      if (eventType === "mission_status") {
        const px4State = event.state ?? event.mission_state;
        if (px4State === "running" || px4State === "paused") {
          setIsMissionActive(true);
        } else if (
          px4State === "completed" ||
          px4State === "stopped" ||
          px4State === "idle"
        ) {
          setIsMissionActive(false);
        }

        if (
          POINT_MISSION_ENABLED &&
          typeof event.point_index === "number" &&
          event.point_index >= 0
        ) {
          setCurrentIndex(event.point_index);
        }

        // Check if mission was paused (by GPS failsafe or manual action)
        if (px4State === "paused" || px4State === "PAUSED") {
          console.log(
            "[MissionReportScreen] 🔴 MISSION STATE CHANGED TO PAUSED",
          );
          console.log(
            "[MissionReportScreen] 📋 Pause reason:",
            event.pause_reason || event.reason || "Unknown",
          );
          console.log(
            "[MissionReportScreen] 📋 GPS Failsafe mode:",
            telemetryRef.current.gps_failsafe?.mode,
          );
          console.log(
            "[MissionReportScreen] 📋 Full pause event:",
            JSON.stringify(event),
          );
        }

        let statusUpdated = false;

        if (event.current_waypoint != null) {
          const newIndex = event.current_waypoint - 1; // Convert from 1-based to 0-based
          const currentWaypointNumber = event.current_waypoint;
          setCurrentIndex((prev) => {
            if (prev === newIndex) return prev;

            // Guard: only advance forward when the waypoint being left is terminal.
            // Backend can send current_waypoint:N before waypoint_marked for N-1 arrives,
            // which would jump the indicator ahead. Auto-derive corrects it once the
            // waypoint_marked event arrives and statusMap updates.
            if (newIndex > (prev ?? -1)) {
              const leavingWp =
                prev !== null ? waypointsRef.current[prev] : null;
              if (leavingWp) {
                const leavingStatus = statusMapRef.current[leavingWp.sn];
                if (
                  !leavingStatus ||
                  (leavingStatus.status !== "completed" &&
                    leavingStatus.status !== "skipped")
                ) {
                  console.log(
                    `[MissionReportScreen] ⏸ Holding indicator at index ${prev} — WP${leavingWp.sn} not yet terminal (${leavingStatus?.status ?? "no status"})`,
                  );
                  return prev;
                }
              }
            }

            console.log(
              `[MissionReportScreen] ✦ Current waypoint changed: index ${prev} -> ${newIndex} (waypoint #${currentWaypointNumber})`,
            );
            console.log(
              `[MissionReportScreen] ✦ Looking for waypoint with sn=${currentWaypointNumber} in ${waypointsRef.current.length} waypoints`,
            );

            const targetWaypoint = waypointsRef.current.find(
              (wp) => wp.sn === currentWaypointNumber,
            );
            if (targetWaypoint) {
              console.log(`[MissionReportScreen] ✦ Found target waypoint:`, {
                sn: targetWaypoint.sn,
                block: targetWaypoint.block,
                row: targetWaypoint.row,
                pile: targetWaypoint.pile,
              });
            } else {
              console.log(
                `[MissionReportScreen] ⚠️ Target waypoint sn=${currentWaypointNumber} not found in waypoints array`,
              );
            }

            statusUpdated = true;
            return newIndex;
          });
        }

        if (event.mission_mode) {
          const backendMode = String(event.mission_mode).toLowerCase();
          const nextMode = mapBackendMissionModeToUiMode(event.mission_mode);

          if (nextMode && nextMode !== modeRef.current) {
            console.log(
              `[MissionReportScreen] Syncing Mission Control mode from backend: ${modeRef.current} -> ${nextMode}`,
            );
            modeRef.current = nextMode;
            setMode(nextMode);
            statusUpdated = true;
          }
        }

        // Check if mission_status contains waypoint completion info
        if (event.waypoint_status && event.current_waypoint) {
          const wpId = event.current_waypoint;
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          const incomingStatus =
            event.waypoint_status === "completed"
              ? "completed"
              : event.waypoint_status === "reached"
                ? "reached"
                : event.waypoint_status;

          console.log(
            `[MissionReportScreen] 📊 Mission status contains waypoint info: wpId=${wpId}, status=${incomingStatus}`,
          );

          // Move downgrade guard and nextEntry inside functional updater
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];

            if (isStatusDowngrade(prevEntry?.status, incomingStatus)) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${incomingStatus}`,
              );
              return prev;
            }

            const nextEntry = {
              ...(prevEntry || {}),
              status: incomingStatus,
              timestamp: event.timestamp
                ? typeof event.timestamp === "string"
                  ? event.timestamp
                  : new Date(event.timestamp).toISOString()
                : new Date().toISOString(),
              reached:
                event.waypoint_status === "reached" ||
                event.waypoint_status === "completed",
              marked: event.waypoint_status === "completed",
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
              remark: event.remark ?? prevEntry?.remark,
              accuracy_level: event.accuracy_level ?? prevEntry?.accuracy_level,
              position_error_cm:
                event.position_error_cm ?? prevEntry?.position_error_cm,
            } as WpStatus;

            const changed =
              !prevEntry ||
              prevEntry.status !== nextEntry.status ||
              prevEntry.reached !== nextEntry.reached ||
              prevEntry.marked !== nextEntry.marked ||
              prevEntry.pile !== nextEntry.pile ||
              prevEntry.rowNo !== nextEntry.rowNo ||
              prevEntry.remark !== nextEntry.remark ||
              prevEntry.accuracy_level !== nextEntry.accuracy_level ||
              prevEntry.position_error_cm !== nextEntry.position_error_cm;

            if (changed) {
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
          statusUpdated = true;
        }

        // Only log mission_status when something actually changed to reduce noise
        if (statusUpdated) {
          console.log("[MissionReportScreen] Mission status updated:", {
            current_waypoint: event.current_waypoint,
            mission_mode: event.mission_mode,
            waypoint_status: event.waypoint_status,
            waypoints_count: waypointsRef.current.length,
          });
        }
        return;
      }

      // Handle mission errors
      if (eventType === "mission_error") {
        const errorMsg =
          event.message || event.error || "Unknown mission error";
        console.error(
          `[MissionReportScreen] ❌ Mission error: ${errorMsg}`,
          event,
        );
        showNotification("error", "Mission Error", errorMsg);
      }

      // Handle mission state changes (show notifications only for important events)
      if (eventType === "mission_started") {
        console.log("[MissionReportScreen] 🚀 Mission started");
        setMissionStartTime(new Date());
        setMissionEndTime(null); // Reset end time for new mission
        setIsMissionActive(true); // Mark mission as active
        // TRAIL DISABLED: Clear trail on new mission start commented out
        // trailPointsRef.current = [];
        // setTrailPoints([]); // Clear trail on new mission start
      }

      if (
        eventType === "mission_paused" ||
        event.mission_state === "paused" ||
        (event.data && event.data.mission_state === "paused")
      ) {
        console.log("[MissionReportScreen] ⏸️ Mission paused");
        console.log("[MissionReportScreen] 📋 Pause event details:", {
          eventType,
          mission_state: event.mission_state,
          gps_failsafe_triggered: event.gps_failsafe_triggered,
          reason: event.reason,
          current_waypoint: event.current_waypoint,
          wp_dist_cm: event.wp_dist_cm,
          full_event: JSON.stringify(event),
        });
        // Show notification to user
        showNotification(
          "info",
          "Mission Paused",
          event.reason || "Mission paused by system",
        );
      }

      if (eventType === "mission_resumed") {
        console.log("[MissionReportScreen] ▶️ Mission resumed");
      }

      // Note: mission_completed is handled earlier in the event handler (line ~848)

      // Catch-all handler for any other mission events that might contain waypoint updates
      // Exclude mission_progress - it's a high-frequency status ping, not a waypoint state change
      if (
        eventType !== "mission_status" &&
        eventType !== "unknown" &&
        eventType !== "mission_progress" &&
        eventType !== "waypoint_hold_complete" &&
        eventType !== "waypoint_completed_manual" &&
        (event.waypoint_id || event.id || event.current_waypoint)
      ) {
        console.log(
          `[MissionReportScreen] 🔍 Unhandled mission event with waypoint info:`,
          {
            eventType,
            waypoint_id: event.waypoint_id,
            id: event.id,
            current_waypoint: event.current_waypoint,
            status: event.status,
            event_type: event.event_type,
          },
        );

        // Try to extract waypoint status updates from any unhandled events
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.current_waypoint ??
          0;
        if (wpId > 0 && waypointsRef.current.length > 0) {
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          // Check for any status indicators in the event
          if (
            event.status === "completed" ||
            event.status === "reached" ||
            event.status === "marked" ||
            event.status === "skipped"
          ) {
            // Move all reads inside functional updater to avoid stale statusMapRef
            setStatusMap((prev) => {
              const prevEntry = prev[statusKey];

              // GUARD: Don't downgrade a completed/skipped waypoint
              if (isStatusDowngrade(prevEntry?.status, event.status)) {
                console.log(
                  `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${event.status}`,
                );
                return prev;
              }

              console.log(
                `[MissionReportScreen] 📝 Extracting status from unhandled event: wpId=${wpId}, status=${event.status}`,
              );

              const nextEntry = {
                ...(prevEntry || {}),
                status: event.status,
                timestamp: event.timestamp
                  ? typeof event.timestamp === "string"
                    ? event.timestamp
                    : new Date(event.timestamp).toISOString()
                  : new Date().toISOString(),
                reached:
                  event.status === "reached" || event.status === "completed",
                marked:
                  event.status === "completed" || event.status === "marked",
                remark: event.remark ?? prevEntry?.remark ?? "—",
              } as WpStatus;

              const changed =
                !prevEntry ||
                prevEntry.status !== nextEntry.status ||
                prevEntry.reached !== nextEntry.reached ||
                prevEntry.marked !== nextEntry.marked ||
                prevEntry.remark !== nextEntry.remark;

              if (changed) {
                return { ...prev, [statusKey]: nextEntry };
              }
              return prev;
            });
          }
        }
      }
    });

    return () => {
      // Cleanup subscription
      unsubscribe();
    };
  }, [onMissionEvent]);

  // Mission mode is now managed by RoverContext and synced with Mission Ops Panel
  // Initial mode is set to 'DGPS Mark' by default in context

  // Mission waypoints come from context (uploaded via PathPlan tab)
  // No need to fetch from backend as PathPlan handles upload and syncs to context

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <StatusBar backgroundColor={colors.headerBlue} barStyle="light-content" />

      <View style={styles.absoluteMapContainer}>
        <MissionMap
          waypoints={displayData.waypoints}
          trajectoryPoints={trajectoryPoints}
          roverLat={mapProps.roverLat}
          roverLon={mapProps.roverLon}
          heading={mapProps.heading}
          activeWaypointIndex={effectiveCurrentIndex}
          statusMap={displayData.statusMap}
          armed={mapProps.armed}
          rtkFixType={mapProps.rtkFixType}
          edgeToEdge
          isVisible={isVisible}
        />
      </View>

      {isRobotStatusVisible && (
        <DraggableCard
          style={styles.floatingRobotStatusPanel}
          handleType="custom"
          onLayout={(e) => setRobotPanelHeight(e.nativeEvent.layout.height)}
        >
          <VehicleStatusCard
            status={vehicleStatus}
            telemetry={telemetry}
            isConnected={
              connectionState === "connected" &&
              telemetry.fcu_connected !== false
            }
            onClose={() => setPanelVisible("robotStatus", false)}
          />
        </DraggableCard>
      )}

      {isMissionProgressVisible && (
        <DraggableCard
          style={[
            styles.floatingMissionProgressPanel,
            {
              top:
                robotPanelHeight > 0
                  ? MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE +
                    robotPanelHeight +
                    MISSION_PROGRESS_LAYOUT.PANEL_GAP
                  : MISSION_PROGRESS_LAYOUT.MISSION_PROGRESS_STACK_FALLBACK,
            },
          ]}
          handleType="custom"
          onLayout={(e) =>
            setMissionProgressPanelHeight(e.nativeEvent.layout.height)
          }
        >
          <MissionProgressCard
            markedCount={missionProgressStats.markedPoints}
            currentPoint={missionProgressStats.currentPoint}
            totalPoints={missionProgressStats.totalPoints}
            onClose={() => setPanelVisible("missionProgress", false)}
          />
        </DraggableCard>
      )}

      {isMissionProgressVisible && (
        <View
          style={[
            styles.floatingQuickNtripPanel,
            {
              top:
                (robotPanelHeight > 0
                  ? MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE +
                    robotPanelHeight +
                    MISSION_PROGRESS_LAYOUT.PANEL_GAP
                  : MISSION_PROGRESS_LAYOUT.MISSION_PROGRESS_STACK_FALLBACK) +
                (missionProgressPanelHeight || 142) +
                MISSION_PROGRESS_LAYOUT.PANEL_GAP,
            },
          ]}
        >
          <QuickNtripStartCard
            onPress={handleQuickStartNtrip}
            onManualPress={handleOpenManualDrive}
            manualLoading={isManualPreparing}
            loading={isQuickNtripStarting}
            rtkState={quickRtkState}
          />
        </View>
      )}

      {isAccuracyMonitorVisible && (
        <DraggableCard
          style={styles.floatingAccuracyMonitorPanel}
          handleType="custom"
        >
          <AccuracyMonitorCard
            isMissionActive={accuracyMissionActive}
            alongSideMm={
              telemetry.rpp_debug_available ? telemetry.rpp_along_remaining_mm : null
            }
            alongSidePosition={
              telemetry.rpp_debug_available ? telemetry.rpp_along_position : null
            }
            crossTrackMm={
              telemetry.rpp_debug_available ? telemetry.rpp_cross_track_error_mm : null
            }
            crossTrackSide={
              telemetry.rpp_debug_available ? telemetry.rpp_cross_track_side : null
            }
            actualSpeedMps={
              telemetry.rpp_debug_available ? telemetry.rpp_actual_speed_mps : null
            }
            targetHeadingDeg={
              telemetry.rpp_debug_available ? telemetry.rpp_guidance_bearing_deg : null
            }
            headingErrorDeg={
              telemetry.rpp_debug_available ? telemetry.rpp_heading_error_deg : null
            }
            distanceToGoalM={
              telemetry.rpp_debug_available ? telemetry.rpp_distance_to_goal_m : null
            }
            onClose={() => setPanelVisible("accuracyMonitor", false)}
          />
        </DraggableCard>
      )}

      {isDistanceToTargetVisible && (
        <DraggableCard
          style={styles.floatingDistanceToTargetPanel}
          handleType="custom"
        >
          <DistanceToTargetCard
            isMissionActive={accuracyMissionActive}
            accuracyAvailable={overallAccuracyDataAvailable}
            overallAccuracyMm={
              overallAccuracyDataAvailable ? telemetry.radial_error_mm : null
            }
            accuracyStatus={telemetry.accuracy_status}
          />
        </DraggableCard>
      )}

      {isSystemStatusVisible && (
        <DraggableCard
          style={styles.floatingSystemStatusPanel}
          handleType="custom"
          onLayout={(e) => setSystemPanelHeight(e.nativeEvent.layout.height)}
        >
          <SystemStatusPanel
            onClose={() => setPanelVisible("systemStatus", false)}
          />
        </DraggableCard>
      )}

      {isMissionControlsVisible && !isManualDriveVisible && (
        <DraggableCard
          style={[
            styles.floatingMissionControlsPanel,
            {
              top:
                systemPanelHeight > 0
                  ? MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE +
                    systemPanelHeight +
                    MISSION_PROGRESS_LAYOUT.PANEL_GAP
                  : MISSION_PROGRESS_LAYOUT.MISSION_CONTROLS_STACK_FALLBACK,
            },
          ]}
          handleType="custom"
        >
          <MissionControlCard
            waypoints={waypoints}
            mode={mode}
            onSetMode={handleSetExecutionMode}
            onStart={handleStart}
            onPause={handlePause}
            resumeAvailable={backendResumeAvailable}
            pauseReason={backendPauseReason}
            rtkReason={backendRtkReason}
            onResume={handleResume}
            onStop={handleStop}
            onNext={handleNext}
            onSkip={handleSkip}
            missionMode={missionMode}
            isMissionActive={effectiveMissionActive}
            isMissionPaused={isBackendMissionPaused}
            waitingForManual={effectiveWaitingForManual}
            isMissionLoaded={hasUploadedMission}
            isMissionReady={canStartMission}
            onClose={() => setPanelVisible("missionControls", false)}
          />
        </DraggableCard>
      )}

      {isBottomTableVisible && (
        <DraggableCard style={styles.floatingBottomTable} handleType="custom">
          <MissionTableHeader
            progressCurrent={missionProgressRef.current}
            progressTotal={missionProgressRef.total}
            isExpanded={isBottomTableExpanded}
            onToggleExpand={() => setIsBottomTableExpanded((prev) => !prev)}
            onClose={() => setPanelVisible("bottom", false)}
            toolbarActions={
              <MissionTableToolbarActions
                onClear={() => setShowClearLogsDialog(true)}
                exportProps={{
                  waypoints: displayData.waypoints,
                  statusMap: displayData.statusMap,
                  missionMode: displayData.missionMode,
                  onExport: handleExport,
                  onExportComplete: handleExportComplete,
                }}
              />
            }
          />
          {isBottomTableExpanded && (
            <View style={styles.floatingBottomTableBody}>
              <WaypointsTable
                embedded
                waypoints={displayData.waypoints}
                statusMap={displayData.statusMap}
                missionMode={displayData.missionMode}
                currentIndex={effectiveCurrentIndex}
                pinnedCount={PINNED_COUNT}
                onReorder={handleReorder}
              />
            </View>
          )}
        </DraggableCard>
      )}

      <Toast
        visible={notification.visible}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />

      {/* Undo prompt for recent bulk-skip */}
      {undoPrompt.visible && (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>Bulk skip performed — </Text>
          <TouchableOpacity
            style={styles.undoButton}
            onPress={async () => {
              const id = undoPrompt.id;
              if (!id) return;
              // Find record
              const rec = skipHistory.find((r) => r.id === id);
              if (!rec) return;

              // Restore previous statuses
              setStatusMap((prev) => {
                const copy = { ...prev };
                Object.keys(rec.previousStatuses).forEach((k) => {
                  const sn = parseInt(k, 10);
                  const prevEntry = rec.previousStatuses[sn];
                  if (!prevEntry) {
                    delete copy[sn];
                  } else {
                    copy[sn] = prevEntry;
                  }
                });
                return copy;
              });

              // Mark audit record undone in persistent storage
              await PersistentStorage.markSkipAuditUndone(id).catch((err) =>
                console.warn(
                  "[MissionReportScreen] Failed to mark audit undone",
                  err,
                ),
              );

              // Remove prompt and record
              setSkipHistory((prev) => prev.filter((r) => r.id !== id));
              setUndoPrompt({ visible: false, id: null });
              if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
              }

              showNotification("info", "Undo", "Bulk skip undone locally");
            }}
          >
            <Text style={styles.undoButtonText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      <RTKInjectionScreen
        visible={showRTKInjection}
        onClose={closeRTKInjection}
        services={services}
        isConnected={connectionState === "connected"}
      />

      {/* Auto-Assign Dialog */}
      <AutoAssignDialog
        visible={showAutoAssignDialog}
        missingFields={missingFields}
        onAutoAssign={handleAutoAssignSequence}
        onProceedWithout={handleProceedWithoutAssign}
        onCancel={() => setShowAutoAssignDialog(false)}
      />

      {/* Waypoint Preview Dialog */}
      <WaypointPreviewDialog
        visible={showWaypointPreviewDialog}
        waypoints={waypoints}
        onConfirm={handleConfirmUpload}
        onCancel={() => setShowWaypointPreviewDialog(false)}
        isUploading={isUploadingMission}
      />

      {/* Mission Completion Dialog */}
      <MissionCompletionDialog
        visible={showCompletionDialog}
        onDismiss={() => {
          console.log(
            "[MissionReportScreen] Closing mission completion dialog",
          );

          setShowCompletionDialog(false);
        }}
        onExport={handleExport}
        missionStats={getMissionStats()}
        waypoints={displayData.waypoints}
        statusMap={displayData.statusMap}
        missionMode={displayData.missionMode}
      />

      {/* Clear Logs After Export Dialog */}
      <LogClearDialog
        visible={showClearLogsDialog}
        onConfirm={handleClearLogsAfterExport}
        onCancel={handleKeepLogsAfterExport}
      />
    </SafeAreaView>
  );
}

function getFixTypeLabel(fixType: number): string {
  const labels: { [key: number]: string } = {
    0: "No GPS",
    1: "No Fix",
    2: "2D Fix",
    3: "3D Fix",
    4: "DGPS",
    5: "RTK Float",
    6: "RTK Fixed",
  };
  return labels[fixType] || "Unknown";
}

const bottomTableInsets = getMissionProgressBottomTableInsets();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    position: "relative",
  },
  absoluteMapContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  floatingRobotStatusPanel: {
    position: "absolute",
    top: MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE,
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    zIndex: 1000,
  },
  floatingMissionProgressPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    zIndex: 1000,
  },

  floatingQuickNtripPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    zIndex: 999,
  },

  floatingAccuracyMonitorPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,

    /**
     * Initial position only.
     * The operator can long-press and drag
     * it anywhere after rendering.
     */
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET + 126,

    zIndex: 1000,
  },

  floatingDistanceToTargetPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET,
    zIndex: 1000,
  },
  floatingSystemStatusPanel: {
    position: "absolute",
    top: MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE,
    right: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.RIGHT_PANEL_WIDTH,
    zIndex: 1000,
  },
  floatingMissionControlsPanel: {
    position: "absolute",
    right: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.RIGHT_PANEL_WIDTH,
    zIndex: 1000,
  },
  floatingBottomTable: {
    position: "absolute",
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET,
    left: bottomTableInsets.left,
    right: bottomTableInsets.right,
    zIndex: 1000,
    elevation: 6,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  floatingBottomTableBody: {
    height: MISSION_PROGRESS_LAYOUT.BOTTOM_TABLE_BODY_HEIGHT,
    overflow: "hidden",
  },
  previousMissionBanner: {
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FDBF47",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  previousMissionText: {
    color: "#856404",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  undoBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 110,
    backgroundColor: "#072334",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  undoText: {
    color: "#E6F7FF",
    fontSize: 13,
  },
  undoButton: {
    marginLeft: 10,
    backgroundColor: "#0ea5a5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  undoButtonText: {
    color: "#001219",
    fontWeight: "700",
  },
});
