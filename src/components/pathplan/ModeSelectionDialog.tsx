import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface ModeSelectionDialogProps {
  visible: boolean;
  currentMode: string;
  onSelectMode: (mode: string) => void;
  onCancel: () => void;
}

const AVAILABLE_MODES = [
  { id: 'DGPS Mark', label: 'DGPS Mark', description: 'Mark points mission', icon: 'star-three-points-outline', isMdi: true },
  { id: 'Dash', label: 'Dash', description: 'ON/OFF spray pattern with configurable distance', icon: '➖' },
  { id: 'Continuous', label: 'Continuous', description: 'Continuous marking mode', icon: '🔄' },
  { id: 'Survey', label: 'Survey', description: 'Area survey mission', icon: '🗺️' },
  { id: 'Manual Control', label: 'Manual Control', description: 'Direct rover control', icon: '🎮' },
];

export const ModeSelectionDialog: React.FC<ModeSelectionDialogProps> = ({
  visible,
  currentMode,
  onSelectMode,
  onCancel,
}) => {
  const [selectedMode, setSelectedMode] = useState(currentMode);

  const handleConfirm = () => {
    onSelectMode(selectedMode);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>🎯</Text>
            <Text style={styles.title}>Select Mission Mode</Text>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.description}>
              Choose the mission mode for your operation:
            </Text>

            {/* Mode Options */}
            <View style={styles.modesContainer}>
              {AVAILABLE_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  style={[
                    styles.modeOption,
                    selectedMode === mode.id && styles.modeOptionSelected,
                  ]}
                  onPress={() => setSelectedMode(mode.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.modeHeader}>
                    {(mode as any).isMdi ? (
                      <MaterialCommunityIcons
                        name={(mode as any).icon}
                        size={32}
                        color={selectedMode === mode.id ? colors.primary : colors.textSecondary}
                        style={styles.modeIconMdi}
                      />
                    ) : (
                      <Text style={styles.modeIcon}>{mode.icon}</Text>
                    )}
                    <View style={styles.modeInfo}>
                      <Text
                        style={[
                          styles.modeLabel,
                          selectedMode === mode.id && styles.modeLabelSelected,
                        ]}
                      >
                        {mode.label}
                      </Text>
                      <Text style={styles.modeDescription}>{mode.description}</Text>
                    </View>
                  </View>
                  {selectedMode === mode.id && (
                    <View style={styles.selectedIndicator}>
                      <Text style={styles.checkmark}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Current Mode Indicator */}
            {currentMode && (
              <View style={styles.currentModeBox}>
                <Text style={styles.currentModeLabel}>Current Active Mode:</Text>
                <Text style={styles.currentModeValue}>{currentMode}</Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={handleConfirm}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, styles.confirmButtonText]}>
                Set Mode
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.headerBlue,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  content: {
    padding: 20,
    maxHeight: 450,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  modesContainer: {
    gap: 12,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  modeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  modeIconMdi: {
    marginRight: 12,
  },
  modeInfo: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  modeLabelSelected: {
    color: colors.primary,
  },
  modeDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  selectedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: colors.text,
    fontWeight: 'bold',
  },
  currentModeBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  currentModeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  currentModeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButtonText: {
    color: colors.text,
  },
});
