import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface MissionProgressCardProps {
  markedCount: number;
  currentPoint: number;
  totalPoints: number;
  onClose?: () => void;
}

function MissionProgressCardBase({
  markedCount,
  currentPoint,
  totalPoints,
  onClose,
}: MissionProgressCardProps) {
  const values = useMemo(() => {
    const total = Math.max(0, Math.floor(totalPoints));

    const marked = Math.min(total, Math.max(0, Math.floor(markedCount)));

    const current =
      total === 0 ? 0 : Math.min(total, Math.max(1, Math.floor(currentPoint)));

    const progress = total > 0 ? marked / total : 0;

    return {
      marked,
      current,
      total,
      progress,
    };
  }, [markedCount, currentPoint, totalPoints]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mission Progress</Text>

        {onClose ? (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close mission progress"
          >
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${values.progress * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.valuesContainer}>
        <View style={styles.valueRow}>
          <Text style={styles.label}>Marked</Text>

          <Text style={styles.value}>{values.marked}</Text>
        </View>

        <View style={styles.valueRow}>
          <Text style={styles.label}>Current</Text>

          <Text style={styles.value}>{values.current}</Text>
        </View>

        <View style={styles.valueRow}>
          <Text style={styles.label}>Total</Text>

          <Text style={styles.value}>{values.total}</Text>
        </View>
      </View>
    </View>
  );
}

export const MissionProgressCard = React.memo(MissionProgressCardBase);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "rgba(7, 24, 39, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  closeText: {
    color: "#CBD5E1",
    fontSize: 24,
    lineHeight: 26,
  },

  progressTrack: {
    width: "100%",
    height: 7,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    marginBottom: 14,
  },

  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },

  valuesContainer: {
    gap: 8,
  },

  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  label: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "500",
  },

  value: {
    minWidth: 36,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
  },
});
