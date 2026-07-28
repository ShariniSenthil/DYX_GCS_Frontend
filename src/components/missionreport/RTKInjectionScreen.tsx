import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors } from "../../theme/colors";
import type { RoverServices } from "../../hooks/useRoverTelemetry";
import { NTRIPProfileList } from "./NTRIPProfileList";
import { NTRIPProfileEditor } from "./NTRIPProfileEditor";
import type { NTRIPProfile } from "../../types/ntrip";
import { getAllProfiles } from "../../services/ntripProfileStorage";
import {
  applyNtripConfiguration,
  getRtkConfiguration,
  getRtkStatus,
  reconnectRtk,
  type ActiveRtkConfiguration,
  type RtkStatusResponse,
} from "../../services/rtkService";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Retained temporarily so MissionReportScreen does not need a prop change. */
  services: RoverServices;
  isConnected: boolean;
}

type ModalScreen = "list" | "editor";

function profileMatchesConfiguration(
  profile: NTRIPProfile,
  configuration: ActiveRtkConfiguration,
): boolean {
  return (
    profile.casterAddress.trim().toLowerCase() ===
      configuration.host.trim().toLowerCase() &&
    Number.parseInt(profile.port || "2101", 10) === configuration.port &&
    profile.mountpoint.trim().replace(/^\/+/, "") ===
      configuration.mountpoint.trim().replace(/^\/+/, "") &&
    profile.username.trim() === configuration.username.trim()
  );
}

function statusLabel(
  status: RtkStatusResponse | null,
  roverConnected: boolean,
): string {
  if (!roverConnected) return "Rover Offline";
  if (!status) return "Loading";

  const state = String(status.status || "")
    .trim()
    .toUpperCase();
  const correctionsHealthy = Boolean(status.healthy && status.correction_fresh);

  if (state === "AUTH_FAILED") return "Authentication Failed";
  if (state === "DNS_FAILED") return "DNS / Internet Unavailable";
  if (state === "NETWORK_TIMEOUT") return "Network Timeout";
  if (state === "NETWORK_ERROR") return "Network Error";
  if (state === "CASTER_UNREACHABLE") return "Caster Unreachable";
  if (state === "CASTER_REJECTED") return "Caster Rejected";
  if (state === "STREAM_STALE") return "RTCM Stream Stale";
  if (state === "CONFIG_REQUIRED") return "Configuration Required";
  if (state === "ERROR") return "RTK Error";
  if (state === "DISCONNECTED") return "Disconnected";
  if (state === "UNAVAILABLE") return "Unavailable";
  if (state === "CONNECTING") return "Connecting";
  if (state === "RELOADING") return "Reloading";
  if (state === "RECONNECT_WAIT") return "Reconnecting";
  if (state === "STARTING") return "Starting";

  // RTK Fixed/Float is green only while fresh corrections are present.
  if (correctionsHealthy && (status.rtk_fixed || status.fix_type >= 6)) {
    return "RTK Fixed";
  }
  if (correctionsHealthy && status.fix_type === 5) return "RTK Float";
  if (correctionsHealthy) return "Corrections Active";
  if (state === "CONNECTED") return "Connected — No Fresh Corrections";

  return "No RTK Corrections";
}

function formatFixLabel(status: RtkStatusResponse | null): string {
  if (!status) return "—";

  const readable = String(status.fix_name || "NO_FIX")
    .replace(/_/g, " ")
    .toUpperCase();
  const correctionsHealthy = Boolean(status.healthy && status.correction_fresh);

  if (status.fix_type < 5 || !correctionsHealthy) {
    return `${readable} — NO RTK`;
  }

  return readable;
}

