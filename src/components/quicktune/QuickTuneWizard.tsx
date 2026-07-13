/**
 * QuickTuneWizard — NRP_ROS LEGACY DISABLED.
 *
 * The original wizard used ArduRover Lua QuickTune, CIRCLE mode, AUX function
 * tuning, and /api/quicktune/* routes. 4WD_SERVER has no matching contract.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';

export interface QuickTuneWizardProps {
  onClose: () => void;
}

export default function QuickTuneWizard({ onClose }: QuickTuneWizardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>QuickTune Disabled</Text>
      <Text style={styles.message}>
        NRP_ROS QuickTune is not available on 4WD_SERVER.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onClose}>
        <Text style={styles.buttonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 24,
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
    textAlign: 'center',
  },
  button: {
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
