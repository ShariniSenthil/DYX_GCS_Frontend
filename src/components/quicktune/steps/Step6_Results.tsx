/**
 * Step6_Results — NRP_ROS LEGACY DISABLED.
 *
 * QuickTune save/results routes are not available on 4WD_SERVER.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

export { computeTuneResults } from '../../../utils/quicktuneResults';
export type { ParamChange } from '../../../utils/quicktuneResults';

interface Step6_ResultsProps {
  beforeParams: Record<string, number>;
  onClose: () => void;
}

export default function Step6_Results(_props: Step6_ResultsProps) {
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
