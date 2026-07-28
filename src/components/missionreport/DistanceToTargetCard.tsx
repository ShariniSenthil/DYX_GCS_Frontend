import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PATH_PLAN_GLASS } from "../../constants/pathPlanGlass";

interface Props {
  isMissionActive?: boolean;
  distanceToNextM?: number | null;
  dragGesture?: any;
  isDraggingActive?: boolean;
}

function getValidDistance(distanceM: number | null | undefined): number | null {
  if (
    typeof distanceM !== "number" ||
    !Number.isFinite(distanceM) ||
    distanceM < 0
  ) {
    return null;
  }

  return distanceM;
}

function formatDistance(distanceM: number | null): string {
  if (distanceM === null) {
    return "--";
  }

  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(2)} km`;
  }

  if (distanceM >= 1) {
    return `${distanceM.toFixed(2)} m`;
  }

  return `${(distanceM * 100).toFixed(1)} cm`;
}

export const DistanceToTargetCard: React.FC<Props> = ({
  isMissionActive = false,
  distanceToNextM,
  dragGesture,
  isDraggingActive = false,
}) => {
  const validDistance = useMemo(
    () => getValidDistance(distanceToNextM),
    [distanceToNextM]
  );

  /*
   * Display distance only while the mission is active.
   * This prevents a previous mission's final distance from remaining visible.
   */
  const displayedDistance = isMissionActive ? validDistance : null;

  const distanceText = useMemo(
    () => formatDistance(displayedDistance),
    [displayedDistance]
  );

  const isLive = isMissionActive && displayedDistance !== null;

  return (
    <GestureDetector gesture={dragGesture}>
      <View
        style={[styles.container, isDraggingActive && styles.containerDragging]}
      >
        <View style={styles.accentLine} />

        <View style={styles.body}>
          <View style={styles.valueColumn}>
            <Text style={styles.label}>DISTANCE TO TARGET</Text>

            <View style={styles.labelDivider} />

            <Text style={[styles.value, isLive && styles.valueLive]}>
              {distanceText}
            </Text>

            <Text style={styles.statusText}>
              {isLive
                ? "LIVE TARGET DISTANCE"
                : isMissionActive
                ? "WAITING FOR TARGET"
                : "MISSION NOT ACTIVE"}
            </Text>
          </View>

          <View
            style={[styles.targetIconWrap, isLive && styles.targetIconWrapLive]}
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={22}
              color={isLive ? PATH_PLAN_GLASS.cyan : PATH_PLAN_GLASS.muted}
            />
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: "hidden",
  },

  containerDragging: {
    borderColor: PATH_PLAN_GLASS.dragBorder,
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },

  accentLine: {
    height: 2,
    backgroundColor: PATH_PLAN_GLASS.cyan,
    opacity: 0.55,
  },

  body: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    gap: 12,
  },

  valueColumn: {
    flex: 1,
    gap: 6,
  },

  label: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  labelDivider: {
    height: 1,
    backgroundColor: PATH_PLAN_GLASS.borderSubtle,
    marginRight: 8,
  },

  value: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },

  valueLive: {
    color: PATH_PLAN_GLASS.cyan,
  },

  statusText: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.8,
  },

  targetIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: "rgba(103, 232, 249, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },

  targetIconWrapLive: {
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.badgeBg,
  },
});
