/**
 * Step2_ScriptCheck — NRP_ROS LEGACY DISABLED.
 *
 * Lua QuickTune script upload/check routes are not available on 4WD_SERVER.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function Step2_ScriptCheck(_props: Props) {
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
