import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import MissionReportExport, { type MissionReportExportProps } from './MissionReportExport';

interface Props {
  onClear?: () => void;
  exportProps: MissionReportExportProps;
}

export const MissionTableToolbarActions: React.FC<Props> = ({ onClear, exportProps }) => (
  <View style={styles.row}>
    {onClear && (
      <TouchableOpacity
        style={[styles.btn, styles.btnDanger]}
        onPress={onClear}
        activeOpacity={0.7}
        accessibilityLabel="Clear mission logs"
      >
        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#F87171" />
        <Text style={[styles.btnText, styles.btnTextDanger]}>Clear</Text>
      </TouchableOpacity>
    )}
    <MissionReportExport {...exportProps} variant="glass" />
  </View>
);

const styles = StyleSheet.create({
  row: PATH_PLAN_HEADER.toolbarActions,
  btn: PATH_PLAN_HEADER.actionBtn,
  btnDanger: PATH_PLAN_HEADER.actionBtnDanger,
  btnText: PATH_PLAN_HEADER.actionBtnText,
  btnTextDanger: PATH_PLAN_HEADER.actionBtnTextDanger,
});
