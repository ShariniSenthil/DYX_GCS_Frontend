/**
 * QuickTuneScreen — Modal wrapper for the QuickTune Wizard
 *
 * NRP_ROS LEGACY DISABLED.
 * QuickTune depends on ArduRover Lua tuning, CIRCLE mode, and /api/quicktune/*.
 * 4WD_SERVER has no equivalent contract, so do not mount QuickTuneWizard.
 * Called from DashboardScreen.
 */

import React from 'react';
import { Modal, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

export default function QuickTuneScreen({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.panel}>
          <Text style={styles.title}>QuickTune Disabled</Text>
          <Text style={styles.message}>
            NRP_ROS QuickTune is not available on 4WD_SERVER.
          </Text>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelBg,
    borderRadius: 8,
    padding: 20,
    gap: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
