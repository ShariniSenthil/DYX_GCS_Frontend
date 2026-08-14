import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ServoConfig {
  servo_channel: number;
  servo_pwm_on: number;
  servo_pwm_off: number;
  servo_delay_before: number;
  servo_spray_duration: number;
  servo_delay_after: number;
  servo_enabled: boolean;
}

interface ServoConfigModalProps {
  visible: boolean;

  currentConfig: ServoConfig;

  onClose: () => void;

  onSave: (config: ServoConfig) => Promise<{
    success: boolean;
    message?: string;
  }>;

  // Kept for compatibility with SettingsScreen.
  onTest?: (config: Omit<ServoConfig, "servo_enabled">) => Promise<{
    success: boolean;
    message?: string;
    status?: string;
  }>;
}

export const ServoConfigModal: React.FC<ServoConfigModalProps> = ({
  visible,
  currentConfig,
  onClose,
  onSave,
}) => {
  const [pressPwmText, setPressPwmText] = useState(
    String(currentConfig.servo_pwm_on),
  );

  const [releasePwmText, setReleasePwmText] = useState(
    String(currentConfig.servo_pwm_off),
  );

  const [isSaving, setIsSaving] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setPressPwmText(String(currentConfig.servo_pwm_on));

    setReleasePwmText(String(currentConfig.servo_pwm_off));

    setSaveSuccess(false);
  }, [visible, currentConfig.servo_pwm_on, currentConfig.servo_pwm_off]);

  const parsePwm = (text: string, label: string): number | null => {
    const value = Number.parseInt(text, 10);

    if (!Number.isFinite(value) || value < 1000 || value > 2000) {
      Alert.alert("Invalid PWM", `${label} must be between 1000 and 2000 µs.`);

      return null;
    }

    return value;
  };

  const adjustPwm = (
    currentText: string,
    setter: (value: string) => void,
    amount: number,
  ) => {
    const current = Number.parseInt(currentText, 10);

    const safeCurrent = Number.isFinite(current) ? current : 1500;

    const next = Math.max(1000, Math.min(2000, safeCurrent + amount));

    setter(String(next));
  };

  const handleSave = async () => {
    const pressPwm = parsePwm(pressPwmText, "Press PWM");

    if (pressPwm === null) {
      return;
    }

    const releasePwm = parsePwm(releasePwmText, "Release PWM");

    if (releasePwm === null) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await onSave({
        ...currentConfig,

        // Existing frontend names are retained
        // here. SettingsScreen converts them
        // into the new backend API names.
        servo_pwm_on: pressPwm,
        servo_pwm_off: releasePwm,
      });

      if (!response.success) {
        Alert.alert(
          "Save Failed",
          response.message || "Failed to update spray PWM.",
        );

        return;
      }

      setSaveSuccess(true);

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (error) {
      Alert.alert(
        "Save Error",
        error instanceof Error ? error.message : "Failed to update spray PWM.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Spray Servo Configuration</Text>

              <Text style={styles.subtitle}>PX4 AUX5 • Actuator Set 1</Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Hardware mapping</Text>

            <Text style={styles.infoText}>
              AUX5 is fixed by the rover backend. Only PRESS and RELEASE PWM
              values are configurable here.
            </Text>

            <Text style={styles.infoText}>
              Current spray duration:{" "}
              {currentConfig.servo_spray_duration.toFixed(2)}s
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PRESS PWM</Text>

            <Text style={styles.description}>
              Servo position used while spraying. Valid range: 1000–2000 µs.
            </Text>

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustPwm(pressPwmText, setPressPwmText, -10)}
              >
                <Text style={styles.adjustText}>−</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                value={pressPwmText}
                onChangeText={(text) =>
                  setPressPwmText(text.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={4}
              />

              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustPwm(pressPwmText, setPressPwmText, 10)}
              >
                <Text style={styles.adjustText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>RELEASE PWM</Text>

            <Text style={styles.description}>
              Safe servo position after spraying. Valid range: 1000–2000 µs.
            </Text>

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() =>
                  adjustPwm(releasePwmText, setReleasePwmText, -10)
                }
              >
                <Text style={styles.adjustText}>−</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                value={releasePwmText}
                onChangeText={(text) =>
                  setReleasePwmText(text.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={4}
              />

              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustPwm(releasePwmText, setReleasePwmText, 10)}
              >
                <Text style={styles.adjustText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saveSuccess && styles.successButton]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveText}>
                {saveSuccess ? "✓ SAVED" : "SAVE PWM"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  container: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  title: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },

  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
    fontSize: 12,
  },

  closeButton: {
    padding: 8,
  },

  closeText: {
    color: "#cbd5e1",
    fontSize: 20,
  },

  infoBox: {
    backgroundColor: "#172033",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },

  infoTitle: {
    color: "#67e8f9",
    fontWeight: "700",
    marginBottom: 6,
  },

  infoText: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 3,
  },

  field: {
    marginBottom: 18,
  },

  label: {
    color: "#ffffff",
    fontWeight: "700",
    marginBottom: 4,
  },

  description: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 10,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  adjustButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#475569",
  },

  adjustText: {
    color: "#ffffff",
    fontSize: 24,
  },

  input: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },

  saveButton: {
    minHeight: 50,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  successButton: {
    backgroundColor: "#059669",
  },

  saveText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
});

export default ServoConfigModal;
