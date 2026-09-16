import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  bannerVisibleFor,
  type TrajectoryPreviewState,
} from "../../utils/backendTrajectoryPreview";

interface Props {
  preview: TrajectoryPreviewState;
  hasAuthoringPoints?: boolean;
}

export function TrajectoryStatusBanner({
  preview,
  hasAuthoringPoints = false,
}: Props): React.ReactElement | null {
  const showOffline =
    (preview.phase === "offline" || preview.phase === "disconnected") &&
    hasAuthoringPoints;

  if (!bannerVisibleFor(preview) && !showOffline) {
    return null;
  }

  if (
    (preview.phase === "offline" || preview.phase === "disconnected") &&
    !hasAuthoringPoints
  ) {
    return null;
  }

  const tone =
    preview.phase === "failed"
      ? styles.failed
      : preview.phase === "ready"
        ? styles.truncated
        : preview.phase === "offline" || preview.phase === "disconnected"
          ? styles.offline
          : styles.waiting;

  return (
    <View style={[styles.banner, tone]} pointerEvents="none">
      <Text style={styles.text}>{preview.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 24,
  },
  waiting: {
    backgroundColor: "rgba(120, 53, 15, 0.88)",
  },
  failed: {
    backgroundColor: "rgba(127, 29, 29, 0.9)",
  },
  offline: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
  },
  truncated: {
    backgroundColor: "rgba(88, 28, 135, 0.88)",
  },
  text: {
    color: "#F8FAFC",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
});

export default TrajectoryStatusBanner;
