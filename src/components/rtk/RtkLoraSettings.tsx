import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  RTK_LORA_BAUD_OPTIONS,
  type RtkCorrectionSource,
  type RtkCorrectionSourceName,
  type RtkCorrectionSourceUpdateRequest,
  type RtkDesiredState,
  type RtkParsedApiError,
  type RtkSerialPort,
} from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  settings: RtkCorrectionSource | null;
  savedSource: RtkCorrectionSourceName | null;
  desiredState: RtkDesiredState | null;
  ports: RtkSerialPort[];
  portsLoading: boolean;
  portsError: RtkParsedApiError | null;
  /** Active NTRIP profile's receiver port, used only to pre-fill output. */
  suggestedOutputDevice: string | null;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
  canStart: boolean;
  canStop: boolean;
  onRefreshPorts: () => Promise<unknown>;
  onSave: (dto: RtkCorrectionSourceUpdateRequest) => Promise<unknown>;
  onStart: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

interface Draft {
  radio: string | null;
  baud: number;
  direct: boolean;
  output: string | null;
}

function draftFrom(
  settings: RtkCorrectionSource | null,
  suggestedOutput: string | null,
): Draft {
  return {
    radio: settings?.lora_serial_device ?? null,
    baud: settings?.lora_serial_baud ?? 57600,
    direct: settings?.lora_direct_inject ?? true,
    output: settings?.lora_direct_serial_device ?? suggestedOutput ?? null,
  };
}