export const RTKInjectionScreen: React.FC<Props> = ({
  visible,
  onClose,
  isConnected,
}) => {
  const [modalScreen, setModalScreen] = useState<ModalScreen>("list");
  const [selectedProfile, setSelectedProfile] = useState<NTRIPProfile | null>(
    null,
  );
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeConfiguration, setActiveConfiguration] =
    useState<ActiveRtkConfiguration | null>(null);
  const [status, setStatus] = useState<RtkStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const findActiveLocalProfile = useCallback(
    async (configuration: ActiveRtkConfiguration | null): Promise<void> => {
      if (!configuration) {
        setActiveProfileId(null);
        return;
      }

      try {
        const profiles = await getAllProfiles();
        const match = profiles.find((profile) =>
          profileMatchesConfiguration(profile, configuration),
        );
        setActiveProfileId(match?.id ?? null);
      } catch (profileError) {
        console.warn(
          "[RTKInjection] Unable to match active local profile:",
          profileError,
        );
      }
    },
    [],
  );

  const refreshConfiguration = useCallback(async (): Promise<void> => {
    const response = await getRtkConfiguration();
    const active = response.configuration.active;
    setActiveConfiguration(active);
    await findActiveLocalProfile(active);
  }, [findActiveLocalProfile]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!visible || !isConnected) {
      setStatus(null);
      return;
    }

    try {
      const nextStatus = await getRtkStatus();
      setStatus(nextStatus);

      const nextState = String(nextStatus.status || "")
        .trim()
        .toUpperCase();
      if (nextState === "AUTH_FAILED") {
        setError(
          nextStatus.last_error ||
            "NTRIP authentication failed. Check mountpoint, username and password.",
        );
      } else if (nextState === "CONFIG_REQUIRED") {
        setError("No persistent NTRIP configuration is saved on the Jetson.");
      } else if (nextStatus.healthy && nextStatus.correction_fresh) {
        setError(null);
      }
    } catch (statusError) {
      console.warn("[RTKInjection] Failed to read RTK status:", statusError);
      setStatus(null);
    }
  }, [isConnected, visible]);

  const loadScreen = useCallback(async (): Promise<void> => {
    if (!visible || !isConnected) {
      setStatus(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await Promise.all([refreshConfiguration(), refreshStatus()]);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load RTK configuration.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, refreshConfiguration, refreshStatus, visible]);

  useEffect(() => {
    if (!visible) return;
    void loadScreen();
  }, [loadScreen, visible]);

  useEffect(() => {
    if (!visible || !isConnected) return undefined;

    const timer = setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => clearInterval(timer);
  }, [isConnected, refreshStatus, visible]);

  const handleSelectProfile = async (profile: NTRIPProfile): Promise<void> => {
    if (!isConnected) {
      Alert.alert(
        "Rover Disconnected",
        "Connect to the rover Wi-Fi before applying RTK settings.",
      );
      return;
    }

    const host = profile.casterAddress.trim();
    const port = Number.parseInt(profile.port || "2101", 10);
    const mountpoint = profile.mountpoint.trim().replace(/^\/+/, "");
    const username = profile.username.trim();
    const password = profile.password.trim();

    if (
      !host ||
      !mountpoint ||
      !username ||
      !Number.isFinite(port) ||
      port < 1 ||
      port > 65535
    ) {
      Alert.alert(
        "Invalid RTK Profile",
        "Enter a valid caster host, port, mountpoint, and username.",
      );
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const { update, outcome } = await applyNtripConfiguration({
        host,
        port,
        mountpoint,
        username,
        ...(password ? { password } : {}),
      });

      const savedConfiguration: ActiveRtkConfiguration = {
        host: update.configuration.host,
        port: update.configuration.port,
        mountpoint: update.configuration.mountpoint,
        username: update.configuration.username,
        password_configured: update.configuration.password_configured,
        caster_url: update.configuration.caster_url,
      };

      setActiveConfiguration(savedConfiguration);
      setStatus(outcome.status);

      if (outcome.kind === "healthy") {
        setActiveProfileId(profile.id);
        setFeedback("RTCM corrections are active and fresh.");
        Alert.alert(
          "RTK Connected",
          "Authenticated RTCM corrections are now flowing.",
        );
      } else if (outcome.kind === "failed") {
        setActiveProfileId(null);
        const failureMessage =
          outcome.status.last_error ||
          `RTK connection failed (${outcome.status.status}).`;
        setError(failureMessage);
        Alert.alert("RTK Connection Failed", failureMessage);
      } else {
        setActiveProfileId(null);
        setFeedback(
          "Configuration saved. The bridge is still connecting; status will continue updating.",
        );
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to save the RTK configuration.";
      setError(message);
      Alert.alert("RTK Configuration Failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconnect = async (): Promise<void> => {
    if (!isConnected) {
      Alert.alert(
        "Rover Disconnected",
        "Connect to the rover Wi-Fi before reconnecting RTK.",
      );
      return;
    }

    setIsReconnecting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await reconnectRtk();
      setFeedback(response.message || "RTK reconnect requested.");
      await refreshStatus();
    } catch (reconnectError) {
      const message =
        reconnectError instanceof Error
          ? reconnectError.message
          : "Unable to reconnect RTK.";
      setError(message);
      Alert.alert("RTK Reconnect Failed", message);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleAddNewProfile = (): void => {
    setSelectedProfile(null);
    setModalScreen("editor");
  };

  const handleEditProfile = (profile: NTRIPProfile): void => {
    setSelectedProfile(profile);
    setModalScreen("editor");
  };

  const handleProfileSaved = (): void => {
    setSelectedProfile(null);
    setModalScreen("list");
  };

  const handleCancelEdit = (): void => {
    setSelectedProfile(null);
    setModalScreen("list");
  };

  if (!visible) return null;

  const label = statusLabel(status, isConnected);
  const statusState = String(status?.status || "")
    .trim()
    .toUpperCase();
  const isHealthy = Boolean(status?.healthy && status?.correction_fresh);
  const isFixed = Boolean(
    isHealthy && (status?.rtk_fixed || (status?.fix_type ?? 0) >= 6),
  );
  const isErrorState = Boolean(
    isConnected &&
    status &&
    [
      "AUTH_FAILED",
      "CONFIG_REQUIRED",
      "DNS_FAILED",
      "NETWORK_TIMEOUT",
      "NETWORK_ERROR",
      "CASTER_UNREACHABLE",
      "CASTER_REJECTED",
      "STREAM_STALE",
      "DISCONNECTED",
      "UNAVAILABLE",
      "ERROR",
    ].includes(statusState),
  );

  const pillStyle =
    isFixed || isHealthy
      ? styles.pillSuccess
      : isErrorState || !isConnected
        ? styles.pillDanger
        : styles.pillPending;

  const rtkDotColor = isHealthy
    ? colors.success
    : isErrorState || !isConnected
      ? colors.danger
      : colors.accent;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>RTK INJECTION</Text>
          <View
            style={[styles.connectionDot, { backgroundColor: rtkDotColor }]}
          />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>NTRIP Caster</Text>
              <View style={[styles.statusPill, pillStyle]}>
                <Text style={styles.pillText}>{label}</Text>
              </View>
            </View>

            {!isConnected ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageLabel}>Rover connection</Text>
                <Text style={styles.messageValue}>
                  Connect to the rover Wi-Fi to view or change RTK settings.
                </Text>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.loadingText}>
                  Loading RTK configuration...
                </Text>
              </View>
            ) : modalScreen === "list" ? (
              <NTRIPProfileList
                onSelectProfile={handleSelectProfile}
                onAddNew={handleAddNewProfile}
                onEditProfile={handleEditProfile}
                isConnecting={isSubmitting}
                activeProfileId={isHealthy ? activeProfileId : null}
                isStreamRunning={isHealthy}
              />
            ) : (
              <NTRIPProfileEditor
                profile={selectedProfile}
                onSave={handleProfileSaved}
                onCancel={handleCancelEdit}
              />
            )}

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>GNSS Fix</Text>
                <Text style={styles.summaryValue}>
                  {formatFixLabel(status)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Satellites</Text>
                <Text style={styles.summaryValue}>
                  {status ? status.satellites_visible : "—"}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Correction</Text>
                <Text style={styles.summaryValue}>
                  {status?.correction_fresh ? "Fresh" : "Not Fresh"}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Correction Age</Text>
                <Text style={styles.summaryValue}>
                  {status?.correction_age_sec == null
                    ? "—"
                    : `${status.correction_age_sec.toFixed(2)} s`}
                </Text>
              </View>
            </View>

            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Active caster</Text>
              <Text style={styles.messageValue}>
                {activeConfiguration
                  ? `${activeConfiguration.host}:${activeConfiguration.port}/${activeConfiguration.mountpoint}`
                  : "No RTK caster configuration saved"}
              </Text>
              {activeConfiguration ? (
                <Text style={styles.messageSubValue}>
                  User: {activeConfiguration.username} • Password:{" "}
                  {activeConfiguration.password_configured
                    ? "Configured"
                    : "Missing"}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.reconnectButton,
                (!isConnected || isReconnecting || !activeConfiguration) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleReconnect}
              disabled={!isConnected || isReconnecting || !activeConfiguration}
            >
              {isReconnecting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : null}
              <Text style={styles.reconnectButtonText}>
                {isReconnecting ? "Reconnecting..." : "Reconnect Saved RTK"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              Selecting a profile saves it permanently on the Jetson and
              automatically reconnects the RTK bridge. You do not need to send
              the profile again after a reboot.
            </Text>

            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 20000,
    elevation: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "92%",
    height: "90%",
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    zIndex: 20001,
    elevation: 21,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.secondary,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: colors.text,
    fontSize: 18,
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
  },
  bodyContent: {
    paddingVertical: 12,
    paddingBottom: 32,
  },
  sectionCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  pillSuccess: {
    backgroundColor: colors.success,
  },
  pillDanger: {
    backgroundColor: colors.danger,
  },
  pillPending: {
    backgroundColor: colors.accent,
  },
  pillText: {
    color: "#0A1628",
    fontWeight: "700",
    fontSize: 12,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  loadingText: {
    color: colors.textSecondary,
    marginLeft: 10,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    marginHorizontal: -4,
  },
  summaryItem: {
    width: "50%",
    padding: 4,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  messageBox: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  messageLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  messageValue: {
    color: colors.text,
    fontSize: 14,
  },
  messageSubValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },
  reconnectButton: {
    minHeight: 46,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  reconnectButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  feedback: {
    marginTop: 10,
    color: colors.success,
  },
  error: {
    marginTop: 10,
    color: colors.danger,
  },
});
