import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import {
  PATH_PLAN_GLASS,
  PATH_PLAN_HEADER,
} from "../../constants/pathPlanGlass";
import { useRover } from "../../context/RoverContext";
import { Waypoint } from "./types";
import { Toast } from "../shared/Toast";
import { validateBulkSkip } from "../../utils/bulkSkipValidator";
import {
  useActionGuard,
  useComponentLifecycle,
} from "../../hooks/useComponentReadiness";

export type MissionControlCardProps = {
  waypoints?: Waypoint[];
  onUpdateWaypoints?: (waypoints: Waypoint[]) => void;
  onStart?: () => Promise<any>;
  onStop?: () => Promise<any>;
  onPause?: () => Promise<any>;
  onResume?: () => Promise<any>;
  onNext?: () => Promise<any>;
  onSkip?: () => Promise<any>;
  onBulkSkip?: () => Promise<any>;
  onLoadMission?: () => Promise<void>;
  onRestart?: () => void;
  mode: "AUTO" | "MANUAL" | "CONTINUOUS" | "DASH";
  onSetMode: (mode: "AUTO" | "MANUAL" | "CONTINUOUS" | "DASH") => void;
  missionMode?: string; // Backend mission mode (DGPS Mark, Dash, Continuous, etc.)
  isMissionActive?: boolean;
  waitingForManual?: boolean; // MANUAL mode: mission paused, user must press NEXT to continue
  isMissionPaused?: boolean;

  /**
   * True when a mission is uploaded in the backend.
   * Controls START versus NO MISSION text.
   */
  isMissionLoaded?: boolean;

  /**
   * True when the uploaded mission is prepared
   * and the START button can be pressed.
   */
  isMissionReady?: boolean;

  dragGesture?: any;
  isDraggingActive?: boolean;
  onClose?: () => void;
};

