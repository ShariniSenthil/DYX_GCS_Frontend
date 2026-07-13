/**
 * Step3_ArmCircle — NRP_ROS LEGACY DISABLED.
 *
 * 4WD_SERVER does not support ArduRover CIRCLE mode QuickTune.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

interface Step3_ArmCircleProps {
  onNext: () => void;
  onBack: () => void;
  onAbort: () => void;
}

export const Step3_ArmCircle: React.FC<Step3_ArmCircleProps> = () => (
  <View style={styles.container}>
    <Text style={styles.text}>NRP_ROS QuickTune disabled on 4WD_SERVER.</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  text: { color: colors.textSecondary, fontSize: 14 },
});
