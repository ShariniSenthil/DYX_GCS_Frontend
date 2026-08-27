import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  RTK_HEADLINE_LABEL,
  type RtkHeadlineState,
} from "../../adapters/rtkControlAdapter";

interface Props {
  onPress: () => void;
  onManualPress?: () => void;
  manualLoading?: boolean;
  loading?: boolean;
  rtkState?: RtkHeadlineState;
}

const HEALTHY_STATES = new Set<RtkHeadlineState>([
  "corrections_active",
  "rtk_float",
  "rtk_fixed",
]);

const TRANSITIONAL_STATES = new Set<RtkHeadlineState>([
  "start_requested",
  "waiting_for_mavros",
  "starting",
  "reconnecting",
  "stopping",
]);

export const QuickNtripStartCard: React.FC<Props> = ({
  onPress,
  onManualPress,
  manualLoading = false,
  loading = false,
  rtkState = "off",
}) => {
  const healthy = HEALTHY_STATES.has(rtkState);
  const transitional = TRANSITIONAL_STATES.has(rtkState);

  // Mission Progress is quick-start only.
  // Once RTK has entered any lifecycle state other than OFF, this button
  // becomes status-only. Full control/Stop remains in RTK Settings.
  const rtkActionDisabled = loading || rtkState !== "off";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          healthy
            ? styles.buttonHealthy
            : transitional
              ? styles.buttonTransitional
              : rtkState === "degraded" || rtkState === "mavros_lost"
                ? styles.buttonDegraded
                : styles.buttonDisconnected,
          loading && styles.buttonLoading,
        ]}
        onPress={onPress}
        disabled={rtkActionDisabled}
        activeOpacity={0.82}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialCommunityIcons
            name="access-point-network"
            size={20}
            color="#ffffff"
          />
        )}

        <View style={styles.rtkCopy}>
          <Text style={styles.buttonText}>RTK-GPS</Text>
          <Text style={styles.statusText}>
            {RTK_HEADLINE_LABEL[rtkState]}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonManual]}
        onPress={onManualPress}
        disabled={!onManualPress || manualLoading}
        activeOpacity={0.82}
      >
        {manualLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialCommunityIcons
            name="gamepad-variant"
            size={20}
            color="#ffffff"
          />
        )}
        <Text style={styles.buttonText}>MANUAL</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "column",
    gap: 16,
  },
  button: {
    width: "100%",
    minHeight: 72,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  buttonDisconnected: {
    backgroundColor: "#dc2626",
  },
  buttonHealthy: {
    backgroundColor: "#16a34a",
  },
  buttonTransitional: {
    backgroundColor: "#d97706",
  },
  buttonDegraded: {
    backgroundColor: "#b45309",
  },
  buttonLoading: {
    opacity: 0.85,
  },
  buttonManual: {
    backgroundColor: "#334155",
  },
  rtkCopy: {
    alignItems: "flex-start",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statusText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
});