const MissionControlCard: React.FC<MissionControlCardProps> = ({
  waypoints = [],
  onStart,
  onStop,
  onPause,
  onResume,
  onNext,
  onSkip,
  onBulkSkip,
  onLoadMission,
  mode,
  onSetMode,
  missionMode = "DGPS Mark",
  isMissionActive = false,
  isMissionPaused = false,
  waitingForManual = false,
  isMissionLoaded = false,
  isMissionReady = false,
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const { services, telemetry } = useRover();
  const [isLoadingMission, setIsLoadingMission] = React.useState(false);

  const [isStarting, setIsStarting] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [isNexting, setIsNexting] = React.useState(false);
  const [isSkipping, setIsSkipping] = React.useState(false);
  const [isBulkMode, setIsBulkMode] = React.useState(false);
  const [showBulkModal, setShowBulkModal] = React.useState(false);
  const [bulkFrom, setBulkFrom] = React.useState<string>("");

  const [bulkTo, setBulkTo] = React.useState<string>("");
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [isResuming, setIsResuming] = React.useState(false);

  // Derive button state directly from telemetry — single source of truth
  // Backend mission_status events set telemetry.mission.status to: running, paused, idle, stopped, completed, error, ready, loading
  const missionStatus = (telemetry?.mission?.status ?? "").toLowerCase().trim();

  /**
   * Parent state changes immediately after a successful REST response.
   * Telemetry then confirms the same state through Socket.IO.
   */
  const isRunning =
    isMissionActive ||
    missionStatus === "running" ||
    missionStatus === "paused";

  const isPaused = isMissionPaused || missionStatus === "paused";

  // Debug: log when mission status changes to trace button state issues
  React.useEffect(() => {
    console.log(
      "[MissionControlCard] telemetry.mission.status =",
      telemetry?.mission?.status,
      "→ isRunning:",
      isRunning,
      "isPaused:",
      isPaused,
    );
  }, [telemetry?.mission?.status]);

  const [confirmAction, setConfirmAction] = React.useState<null | {
    action: string;
    onConfirm: () => void;
  }>(null);
  const [toast, setToast] = React.useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    message?: string;
  }>({ visible: false, type: "info", message: undefined });

  // Track mission control readiness - must be called before useActionGuard
  // NOT critical - this is just a UI component, shouldn't block entire system
  const lifecycle = useComponentLifecycle(
    "mission-control",
    "Mission Control",
    "mission",
    false, // not critical - just UI controls
  );

  // Mark as ready once component mounts
  React.useEffect(() => {
    lifecycle.setReady("Mission control ready");
  }, []); // Empty deps - only run once on mount

  // Action guard to prevent actions when system isn't ready
  // Called after useComponentLifecycle to ensure component is registered first
  const { isReady, preventAction } = useActionGuard("mission-control", true);

  const showLocalToast = (
    type: "success" | "error" | "info",
    message?: string,
    duration = 3000,
  ) => {
    setToast({ visible: true, type, message });
    setTimeout(
      () => setToast({ visible: false, type: "info", message: undefined }),
      duration,
    );
  };

  // No sync effects or recovery fetch needed — isRunning/isPaused are derived
  // directly from telemetry.mission.status above. Backend mission_status events
  // update telemetry in real time, buttons react automatically.

  // Mission control handlers with action guard protection
  const handleStart = preventAction(async () => {
    if (!isReady) {
      showLocalToast("error", "System is initializing. Please wait...");
      return;
    }

    setIsStarting(true);
    try {
      if (onStart) {
        const res = await onStart();
        if (res && res.success === false) {
          const msg =
            res?.message ??
            (typeof res === "string" ? res : JSON.stringify(res));
          console.warn("[MissionControlCard] Start returned failure:", msg);
          showLocalToast("error", msg);
        }
        // No need to setIsRunning — telemetry.mission.status will update via WebSocket
      }
    } catch (error) {
      console.error("[MissionControlCard] Start Error:", error);
      showLocalToast(
        "error",
        (error as any)?.message ?? "Failed to start mission",
      );
    } finally {
      setIsStarting(false);
    }
  }, "Cannot start mission while system is initializing");

  const handleStop = async () => {
    setIsStopping(true);

    try {
      console.log("[MissionControlCard] Executing stop mission...");

      /**
       * MissionReportScreen owns the Stop request.
       * Use the service directly only when no parent callback exists.
       */
      if (onStop) {
        await onStop();
        return;
      }

      const response = await services.stopMission();

      if (response?.success) {
        showLocalToast("success", "Mission stopped");
      } else {
        showLocalToast("error", response?.message || "Stop command failed");
      }
    } catch (error) {
      console.error("[MissionControlCard] Stop failed:", error);

      showLocalToast(
        "error",
        error instanceof Error ? error.message : "Failed to stop mission",
      );
    } finally {
      setIsStopping(false);
    }
  };

  const handlePause = async () => {
    setIsPausing(true);
    try {
      const response = onPause
        ? await onPause()
        : await services.pauseMission();
      if (response && response.success) {
        showLocalToast("success", "Mission paused");
      } else {
        showLocalToast("error", response?.message || "Failed to pause mission");
      }
      return response;
    } catch (error) {
      console.error("[MissionControlCard] Pause Error:", error);
      showLocalToast("error", "Failed to pause mission");
      return { success: false, message: String(error) };
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    try {
      const response = onResume
        ? await onResume()
        : await services.resumeMission();
      if (response && response.success) {
        showLocalToast("success", "Mission resumed");
      } else {
        showLocalToast(
          "error",
          response?.message || "Failed to resume mission",
        );
      }
      return response;
    } catch (error) {
      console.error("[MissionControlCard] Resume Error:", error);
      showLocalToast("error", "Failed to resume mission");
      return { success: false, message: String(error) };
    } finally {
      setIsResuming(false);
    }
  };

  const handleNext = async () => {
    try {
      setIsNexting(true);
      const response = onNext ? await onNext() : await services.nextMission();
      if (response && response.success) {
        showLocalToast("success", "Moved to next marking point");
      } else {
        showLocalToast(
          "error",
          response?.message || "Failed to move to next marking point",
        );
      }
      return response;
    } catch (error) {
      console.error("[MissionControlCard] Next Error:", error);
      showLocalToast("error", "Failed to move to next marking point");
      return { success: false, message: String(error) };
    } finally {
      setIsNexting(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      const response = onSkip ? await onSkip() : await services.skipMission();
      if (response && response.success) {
        showLocalToast("success", "Skipped marking point");
      } else {
        showLocalToast(
          "error",
          response?.message || "Failed to skip marking point",
        );
      }
      return response;
    } catch (error) {
      console.error("[MissionControlCard] Skip waypoint failed:", error);
      showLocalToast("error", "Failed to skip marking point");
      return { success: false, message: String(error) };
    } finally {
      setIsSkipping(false);
    }
  };

  const handleModeToggle = (newMode: "AUTO" | "MANUAL") => {
    if (isRunning) {
      showLocalToast(
        "info",
        "Stop the mission before changing AUTO or MANUAL mode.",
        4000,
      );
      return;
    }

    onSetMode(newMode);

    showLocalToast("success", `${newMode} mode selected`);
  };

  const showConfirmDialog = (action: string, onConfirm: () => void) => {
    setConfirmAction({ action, onConfirm });
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={dragGesture}>
        <View
          style={[
            styles.panelHeader,
            isDraggingActive && styles.panelHeaderDragging,
          ]}
        >
          <View style={styles.panelHeaderLeft}>
            <View style={styles.panelHeaderIconWrap}>
              <Ionicons name="rocket" size={14} color={PATH_PLAN_GLASS.cyan} />
            </View>
            <Text style={styles.panelHeaderTitle}>MISSION CONTROLS</Text>
          </View>
          <View style={styles.panelHeaderRight}>
            {onClose && (
              <TouchableOpacity
                style={styles.panelHeaderCloseBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={14}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </GestureDetector>
      <View style={styles.cardPadding}>
        {/* Control Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              isRunning ? styles.stopButton : styles.startButton,
              !isRunning && !isMissionReady && styles.buttonDisabled,
            ]}
            onPress={() => {
              if (isRunning) {
                showConfirmDialog("Stop Mission", handleStop);
              } else {
                showConfirmDialog("Start Mission", handleStart);
              }
            }}
            disabled={
              isStarting || isStopping || (!isRunning && !isMissionReady)
            }
          >
            <Text style={styles.buttonText}>
              {isStarting
                ? "⏳ Starting..."
                : isStopping
                  ? "⏳ Stopping..."
                  : isRunning
                    ? "STOP"
                    : !isMissionLoaded
                      ? "NO MISSION"
                      : "START"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton,
              isPaused ? styles.resumeButton : styles.pauseButton,
              (!isRunning || isPausing || isResuming) && styles.buttonDisabled,
            ]}
            onPress={isPaused ? handleResume : handlePause}
            disabled={!isRunning || isPausing || isResuming}
          >
            <Text style={styles.buttonText}>
              {isPaused ? "RESUME" : "PAUSE"}
            </Text>
          </TouchableOpacity>

          {mode === "MANUAL" && (
            <>
              {/* NEXT MARK — MANUAL MODE ONLY */}
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  styles.nextButton,
                  waitingForManual && styles.nextButtonWaiting,
                  (!isRunning || isNexting) && styles.buttonDisabled,
                ]}
                onPress={handleNext}
                disabled={!isRunning || isNexting}
              >
                <Text style={styles.buttonText}>
                  {isNexting
                    ? "⏳ Moving..."
                    : waitingForManual
                      ? "👆 NEXT MARK"
                      : "NEXT MARK"}
                </Text>
              </TouchableOpacity>

              {/* SKIP MARK — MANUAL MODE ONLY */}
              <View style={styles.skipRow}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    styles.skipButton,
                    (!isRunning || isSkipping) && styles.buttonDisabled,
                    {
                      flex: 1,
                      position: "relative",
                    },
                  ]}
                  onPress={handleSkip}
                  disabled={!isRunning || isSkipping}
                >
                  <Text style={styles.buttonText}>
                    {isSkipping ? "⏳ Skipping..." : "SKIP MARK"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* AUTO / MANUAL MODE SELECTION */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === "AUTO" && styles.modeButtonActive,
                isRunning && mode !== "AUTO" && styles.modeButtonFaded,
              ]}
              onPress={() => handleModeToggle("AUTO")}
              disabled={isRunning}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "AUTO" && styles.modeTextActive,
                ]}
              >
                AUTO
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === "MANUAL" && styles.modeButtonActive,
                isRunning && mode !== "MANUAL" && styles.modeButtonFaded,
              ]}
              onPress={() => handleModeToggle("MANUAL")}
              disabled={isRunning}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "MANUAL" && styles.modeTextActive,
                ]}
              >
                MANUAL
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Loading Mission Modal */}
        <Modal transparent visible={isLoadingMission} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.modalTitle}>Loading Mission</Text>
              <Text style={styles.modalText}>
                Sending waypoints to controller...
              </Text>
            </View>
          </View>
        </Modal>

        {/* Start Mission Modal */}
        <Modal transparent visible={isStarting} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color={colors.greenBtn} />
              <Text style={styles.modalTitle}>Starting Mission</Text>
              <Text style={styles.modalText}>
                Initializing mission controller...
              </Text>
            </View>
          </View>
        </Modal>

        {/* Stop Mission Modal */}
        <Modal transparent visible={isStopping} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color={colors.danger} />
              <Text style={styles.modalTitle}>Stopping Mission</Text>
              <Text style={styles.modalText}>
                Shutting down mission controller...
              </Text>
            </View>
          </View>
        </Modal>

        {/* Bulk Skip Modal */}
        <Modal transparent visible={showBulkModal} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.bulkModalCard}>
              <Text style={styles.confirmHeaderTitle}>Bulk Skip Waypoints</Text>
              <Text style={styles.confirmBodyText}>
                Enter waypoint range to skip (mission must be PAUSED).
              </Text>

              <View style={{ width: "100%", marginTop: 12 }}>
                <Text style={styles.inputLabel}>From</Text>
                <TextInput
                  value={bulkFrom}
                  onChangeText={(t) => setBulkFrom(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  style={styles.inputField}
                  placeholder="e.g., 6"
                />

                <Text style={[styles.inputLabel, { marginTop: 8 }]}>To</Text>
                <TextInput
                  value={bulkTo}
                  onChangeText={(t) => setBulkTo(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  style={styles.inputField}
                  placeholder="e.g., 7"
                />

                {bulkError ? (
                  <Text style={styles.errorText}>{bulkError}</Text>
                ) : null}
              </View>

              <View style={[styles.confirmButtons, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setShowBulkModal(false)}
                  disabled={isBulkSubmitting}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmActionBtn}
                  onPress={() => {
                    setBulkError(null);
                    const from = parseInt(bulkFrom, 10);
                    const to = parseInt(bulkTo, 10);
                    const current = telemetry?.mission?.current_wp ?? 0;
                    const total = telemetry?.mission?.total_wp ?? 0;

                    const validationError = validateBulkSkip({
                      from,
                      to,
                      current,
                      total,
                    });
                    if (validationError) {
                      setBulkError(validationError);
                      return;
                    }

                    // Ensure mission is paused on client before sending bulk skip
                    const missionStatus = (telemetry?.mission?.status || "")
                      .toString()
                      .toUpperCase();
                    if (missionStatus !== "PAUSED") {
                      setBulkError(
                        "Mission must be PAUSED to perform bulk skip",
                      );
                      return;
                    }

                    // Prepare confirmed action to execute the bulk skip when user confirms
                    const performBulkSkip = async () => {
                      setIsBulkSubmitting(true);
                      try {
                        let response;
                        if (onBulkSkip) {
                          response = await onBulkSkip();
                        } else {
                          response = await services.bulkSkipRange(from, to);
                        }
                        if (response && response.success) {
                          showLocalToast("success", `Skipped ${from}-${to}`);
                          setShowBulkModal(false);
                        } else {
                          setBulkError(response?.message || "Bulk skip failed");
                        }
                      } catch (err) {
                        console.error(
                          "[MissionControlCard] bulk skip error",
                          err,
                        );
                        setBulkError(
                          (err as any)?.message || "Bulk skip error",
                        );
                      } finally {
                        setIsBulkSubmitting(false);
                      }
                    };

                    setConfirmAction({
                      action: `Confirm Skip ${from} → ${to}`,
                      onConfirm: performBulkSkip,
                    });
                  }}
                  disabled={isBulkSubmitting}
                >
                  <Text
                    style={[styles.confirmActionText, { fontWeight: "700" }]}
                  >
                    {isBulkSubmitting ? "Skipping..." : "Confirm Skip"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Confirmation Modal */}
        <Modal transparent visible={!!confirmAction} animationType="fade">
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmCard}>
              {/* Header */}
              <View style={styles.confirmHeader}>
                <View style={styles.confirmHeaderLeft}>
                  <View style={styles.confirmIconWrap}>
                    <Text style={{ fontSize: 14 }}>⚡</Text>
                  </View>
                  <Text style={styles.confirmHeaderTitle}>
                    {(confirmAction?.action ?? "").toUpperCase()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.confirmBadge,
                    confirmAction?.action?.toLowerCase().includes("stop") &&
                      styles.confirmBadgeDanger,
                  ]}
                >
                  <View
                    style={[
                      styles.confirmBadgeDot,
                      {
                        backgroundColor: confirmAction?.action
                          ?.toLowerCase()
                          .includes("stop")
                          ? colors.danger
                          : colors.warning,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.confirmBadgeText,
                      {
                        color: confirmAction?.action
                          ?.toLowerCase()
                          .includes("stop")
                          ? colors.danger
                          : colors.warning,
                      },
                    ]}
                  >
                    {confirmAction?.action?.toLowerCase().includes("stop")
                      ? "DANGER"
                      : "CONFIRM"}
                  </Text>
                </View>
              </View>

              {/* Divider */}
              <View style={styles.confirmDivider} />

              {/* Body */}
              <View style={styles.confirmBody}>
                <View
                  style={[
                    styles.confirmBigIcon,
                    {
                      borderColor: confirmAction?.action
                        ?.toLowerCase()
                        .includes("stop")
                        ? `${colors.danger}40`
                        : `${colors.warning}40`,
                      backgroundColor: confirmAction?.action
                        ?.toLowerCase()
                        .includes("stop")
                        ? `${colors.danger}12`
                        : `${colors.warning}12`,
                    },
                  ]}
                >
                  {confirmAction?.action?.toLowerCase().includes("stop") ? (
                    <Text style={{ fontSize: 28 }}>🛑</Text>
                  ) : (
                    <Image
                      source={require("../../../assets/rover-icon.png")}
                      style={{ width: 36, height: 36 }}
                      resizeMode="contain"
                    />
                  )}
                </View>

                {/* Status Cards */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                    width: "100%",
                  }}
                >
                  {/* RTK Card */}
                  {(() => {
                    const rtkStatusColor = (() => {
                      if (!telemetry) return colors.danger;
                      const fixType = telemetry.rtk?.fix_type;
                      if (fixType >= 5) return colors.success;
                      if (fixType >= 4) return colors.warning;
                      return colors.danger;
                    })();
                    const rtkStatusBadge = (() => {
                      if (!telemetry) return "LOST";
                      const fixType = telemetry.rtk?.fix_type;
                      if (fixType >= 6) return "LOCKED";
                      if (fixType >= 5) return "LOCKED";
                      if (fixType >= 4) return "WEAK";
                      return "LOST";
                    })();
                    const rtkStatusText = (() => {
                      if (!telemetry) return "No Fix";
                      const fixType = telemetry.rtk?.fix_type;
                      if (fixType >= 6) return "RTK Fixed";
                      if (fixType >= 5) return "RTK Float";
                      if (fixType >= 4) return "DGPS";
                      if (fixType >= 3) return "3D Fix";
                      if (fixType >= 2) return "2D Fix";
                      return "No GPS";
                    })();
                    return (
                      <View
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          backgroundColor: colors.cardBg,
                          borderRadius: 10,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <View
                          style={{
                            width: 3,
                            alignSelf: "stretch",
                            backgroundColor: rtkStatusColor,
                          }}
                        />
                        <View
                          style={{
                            flex: 1,
                            padding: 10,
                            gap: 6,
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: rtkStatusColor + "40",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <Ionicons
                                name="cellular"
                                size={16}
                                color={rtkStatusColor}
                              />
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                borderWidth: 1,
                                borderRadius: 5,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                backgroundColor: rtkStatusColor + "22",
                                borderColor: rtkStatusColor,
                              }}
                            >
                              <View
                                style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: 2,
                                  backgroundColor: rtkStatusColor,
                                }}
                              />
                              <Text
                                style={{
                                  fontSize: 7,
                                  fontWeight: "700",
                                  letterSpacing: 1,
                                  color: rtkStatusColor,
                                }}
                              >
                                {rtkStatusBadge}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text
                              style={{
                                color: "rgba(103, 232, 249, 0.8)",
                                fontSize: 9,
                                fontWeight: "700",
                                letterSpacing: 2,
                                textTransform: "uppercase",
                              }}
                            >
                              GPS / RTK
                            </Text>
                            <Text
                              style={{
                                color: rtkStatusColor,
                                fontSize: 12,
                                fontWeight: "700",
                                flexShrink: 1,
                                textAlign: "right",
                              }}
                              numberOfLines={1}
                            >
                              {rtkStatusText}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Mode Card */}
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      backgroundColor: colors.cardBg,
                      borderRadius: 10,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 3,
                        alignSelf: "stretch",
                        backgroundColor: colors.success,
                      }}
                    />
                    <View
                      style={{
                        flex: 1,
                        padding: 10,
                        gap: 6,
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: "rgba(16, 185, 129, 0.3)",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons
                            name="settings-sharp"
                            size={16}
                            color={colors.success}
                          />
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            borderWidth: 1,
                            borderRadius: 5,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            borderColor: colors.success,
                          }}
                        >
                          <View
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: colors.success,
                            }}
                          />
                          <Text
                            style={{
                              fontSize: 7,
                              fontWeight: "700",
                              letterSpacing: 1,
                              color: colors.success,
                            }}
                          >
                            ACTIVE
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            color: "rgba(103, 232, 249, 0.8)",
                            fontSize: 9,
                            fontWeight: "700",
                            letterSpacing: 2,
                            textTransform: "uppercase",
                          }}
                        >
                          MODE
                        </Text>
                        <Text
                          style={{
                            color: "#ffffff",
                            fontSize: 12,
                            fontWeight: "700",
                            flexShrink: 1,
                            textAlign: "right",
                          }}
                          numberOfLines={1}
                        >
                          {missionMode}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={styles.confirmBodyText}>
                  {`Are you sure you want to ${confirmAction?.action?.toLowerCase()}?`}
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.confirmDivider} />

              {/* Buttons */}
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setConfirmAction(null)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.confirmActionBtn,
                    confirmAction?.action?.toLowerCase().includes("stop") &&
                      styles.confirmActionBtnDanger,
                  ]}
                  onPress={() => {
                    try {
                      if (confirmAction && confirmAction.onConfirm)
                        confirmAction.onConfirm();
                    } finally {
                      setConfirmAction(null);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmActionText}>
                    {confirmAction?.action?.toLowerCase().includes("stop")
                      ? "STOP MISSION"
                      : "CONFIRM"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Toast
          visible={toast.visible}
          type={toast.type}
          message={toast.message}
          position="bottom"
          style={{ left: 0, right: 0, bottom: 0 }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
  },
  panelHeaderDragging: {
    borderBottomColor: PATH_PLAN_GLASS.dragBorder,
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },
  panelHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelHeaderCloseBtn: PATH_PLAN_HEADER.closeBtn,
  panelHeaderIconWrap: PATH_PLAN_HEADER.iconWrap,
  panelHeaderTitle: PATH_PLAN_HEADER.title,
  cardPadding: {
    padding: 16,
    gap: 14,
  },
  emergencyButton: {
    backgroundColor: "#DC2626",
    paddingVertical: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#991B1B",
  },
  emergencyButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },
  restartButton: {
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonsContainer: {
    gap: 10,
  },
  skipRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  controlButton: {
    paddingVertical: 24,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  startButton: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  stopButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  pauseButton: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  resumeButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  nextButton: {
    backgroundColor: "#7F00FF",
    borderColor: "#7F00FF",
  },
  nextButtonWaiting: {
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: "#FCD34D",
  },
  skipButton: {
    backgroundColor: "#0891B2",
    borderColor: "#0891B2",
    position: "relative",
  },
  bulkToggle: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bulkToggleActive: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  bulkToggleText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: "700",
  },
  bulkToggleTextActive: {
    color: "#000",
  },
  bulkToggleInside: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: 2,
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  modeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 0,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 17,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButtonActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  modeButtonFaded: {
    opacity: 0.4,
    backgroundColor: colors.cardBg,
  },
  modeButtonManual: {
    backgroundColor: colors.cardBg,
  },
  modeText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
  },
  modeTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.panelBg,
    borderRadius: 14,
    padding: 24,
    maxWidth: 300,
    width: "80%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bulkModalCard: {
    backgroundColor: colors.panelBg,
    borderRadius: 14,
    padding: 18,
    maxWidth: 420,
    width: "86%",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: colors.secondary,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: "#ffffff",
  },
  errorText: {
    color: colors.danger,
    marginTop: 8,
    fontSize: 13,
    textAlign: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  modalText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.panelBg,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  // Header
  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confirmHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirmIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(59,130,246,0.15)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmHeaderTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
  },
  confirmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confirmBadgeDanger: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  confirmBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  confirmBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Body
  confirmBody: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  confirmBigIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBodyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  // Buttons
  confirmButtons: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmCancelText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  confirmActionBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.5)",
  },
  confirmActionBtnDanger: {
    backgroundColor: colors.danger,
    borderColor: "rgba(239,68,68,0.5)",
  },
  confirmActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },
});

export default MissionControlCard;
