import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors } from '../../theme/colors';
import { GpsFailsafeMode } from '../../types/telemetry';

interface FailsafeModeSelectorProps {
  visible: boolean;
  currentMode: GpsFailsafeMode;
  onModeChange: (mode: GpsFailsafeMode) => void;
  onClose: () => void;
  disabled?: boolean;
}

export const FailsafeModeSelector: React.FC<FailsafeModeSelectorProps> = ({
  visible,
  currentMode,
  onModeChange,
  onClose,
  disabled = false,
}: FailsafeModeSelectorProps) => {
  // Log when modal opens
  React.useEffect(() => {
    if (visible) {
      console.log('[FailsafeModeSelector] Opened - Mode:', currentMode, '| Can change:', !disabled);
    }
  }, [visible]);

  const modes: Array<{ value: GpsFailsafeMode; label: string; desc: string; color: string; icon: string }> = [
    { value: 'disable', label: 'Disabled', desc: 'No failsafe checks', color: '#888', icon: '⚪' },
    { value: 'strict', label: 'Strict', desc: 'Pause + await acknowledgement', color: '#FF6B6B', icon: '🔴' },
    { value: 'relax', label: 'Relax', desc: 'Suppress servo only', color: '#FFA500', icon: '🟠' },
  ];

  const handleModeSelect = (mode: GpsFailsafeMode) => {
    if (!disabled) {
      onModeChange(mode);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.dropdown}>
          <View style={styles.header}>
            <Text style={styles.title}>GPS Failsafe Mode</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modesContainer}>
            {modes.map((mode) => (
              <TouchableOpacity
                key={mode.value}
                style={[
                  styles.modeButton,
                  currentMode === mode.value && styles.modeButtonActive,
                  disabled && styles.modeButtonDisabled,
                ]}
                onPress={() => handleModeSelect(mode.value)}
                disabled={disabled}
              >
                <Text style={styles.modeIcon}>{mode.icon}</Text>
                <View style={styles.modeContent}>
                  <Text style={[styles.modeLabel, currentMode === mode.value && styles.modeLabelActive]}>
                    {mode.label}
                  </Text>
                  <Text style={styles.modeDesc}>{mode.desc}</Text>
                </View>
                {currentMode === mode.value && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
          {disabled && (
            <Text style={styles.disabledNote}>Cannot change mode while mission is running</Text>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdown: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modesContainer: {
    gap: 10,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panelBg,
    borderRadius: 8,
    padding: 14,
    borderWidth: 2,
    borderColor: colors.border,
  },
  modeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}15`,
  },
  modeButtonDisabled: {
    opacity: 0.5,
  },
  modeIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  modeContent: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  modeLabelActive: {
    color: colors.primary,
  },
  modeDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  checkmark: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
  },
  disabledNote: {
    fontSize: 11,
    color: '#FFA500',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
