import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  PATH_PLAN_GLASS,
  PATH_PLAN_HEADER,
} from "../../constants/pathPlanGlass";
import { useTelemetry } from "../../context/TelemetryContext";
import { Waypoint } from "./types";

interface Props {
  waypoints: Waypoint[];
  currentIndex: number | null;
  markedCount?: number;
  isMissionActive?: boolean;
  dragGesture?: any;
  isDraggingActive?: boolean;
  onClose?: () => void;
}

/**
 * Mission counters use the backend mission snapshot whenever it is available.
 * Local waypoint/status values are retained only as an offline/legacy fallback.
 */
export const MissionProgressCard: React.FC<Props> = ({
  waypoints,
  currentIndex,
  markedCount: providedMarkedCount,
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const { telemetry } = useTelemetry();

  const counters = useMemo(() => {
    const backendTotal = Math.max(0, telemetry.mission.total_wp || 0);
    const hasBackendMission = backendTotal > 0;

    const backendFinished = Math.max(
      0,
      telemetry.mission.completed_points ?? 0
    );

    const activeNumber = telemetry.mission.active_point_number;
    const activeIndex = telemetry.mission.active_point_index;

    let backendCurrent = 0;

    if (typeof activeNumber === "number" && Number.isFinite(activeNumber)) {
      backendCurrent = Math.max(0, Math.trunc(activeNumber));
    } else if (
      typeof activeIndex === "number" &&
      Number.isFinite(activeIndex)
    ) {
      backendCurrent = Math.max(0, Math.trunc(activeIndex) + 1);
    } else if (
      typeof telemetry.mission.current_wp === "number" &&
      Number.isFinite(telemetry.mission.current_wp)
    ) {
      backendCurrent = Math.max(0, Math.trunc(telemetry.mission.current_wp));
    }

    const missionState = String(telemetry.mission.status || "").toUpperCase();
    if (missionState === "COMPLETED" && backendCurrent === 0) {
      backendCurrent = backendTotal;
    }

    const fallbackCurrent =
      currentIndex !== null && currentIndex >= 0
        ? waypoints[currentIndex]?.sn ?? currentIndex + 1
        : 0;

    return {
      finished: hasBackendMission
        ? Math.min(backendFinished, backendTotal)
        : Math.max(0, providedMarkedCount ?? 0),
      current: hasBackendMission
        ? Math.min(backendCurrent, backendTotal)
        : fallbackCurrent,
      total: hasBackendMission ? backendTotal : waypoints.length,
    };
  }, [
    telemetry.mission.total_wp,
    telemetry.mission.completed_points,
    telemetry.mission.active_point_number,
    telemetry.mission.active_point_index,
    telemetry.mission.current_wp,
    telemetry.mission.status,
    providedMarkedCount,
    currentIndex,
    waypoints,
  ]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={dragGesture}>
        <View
          style={[styles.header, isDraggingActive && styles.headerDragging]}
        >
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons
                name="analytics"
                size={14}
                color={PATH_PLAN_GLASS.cyan}
              />
            </View>
            <Text style={styles.headerTitle}>MISSION PROGRESS</Text>
          </View>
          {onClose && (
            <TouchableOpacity
              style={styles.headerCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </GestureDetector>

      <View style={styles.counterRow}>
        <View style={[styles.counter, styles.finishedCounter]}>
          <View
            style={[
              styles.counterAccent,
              { backgroundColor: PATH_PLAN_GLASS.cyan },
            ]}
          />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>FINISHED</Text>
            <Text
              style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}
            >
              {counters.finished}
            </Text>
          </View>
        </View>

        <View style={[styles.counter, styles.currentCounter]}>
          <View
            style={[
              styles.counterAccent,
              { backgroundColor: PATH_PLAN_GLASS.cyan },
            ]}
          />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>CURRENT</Text>
            <Text
              style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}
            >
              {counters.current}
            </Text>
          </View>
        </View>

        <View style={[styles.counter, styles.totalCounter]}>
          <View
            style={[
              styles.counterAccent,
              { backgroundColor: PATH_PLAN_GLASS.cyan },
            ]}
          />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>TOTAL</Text>
            <Text
              style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}
            >
              {counters.total}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 100,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
  },
  headerDragging: {
    borderBottomColor: PATH_PLAN_GLASS.dragBorder,
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },
  headerCloseBtn: PATH_PLAN_HEADER.closeBtn,
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  headerIconWrap: PATH_PLAN_HEADER.iconWrap,
  headerTitle: PATH_PLAN_HEADER.title,
  counterRow: {
    flexDirection: "row",
    gap: 12,
  },
  counter: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
  },
  finishedCounter: {
    backgroundColor: "rgba(192, 132, 252, 0.08)",
    borderColor: "rgba(192, 132, 252, 0.3)",
  },
  currentCounter: {
    backgroundColor: "rgba(103, 232, 249, 0.08)",
    borderColor: "rgba(103, 232, 249, 0.3)",
  },
  totalCounter: {
    backgroundColor: "rgba(110, 231, 183, 0.08)",
    borderColor: "rgba(110, 231, 183, 0.3)",
  },
  counterAccent: {
    width: 3,
    alignSelf: "stretch",
  },
  counterInner: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  counterLabel: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: PATH_PLAN_GLASS.label,
  },
  counterValue: {
    fontSize: 12,
    fontWeight: "700",
  },
});
