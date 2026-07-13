/**
 * Step1_ParamCheck — NRP_ROS LEGACY DISABLED.
 *
 * ArduRover QuickTune parameter preparation has no 4WD_SERVER contract.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';

interface Step1ParamCheckProps {
  onNext?: () => void;
  onBack?: () => void;
}

export const Step1ParamCheck: React.FC<Step1ParamCheckProps> = () => (
  <View style={styles.container}>
    <Text style={styles.text}>NRP_ROS QuickTune disabled on 4WD_SERVER.</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  text: { color: colors.textSecondary, fontSize: 14 },
});

export default Step1ParamCheck;
