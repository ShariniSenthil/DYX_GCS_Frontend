import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import type { LoadedPathPoint } from "../../services/missionApi";
import { PATH_PLAN_GLASS } from "../../constants/pathPlanGlass";

interface TrajectoryPreviewCardProps {
  points: LoadedPathPoint[];
  totalPointCount: number;
  loading: boolean;
  truncated: boolean;
  onRefresh: () => void;
}

interface DrawablePoint {
  sourceIndex: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

const DRAWING_HEIGHT = 190;
const PADDING = 16;

export function TrajectoryPreviewCard({
  points,
  totalPointCount,
  loading,
  truncated,
  onRefresh,
}: TrajectoryPreviewCardProps) {
  const [drawingWidth, setDrawingWidth] = useState(320);

  const drawablePoints = useMemo<DrawablePoint[]>(() => {
    const validPoints = points
      .map((point, index) => ({
        sourceIndex: index,
        x: Number(point.x),
        y: Number(point.y),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (validPoints.length === 0) {
      return [];
    }

    const xValues = validPoints.map((point) => point.x);
    const yValues = validPoints.map((point) => point.y);

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const xRange = Math.max(maxX - minX, 0.001);
    const yRange = Math.max(maxY - minY, 0.001);

    const usableWidth = Math.max(drawingWidth - PADDING * 2, 1);
    const usableHeight = DRAWING_HEIGHT - PADDING * 2;

    return validPoints.map((point) => ({
      ...point,

      screenX: PADDING + ((point.x - minX) / xRange) * usableWidth,

      screenY:
        PADDING + usableHeight - ((point.y - minY) / yRange) * usableHeight,
    }));
  }, [points, drawingWidth]);

  const visibleDots = useMemo(() => {
    if (drawablePoints.length <= 250) {
      return drawablePoints;
    }

    const interval = Math.ceil(drawablePoints.length / 250);

    return drawablePoints.filter((_, index) => index % interval === 0);
  }, [drawablePoints]);

  const polylinePoints = useMemo(
    () =>
      drawablePoints
        .map((point) => `${point.screenX},${point.screenY}`)
        .join(" "),
    [drawablePoints],
  );

  const startPoint = drawablePoints[0];
  const endPoint = drawablePoints[drawablePoints.length - 1];

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;

    if (width > 0) {
      setDrawingWidth(width);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GENERATED TRAJECTORY</Text>

          <Text style={styles.subtitle}>
            {trajectorySummary(
              drawablePoints.length,
              totalPointCount,
              truncated,
            )}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={loading}
        >
          <Text style={styles.refreshText}>
            {loading ? "LOADING" : "REFRESH"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.drawingContainer} onLayout={handleLayout}>
        {loading && drawablePoints.length === 0 ? (
          <View style={styles.centerContent}>
            <ActivityIndicator />
            <Text style={styles.message}>Loading generated path…</Text>
          </View>
        ) : drawablePoints.length < 2 ? (
          <View style={styles.centerContent}>
            <Text style={styles.message}>
              Generated trajectory is not available.
            </Text>
          </View>
        ) : (
          <Svg width="100%" height={DRAWING_HEIGHT}>
            <Polyline
              points={polylinePoints}
              fill="none"
              stroke="#22D3EE"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {visibleDots.map((point) => (
              <Circle
                key={`trajectory-${point.sourceIndex}`}
                cx={point.screenX}
                cy={point.screenY}
                r={1.4}
                fill="#67E8F9"
              />
            ))}

            {startPoint ? (
              <Circle
                cx={startPoint.screenX}
                cy={startPoint.screenY}
                r={5}
                fill="#10B981"
              />
            ) : null}

            {endPoint ? (
              <Circle
                cx={endPoint.screenX}
                cy={endPoint.screenY}
                r={5}
                fill="#EF4444"
              />
            ) : null}
          </Svg>
        )}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.startDot]} />
          <Text style={styles.legendText}>Start</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.pathDot]} />
          <Text style={styles.legendText}>Generated points</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.endDot]} />
          <Text style={styles.legendText}>End</Text>
        </View>
      </View>
    </View>
  );
}

function trajectorySummary(
  visibleCount: number,
  totalCount: number,
  truncated: boolean,
): string {
  if (totalCount <= 0) {
    return "No generated points";
  }

  if (truncated) {
    return `${visibleCount} displayed of ${totalCount} generated points`;
  }

  return `${totalCount} generated navigation points`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    overflow: "hidden",
  },

  header: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },

  title: {
    color: "#67E8F9",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },

  refreshButton: {
    borderWidth: 1,
    borderColor: "rgba(103,232,249,0.45)",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  refreshText: {
    color: "#67E8F9",
    fontSize: 9,
    fontWeight: "700",
  },

  drawingContainer: {
    height: DRAWING_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  message: {
    color: "#94A3B8",
    fontSize: 12,
  },

  legend: {
    minHeight: 34,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },

  startDot: {
    backgroundColor: "#10B981",
  },

  pathDot: {
    backgroundColor: "#67E8F9",
  },

  endDot: {
    backgroundColor: "#EF4444",
  },

  legendText: {
    color: "#CBD5E1",
    fontSize: 10,
  },
});
