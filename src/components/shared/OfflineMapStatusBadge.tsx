import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useOfflineMap } from "../../context/OfflineMapContext";

/** A compact, non-blocking status surface. It never controls map visibility. */
export function OfflineMapStatusBadge(): React.ReactElement | null {
  const { status, retry } = useOfflineMap();
  if (status.phase === "ready" || status.phase === "waiting" || status.phase === "unsupported") return null;

  const failed = status.phase === "failed";
  return (
    <Pressable
      onPress={failed ? retry : undefined}
      disabled={!failed}
      style={[styles.badge, failed && styles.failed]}
      accessibilityRole={failed ? "button" : "text"}
      accessibilityLabel={failed ? "Retry offline map download" : status.message}
    >
      <Text style={styles.text}>{failed ? "Offline map failed — tap to retry" : status.message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 24,
  },
  failed: { backgroundColor: "rgba(127, 29, 29, 0.92)" },
  text: { color: "#e2e8f0", fontSize: 12 },
});
