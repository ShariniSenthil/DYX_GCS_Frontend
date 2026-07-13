/**
 * Step4_TuneControl — NRP_ROS LEGACY DISABLED.
 *
 * AUX-function tuning start/status routes are not available on 4WD_SERVER.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

interface Step4_TuneControlProps {
  onComplete: (snapshot: Record<string, number>) => void;
  onBack: () => void;
  onAbort: () => void;
}

export default function Step4_TuneControl(_props: Step4_TuneControlProps) {
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
