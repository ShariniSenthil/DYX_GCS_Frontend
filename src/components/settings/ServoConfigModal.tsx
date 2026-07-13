import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';

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
  onSave: (config: ServoConfig) => Promise<{ success: boolean; message?: string }>;
  onTest: (config: Omit<ServoConfig, 'servo_enabled'>) => Promise<{ success: boolean; message?: string; status?: string }>;
}

export const ServoConfigModal: React.FC<ServoConfigModalProps> = ({
  visible,
  currentConfig,
  onClose,
  onSave,
  onTest,
}) => {
  // Local state for config values
  const [channel, setChannel] = useState(currentConfig.servo_channel);
  const [pwmOn, setPwmOn] = useState(currentConfig.servo_pwm_on);
  const [pwmOff, setPwmOff] = useState(currentConfig.servo_pwm_off);
  const [delayBefore, setDelayBefore] = useState(currentConfig.servo_delay_before);
  const [sprayDuration, setSprayDuration] = useState(currentConfig.servo_spray_duration);
  const [delayAfter, setDelayAfter] = useState(currentConfig.servo_delay_after);
  const [enabled, setEnabled] = useState(currentConfig.servo_enabled);

  // Local state for input text values (can be empty for typing)
  const [channelText, setChannelText] = useState(String(currentConfig.servo_channel));
  const [pwmOnText, setPwmOnText] = useState(String(currentConfig.servo_pwm_on));
  const [pwmOffText, setPwmOffText] = useState(String(currentConfig.servo_pwm_off));
  const [delayBeforeText, setDelayBeforeText] = useState(String(currentConfig.servo_delay_before));
  const [sprayDurationText, setSprayDurationText] = useState(String(currentConfig.servo_spray_duration));
  const [delayAfterText, setDelayAfterText] = useState(String(currentConfig.servo_delay_after));

  // UI state
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'pass' | 'fail' | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Update local state when currentConfig changes
  useEffect(() => {
    if (visible) {
      setChannel(currentConfig.servo_channel);
      setPwmOn(currentConfig.servo_pwm_on);
      setPwmOff(currentConfig.servo_pwm_off);
      setDelayBefore(currentConfig.servo_delay_before);
      setSprayDuration(currentConfig.servo_spray_duration);
      setDelayAfter(currentConfig.servo_delay_after);
      setEnabled(currentConfig.servo_enabled);
      setChannelText(String(currentConfig.servo_channel));
      setPwmOnText(String(currentConfig.servo_pwm_on));
      setPwmOffText(String(currentConfig.servo_pwm_off));
      setDelayBeforeText(String(currentConfig.servo_delay_before));
      setSprayDurationText(String(currentConfig.servo_spray_duration));
      setDelayAfterText(String(currentConfig.servo_delay_after));
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [visible, currentConfig]);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await onTest({
        servo_channel: channel,
        servo_pwm_on: pwmOn,
        servo_pwm_off: pwmOff,
        servo_delay_before: delayBefore,
        servo_spray_duration: sprayDuration,
        servo_delay_after: delayAfter,
      });

      if (result.success) {
        setTestResult('pass');
      } else {
        setTestResult('fail');
        Alert.alert('Test Failed', result.message || 'Servo test failed');
      }
    } catch (error) {
      setTestResult('fail');
      Alert.alert('Test Error', 'Failed to test servo configuration');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const result = await onSave({
        servo_channel: channel,
        servo_pwm_on: pwmOn,
        servo_pwm_off: pwmOff,
        servo_delay_before: delayBefore,
        servo_spray_duration: sprayDuration,
        servo_delay_after: delayAfter,
        servo_enabled: enabled,
      });

      if (result.success) {
        setSaveSuccess(true);
        // Auto-close after 1 second to show "OK" feedback
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        Alert.alert('Save Failed', result.message || 'Failed to save servo configuration');
      }
    } catch (error) {
      Alert.alert('Save Error', 'Failed to save servo configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleIncrement = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    textSetter: React.Dispatch<React.SetStateAction<string>>,
    value: number,
    step: number,
    max: number
  ) => {
    const newValue = Math.min(max, value + step);
    setter(newValue);
    textSetter(String(newValue));
  };

  const handleDecrement = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    textSetter: React.Dispatch<React.SetStateAction<string>>,
    value: number,
    step: number,
    min: number
  ) => {
    const newValue = Math.max(min, value - step);
    setter(newValue);
    textSetter(String(newValue));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚙️ Servo Configuration</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            {/* Enable/Disable Toggle */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Servo Control</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Enable Servo</Text>
                <View style={styles.toggleButtons}>
                  <TouchableOpacity
                    style={[styles.toggleButton, enabled && styles.toggleButtonActive]}
                    onPress={() => setEnabled(true)}
                  >
                    <Text style={[styles.toggleButtonText, enabled && styles.toggleButtonTextActive]}>
                      ENABLE
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, !enabled && styles.toggleButtonActive]}
                    onPress={() => setEnabled(false)}
                  >
                    <Text style={[styles.toggleButtonText, !enabled && styles.toggleButtonTextActive]}>
                      DISABLE
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Servo Channel */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Servo Channel (1-16)</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setChannel, setChannelText, channel, 1, 1)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={channelText}
                  onChangeText={(text) => {
                    setChannelText(text);
                    if (text !== '' && !isNaN(parseInt(text))) {
                      setChannel(Math.max(1, Math.min(16, parseInt(text))));
                    }
                  }}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setChannel, setChannelText, channel, 1, 16)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* PWM ON */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PWM ON (0-3000)</Text>
              <Text style={styles.description}>Pulse width for servo ON position</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setPwmOn, setPwmOnText, pwmOn, 100, 0)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={pwmOnText}
                  onChangeText={(text) => {
                    setPwmOnText(text);
                    if (text !== '' && !isNaN(parseInt(text))) {
                      setPwmOn(Math.max(0, Math.min(3000, parseInt(text))));
                    }
                  }}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setPwmOn, setPwmOnText, pwmOn, 100, 3000)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* PWM OFF */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PWM OFF (0-3000)</Text>
              <Text style={styles.description}>Pulse width for servo OFF position</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setPwmOff, setPwmOffText, pwmOff, 100, 0)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={pwmOffText}
                  onChangeText={(text) => {
                    setPwmOffText(text);
                    if (text !== '' && !isNaN(parseInt(text))) {
                      setPwmOff(Math.max(0, Math.min(3000, parseInt(text))));
                    }
                  }}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setPwmOff, setPwmOffText, pwmOff, 100, 3000)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Delay Before */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Delay Before (0-30s)</Text>
              <Text style={styles.description}>Wait time before activating servo</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setDelayBefore, setDelayBeforeText, delayBefore, 0.5, 0)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={delayBeforeText}
                  onChangeText={(text) => {
                    setDelayBeforeText(text);
                    if (text !== '' && text !== '.' && !isNaN(parseFloat(text))) {
                      setDelayBefore(Math.max(0, Math.min(30, parseFloat(text))));
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setDelayBefore, setDelayBeforeText, delayBefore, 0.5, 30)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Spray Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spray Duration (0-30s)</Text>
              <Text style={styles.description}>How long to keep servo ON</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setSprayDuration, setSprayDurationText, sprayDuration, 0.2, 0)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={sprayDurationText}
                  onChangeText={(text) => {
                    setSprayDurationText(text);
                    if (text !== '' && text !== '.' && !isNaN(parseFloat(text))) {
                      setSprayDuration(Math.max(0, Math.min(30, parseFloat(text))));
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setSprayDuration, setSprayDurationText, sprayDuration, 0.2, 30)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Delay After */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Delay After (0-30s)</Text>
              <Text style={styles.description}>Wait time after deactivating servo</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleDecrement(setDelayAfter, setDelayAfterText, delayAfter, 0.5, 0)}
                >
                  <Text style={styles.incrementText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={delayAfterText}
                  onChangeText={(text) => {
                    setDelayAfterText(text);
                    if (text !== '' && text !== '.' && !isNaN(parseFloat(text))) {
                      setDelayAfter(Math.max(0, Math.min(30, parseFloat(text))));
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                />
                <TouchableOpacity
                  style={styles.incrementButton}
                  onPress={() => handleIncrement(setDelayAfter, setDelayAfterText, delayAfter, 0.5, 30)}
                >
                  <Text style={styles.incrementText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            {/* Test Result Indicator */}
            {testResult && (
              <View style={[styles.testResult, testResult === 'pass' ? styles.testPass : styles.testFail]}>
                <Text style={styles.testResultText}>
                  {testResult === 'pass' ? '✅ TEST PASSED' : '❌ TEST FAILED'}
                </Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              {/* Test Config Button */}
              <TouchableOpacity
                style={[styles.actionButton, styles.testButton]}
                onPress={handleTest}
                disabled={isTesting || isSaving}
              >
                {isTesting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.actionButtonText}>🧪 Test Config</Text>
                )}
              </TouchableOpacity>

              {/* Save Config Button */}
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton, saveSuccess && styles.saveButtonSuccess]}
                onPress={handleSave}
                disabled={isTesting || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : saveSuccess ? (
                  <Text style={styles.actionButtonText}>✅ OK</Text>
                ) : (
                  <Text style={styles.actionButtonText}>💾 Save Config</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '95%',
    height: '95%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#002244',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(103, 232, 249, 0.3)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.text,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  section: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.2)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#4a5568',
  },
  toggleButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  toggleButtonTextActive: {
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#4a5568',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  incrementButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#1a75d2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#059669',
  },
  incrementText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#002244',
    borderTopWidth: 1,
    borderTopColor: 'rgba(103, 232, 249, 0.3)',
  },
  testResult: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  testPass: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  testFail: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  testResultText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButton: {
    backgroundColor: '#7c3aed',
  },
  saveButton: {
    backgroundColor: '#10b981',
  },
  saveButtonSuccess: {
    backgroundColor: '#059669',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
});
