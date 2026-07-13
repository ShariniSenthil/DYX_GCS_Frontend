/**
 * Step5_Monitor — NRP_ROS LEGACY DISABLED.
 *
 * QuickTune log monitoring is tied to the removed ArduRover tuning flow.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

interface Step5MonitorProps {
  onComplete: () => void;
  onAbort: () => void;
}

export default function Step5_Monitor(_props: Step5MonitorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>NRP_ROS QuickTune disabled on 4WD_SERVER.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  text: { color: colors.textSecondary, fontSize: 14 },
});
