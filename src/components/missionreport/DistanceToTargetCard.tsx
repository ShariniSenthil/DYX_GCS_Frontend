import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { OptionalGestureDetector } from "../shared/OptionalGestureDetector";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PATH_PLAN_GLASS } from "../../constants/pathPlanGlass";

interface Props {
  isMissionActive?: boolean;

  /**
   * Backend radial distance to the exact
   * active marking coordinate.
   */
  overallAccuracyMm?: number | null;

  /**
   * Backend accuracy availability flag.
   */
  accuracyAvailable?: boolean;

  /**
   * Backend status:
   * ACCURACY_PASS
   * TEST_PROCEED_BAND
   * OUTSIDE_TOLERANCE
   * UNAVAILABLE
   */
  accuracyStatus?: string | null;

  dragGesture?: any;
  isDraggingActive?: boolean;
}

function validMillimetres(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function formatMillimetres(value: number | null): string {
  if (value === null) {
    return "--";
  }

  /**
   * Do not round the backend measurement.
   * Remove only its decimal portion.
   *
   * 18.96 -> 18 mm
   * 128.7 -> 128 mm
   */
  return `${Math.trunc(value)} mm`;
}

function formatStatus(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!normalized || normalized === "UNAVAILABLE") {
    return "WAITING FOR ACCURACY";
  }

  return normalized.replace(/_/g, " ");
}

export const DistanceToTargetCard: React.FC<Props> = ({
  isMissionActive = false,
  overallAccuracyMm,
  accuracyAvailable = false,
  accuracyStatus,
  dragGesture,
  isDraggingActive = false,
}) => {
  const validAccuracy = useMemo(
    () => validMillimetres(overallAccuracyMm),
    [overallAccuracyMm],
  );

  const displayedAccuracy =
    isMissionActive && accuracyAvailable ? validAccuracy : null;

  const accuracyText = useMemo(
    () => formatMillimetres(displayedAccuracy),
    [displayedAccuracy],
  );

  const isLive =
    isMissionActive && accuracyAvailable && displayedAccuracy !== null;

  const statusText = !isMissionActive
    ? "MISSION NOT ACTIVE"
    : !isLive
      ? "WAITING FOR ACCURACY"
      : formatStatus(accuracyStatus);

  return (
    <OptionalGestureDetector gesture={dragGesture}>
      <View
        style={[styles.container, isDraggingActive && styles.containerDragging]}
      >
        <View style={styles.accentLine} />

        <View style={styles.body}>
          <View style={styles.valueColumn}>
            <Text style={styles.label}>OVERALL ACCURACY</Text>

            <View style={styles.labelDivider} />

            <Text style={[styles.value, isLive && styles.valueLive]}>
              {accuracyText}
            </Text>

            <Text style={styles.statusText}>{statusText}</Text>
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
    </OptionalGestureDetector>
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
