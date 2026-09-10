import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';

interface Props {
  progressCurrent: number;
  progressTotal: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose?: () => void;
  toolbarActions?: React.ReactNode;
  dragGesture?: any;          // injected by DraggableCard (custom handle mode)
  isDraggingActive?: boolean;
}

export const MissionTableHeader: React.FC<Props> = ({
  progressCurrent,
  progressTotal,
  isExpanded,
  onToggleExpand,
  onClose,
  toolbarActions,
  dragGesture,
  isDraggingActive,
}) => {
  const header = (
    <View style={[styles.wrapper, isDraggingActive && styles.wrapperDragging]}>
      <TouchableOpacity style={styles.header} activeOpacity={0.8} onPress={onToggleExpand}>
        <View style={styles.left}>
          <MaterialCommunityIcons name="vector-polyline" size={16} color={PATH_PLAN_GLASS.cyan} />
          <Text style={styles.title}>
            MISSION MARKING POINTS ({progressCurrent}/{progressTotal})
          </Text>
        </View>
        <View style={styles.right}>
          {toolbarActions}
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-down' : 'chevron-up'}
            size={20}
            color={PATH_PLAN_GLASS.muted}
          />
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={14} color={PATH_PLAN_GLASS.muted} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );

  if (!dragGesture) {
    return header;
  }

  return <GestureDetector gesture={dragGesture}>{header}</GestureDetector>;
};

const styles = StyleSheet.create({
  wrapper: {
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    overflow: 'hidden',
  },
  wrapperDragging: {
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
    height: 60,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    ...PATH_PLAN_HEADER.closeBtn,
    marginLeft: 8,
  },
});
