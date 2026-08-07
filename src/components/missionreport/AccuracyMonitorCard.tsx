import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PATH_PLAN_GLASS } from "../../constants/pathPlanGlass";

interface AccuracyMonitorCardProps {
  isMissionActive?: boolean;

  /**
   * Signed along-track distance:
   * positive = before the point
   * negative = after the point
   */
  alongSideMm?: number | null;
  alongSidePosition?: string | null;

  /**
   * Signed cross-track distance:
   * positive = left
   * negative = right
   */
  crossTrackMm?: number | null;
  crossTrackSide?: string | null;

  /**
   * Injected automatically by DraggableCard
   * when handleType="custom".
   */
  dragGesture?: any;
  isDraggingActive?: boolean;

  onClose?: () => void;
}

function getValidMillimetres(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function formatMillimetres(value: number | null): string {
  if (value === null) {
    return "--";
  }

  const integerValue = Math.trunc(value);

  const normalizedValue = Object.is(integerValue, -0) ? 0 : integerValue;

  return `${normalizedValue} mm`;
}

function formatDirection(value: string | null | undefined): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().toUpperCase() === "UNKNOWN"
  ) {
    return "WAITING FOR DATA";
  }

  return value.trim().replace(/_/g, " ").toUpperCase();
}

export const AccuracyMonitorCard: React.FC<AccuracyMonitorCardProps> = ({
  isMissionActive = false,
  alongSideMm,
  alongSidePosition,
  crossTrackMm,
  crossTrackSide,
  dragGesture,
  isDraggingActive = false,
  onClose,
}) => {
  const validAlongSide = useMemo(
    () => getValidMillimetres(alongSideMm),
    [alongSideMm],
  );

  const validCrossTrack = useMemo(
    () => getValidMillimetres(crossTrackMm),
    [crossTrackMm],
  );

  const alongSideText = useMemo(
    () => formatMillimetres(isMissionActive ? validAlongSide : null),
    [isMissionActive, validAlongSide],
  );

  const crossTrackText = useMemo(
    () => formatMillimetres(isMissionActive ? validCrossTrack : null),
    [isMissionActive, validCrossTrack],
  );

  const alongSideStatus = useMemo(() => {
    if (!isMissionActive) {
      return "MISSION NOT ACTIVE";
    }

    if (validAlongSide === null) {
      return "WAITING FOR DATA";
    }

    return formatDirection(alongSidePosition);
  }, [isMissionActive, validAlongSide, alongSidePosition]);

  const crossTrackStatus = useMemo(() => {
    if (!isMissionActive) {
      return "MISSION NOT ACTIVE";
    }

    if (validCrossTrack === null) {
      return "WAITING FOR DATA";
    }

    return formatDirection(crossTrackSide);
  }, [isMissionActive, validCrossTrack, crossTrackSide]);

  const alongSideLive = isMissionActive && validAlongSide !== null;

  const crossTrackLive = isMissionActive && validCrossTrack !== null;

  const hasLiveData = alongSideLive || crossTrackLive;

  const cardContent = (
    <View
      style={[styles.container, isDraggingActive && styles.containerDragging]}
    >
      <View style={styles.accentLine} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="drag-horizontal"
            size={15}
            color={
              isDraggingActive ? PATH_PLAN_GLASS.cyan : PATH_PLAN_GLASS.muted
            }
          />

          <Text style={styles.headerLabel}>LIVE ACCURACY</Text>
        </View>

        <View style={styles.headerRight}>
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={18}
            color={hasLiveData ? PATH_PLAN_GLASS.cyan : PATH_PLAN_GLASS.muted}
          />

          {onClose ? (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Hide accuracy monitor"
            >
              <MaterialCommunityIcons
                name="close"
                size={16}
                color={PATH_PLAN_GLASS.muted}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.headerDivider} />

      <View style={styles.metricsRow}>
        <View style={styles.metricHalf}>
          <Text style={styles.metricLabel}>ALONG SIDE</Text>

          <Text
            style={[
              styles.metricValue,
              alongSideLive && styles.metricValueLive,
            ]}
          >
            {alongSideText}
          </Text>

          <Text numberOfLines={1} style={styles.metricStatus}>
            {alongSideStatus}
          </Text>
        </View>

        <View style={styles.verticalDivider} />

        <View style={styles.metricHalf}>
          <Text style={styles.metricLabel}>CROSS TRACK</Text>

          <Text
            style={[
              styles.metricValue,
              crossTrackLive && styles.metricValueLive,
            ]}
          >
            {crossTrackText}
          </Text>

          <Text numberOfLines={1} style={styles.metricStatus}>
            {crossTrackStatus}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!dragGesture) {
    return cardContent;
  }

  return <GestureDetector gesture={dragGesture}>{cardContent}</GestureDetector>;
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

  header: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: PATH_PLAN_GLASS.innerBg,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  headerLabel: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
  },

  closeButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  headerDivider: {
    height: 1,
    backgroundColor: PATH_PLAN_GLASS.borderSubtle,
  },

  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: PATH_PLAN_GLASS.innerBg,
  },

  metricHalf: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 11,
    gap: 5,
  },

  verticalDivider: {
    width: 1,
    marginVertical: 9,
    backgroundColor: PATH_PLAN_GLASS.borderSubtle,
  },

  metricLabel: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.9,
  },

  metricValue: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: 0.1,
    fontVariant: ["tabular-nums"],
  },

  metricValueLive: {
    color: PATH_PLAN_GLASS.cyan,
  },

  metricStatus: {
    width: "100%",
    color: PATH_PLAN_GLASS.muted,
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.35,
    textAlign: "center",
  },
});

export default AccuracyMonitorCard;