function shortDevice(path: string | null): string {
  if (!path) {
    return "—";
  }
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export const RtkLoraSettings: React.FC<Props> = ({
  settings,
  savedSource,
  desiredState,
  ports,
  portsLoading,
  portsError,
  suggestedOutputDevice,
  busy = false,
  disabled = false,
  disabledReason,
  canStart,
  canStop,
  onRefreshPorts,
  onSave,
  onStart,
  onStop,
}) => {
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(settings, suggestedOutputDevice),
  );

  // Reload the form whenever the backend's saved settings change.
  const revision = settings?.revision ?? null;
  useEffect(() => {
    setDraft(draftFrom(settings, suggestedOutputDevice));
    // settings is read through revision; suggestion only matters on reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const loraInUse = savedSource === "LORA";
  const running = desiredState === "RUNNING";
  const controlsDisabled = busy || disabled;

  const radioPorts = useMemo(
    () => ports.filter((port) => port.role !== "gnss_receiver"),
    [ports],
  );
  const receiverPorts = useMemo(
    () => ports.filter((port) => port.role === "gnss_receiver"),
    [ports],
  );

  const dirty =
    settings == null ||
    draft.radio !== settings.lora_serial_device ||
    draft.baud !== settings.lora_serial_baud ||
    draft.direct !== settings.lora_direct_inject ||
    (draft.direct && draft.output !== settings.lora_direct_serial_device);

  const formProblem = !draft.radio
    ? "Select the LoRa radio port"
    : draft.direct && !draft.output
      ? "Select the GNSS receiver output port"
      : draft.direct && draft.output === draft.radio
        ? "Radio and output must be different ports"
        : null;

  const buildBody = (useLora: boolean): RtkCorrectionSourceUpdateRequest => {
    const body: RtkCorrectionSourceUpdateRequest = {
      lora_serial_device: draft.radio,
      lora_serial_baud: draft.baud,
      lora_direct_inject: draft.direct,
    };
    if (draft.direct) {
      body.lora_direct_serial_device = draft.output;
    }
    if (useLora) {
      body.source = "LORA";
    }
    return body;
  };

  const confirmThen = (title: string, message: string, action: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: action },
    ]);
  };

  const handleSave = () => {
    if (formProblem) {
      Alert.alert("LoRa settings incomplete", formProblem);
      return;
    }
    const save = () => void onSave(buildBody(false));
    if (loraInUse && running) {
      confirmThen(
        "Restart LoRa corrections?",
        "RTK is running on LoRa. Saving restarts it with these settings; corrections pause for a few seconds.",
        save,
      );
      return;
    }
    save();
  };

  const handleUseLora = () => {
    if (formProblem) {
      Alert.alert("LoRa settings incomplete", formProblem);
      return;
    }
    confirmThen(
      "Use LoRa for RTK corrections?",
      running
        ? "RTK is running on NTRIP. It will restart on LoRa now, and LoRa will also start on every boot. Corrections pause for a few seconds."
        : "LoRa becomes the saved correction source and is used whenever RTK starts, including after a reboot. RTK stays stopped until you press Start.",
      () => void onSave(buildBody(true)),
    );
  };

  const renderPort = (
    port: RtkSerialPort,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={port.path}
      onPress={onPress}
      disabled={controlsDisabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: controlsDisabled }}
      style={[
        styles.port,
        selected && styles.portSelected,
        controlsDisabled && styles.disabled,
      ]}
    >
      <Text style={styles.portLabel} numberOfLines={1}>
        {port.label}
      </Text>
      <Text style={styles.portPath} numberOfLines={1}>
        {port.device === port.path ? port.path : `${shortDevice(port.device)} · ${port.path}`}
      </Text>
    </Pressable>
  );

  const missingSaved = (path: string | null, list: RtkSerialPort[]) =>
    path != null && !list.some((port) => port.path === path);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>LoRa radio corrections</Text>
        <Text style={[styles.badge, loraInUse ? styles.badgeOn : styles.badgeOff]}>
          {loraInUse ? "IN USE" : "NOT IN USE"}
        </Text>
      </View>
      {disabledReason ? <Text style={styles.reason}>{disabledReason}</Text> : null}

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <View style={styles.sectionHead}>
          <Text style={styles.section}>Radio port</Text>
          <Pressable
            onPress={() => void onRefreshPorts()}
            disabled={controlsDisabled || portsLoading}
            style={[styles.refresh, (controlsDisabled || portsLoading) && styles.disabled]}
          >
            {portsLoading ? (
              <ActivityIndicator color={colors.cyan} />
            ) : (
              <Text style={styles.refreshText}>Refresh ports</Text>
            )}
          </Pressable>
        </View>
        {portsError ? (
          <Text style={styles.error}>{portsError.message}</Text>
        ) : null}
        {!portsLoading && radioPorts.length === 0 && !portsError ? (
          <Text style={styles.empty}>No serial ports found on the rover.</Text>
        ) : null}
        {radioPorts.map((port) =>
          renderPort(port, port.path === draft.radio, () =>
            setDraft((d) => ({ ...d, radio: port.path })),
          ),
        )}
        {missingSaved(draft.radio, radioPorts) ? (
          <Text style={styles.warn}>
            Saved radio port {draft.radio} is not currently present on the rover.
          </Text>
        ) : null}

        <Text style={styles.section}>Radio baud</Text>
        <View style={styles.chips}>
          {RTK_LORA_BAUD_OPTIONS.map((baud) => (
            <Pressable
              key={baud}
              onPress={() => setDraft((d) => ({ ...d, baud }))}
              disabled={controlsDisabled}
              style={[
                styles.chip,
                draft.baud === baud && styles.chipSelected,
                controlsDisabled && styles.disabled,
              ]}
            >
              <Text style={styles.chipText}>{baud}</Text>
            </Pressable>
          ))}
        </View>
        {!RTK_LORA_BAUD_OPTIONS.includes(draft.baud as (typeof RTK_LORA_BAUD_OPTIONS)[number]) ? (
          <Text style={styles.warn}>Saved baud {draft.baud} (custom).</Text>
        ) : null}

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.section}>Output direct to GNSS receiver</Text>
            <Text style={styles.hint}>
              Off = inject through MAVROS / PX4 instead.
            </Text>
          </View>
          <Switch
            value={draft.direct}
            onValueChange={(direct) => setDraft((d) => ({ ...d, direct }))}
            disabled={controlsDisabled}
          />
        </View>

        {draft.direct ? (
          <>
            <Text style={styles.section}>Receiver output port</Text>
            {receiverPorts.length === 0 && !portsLoading ? (
              <Text style={styles.empty}>No GNSS receiver port found.</Text>
            ) : null}
            {receiverPorts.map((port) =>
              renderPort(port, port.path === draft.output, () =>
                setDraft((d) => ({ ...d, output: port.path })),
              ),
            )}
            {missingSaved(draft.output, receiverPorts) ? (
              <Text style={styles.warn}>
                Output port {draft.output} is not currently present on the rover.
              </Text>
            ) : null}
          </>
        ) : null}

        {formProblem ? <Text style={styles.warn}>{formProblem}</Text> : null}
      </ScrollView>

      <View style={styles.actions}>
        {!loraInUse ? (
          <Pressable
            onPress={handleUseLora}
            disabled={controlsDisabled || formProblem != null}
            style={[
              styles.action,
              styles.save,
              (controlsDisabled || formProblem != null) && styles.disabled,
            ]}
          >
            <Text style={styles.actionText}>Use LoRa</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSave}
            disabled={controlsDisabled || !dirty}
            style={[
              styles.action,
              styles.secondary,
              (controlsDisabled || !dirty) && styles.disabled,
            ]}
          >
            <Text style={styles.actionText}>Save</Text>
          </Pressable>
        )}
        {!loraInUse ? (
          <Pressable
            onPress={handleSave}
            disabled={controlsDisabled || !dirty}
            style={[
              styles.action,
              styles.secondary,
              (controlsDisabled || !dirty) && styles.disabled,
            ]}
          >
            <Text style={styles.actionText}>Save only</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void onStart()}
          disabled={!loraInUse || !canStart || controlsDisabled || dirty}
          style={[
            styles.action,
            styles.save,
            (!loraInUse || !canStart || controlsDisabled || dirty) && styles.disabled,
          ]}
        >
          <Text style={styles.actionText}>Start</Text>
        </Pressable>
        <Pressable
          onPress={() => void onStop()}
          disabled={!loraInUse || !canStop || controlsDisabled}
          style={[
            styles.action,
            styles.stop,
            (!loraInUse || !canStop || controlsDisabled) && styles.disabled,
          ]}
        >
          <Text style={styles.actionText}>Stop</Text>
        </Pressable>
        {loraInUse && dirty ? (
          <Text style={styles.actionHint}>Save before starting.</Text>
        ) : null}
        {!loraInUse ? (
          <Text style={styles.actionHint}>
            NTRIP is in use. Start/Stop here after switching to LoRa.
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeOn: {
    color: "#041018",
    backgroundColor: colors.success,
  },
  badgeOff: {
    color: colors.textSecondary,
    backgroundColor: colors.surface,
  },
  reason: {
    color: colors.warning,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  refresh: {
    minHeight: 40,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: {
    color: colors.cyan,
    fontWeight: "700",
  },
  port: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
  },
  portSelected: {
    borderColor: colors.success,
    backgroundColor: "#0d2a22",
  },
  portLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  portPath: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: 44,
    minWidth: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  chipSelected: {
    borderColor: colors.success,
    backgroundColor: "#0d2a22",
  },
  chipText: {
    color: colors.text,
    fontWeight: "800",
  },
  switchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  switchCopy: {
    flex: 1,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  warn: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  save: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: "#1e3a54",
  },
  stop: {
    backgroundColor: colors.danger,
  },
  actionText: {
    color: "#fff",
    fontWeight: "800",
  },
  actionHint: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  disabled: {
    opacity: 0.45,
  },
});
