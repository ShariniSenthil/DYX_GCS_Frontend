// ============================================================
// ComputeButton — DXF Localization Pipeline
// ============================================================
//
// Primary CTA button that triggers the similarity transform solver.
// Displays a count badge showing "N/3" control points assigned.
// Enabled iff controlPointCount >= 3 (Requirement 12.4 by construction).
//
// Requirements: 12.1, 12.2, 12.3, 17.1, 17.2
// ============================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export interface ComputeButtonProps {
  controlPointCount: number;
  enabled: boolean;
  onPress: () => void;
}

export function ComputeButton({
  controlPointCount,
  enabled,
  onPress,
}: ComputeButtonProps): React.ReactElement {
  return (
    <TouchableOpacity
      style={[styles.button, enabled ? styles.buttonActive : styles.buttonDisabled]}
      disabled={!enabled}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons
        name="locate"
        size={18}
        color="#ffffff"
      />
      <Text style={styles.label}>COMPUTE TRANSFORM</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{controlPointCount}/3</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  buttonActive: {
    backgroundColor: '#3b82f6',
  },
  buttonDisabled: {
    backgroundColor: colors.cardBg,
    opacity: 0.4,
  },
  label: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 2,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
