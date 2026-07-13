import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS } from '../../constants/pathPlanGlass';

interface Props {
  isMissionActive?: boolean;
  distanceToNextM?: number;
  dragGesture?: any;
  isDraggingActive?: boolean;
}

function formatDistance(distanceM: number | null | undefined, isActive: boolean): string {
  const value = !isActive || distanceM == null || distanceM < 0 ? 0 : distanceM;
  if (value >= 1) {
    return `${value.toFixed(2)} m`;
  }
  return `${(value * 100).toFixed(1)} cm`;
}

export const DistanceToTargetCard: React.FC<Props> = ({
  isMissionActive = false,
  distanceToNextM,
  dragGesture,
  isDraggingActive,
}) => {
  const distanceText = useMemo(
    () => formatDistance(distanceToNextM, isMissionActive),
    [distanceToNextM, isMissionActive],
  );

  const isLive = isMissionActive && distanceToNextM != null && distanceToNextM >= 0;

  return (
    <GestureDetector gesture={dragGesture}>
      <View style={[styles.container, isDraggingActive && styles.containerDragging]}>
        <View style={styles.accentLine} />
        <View style={styles.body}>
          <View style={styles.valueColumn}>
            <Text style={styles.label}>DISTANCE TO TARGET</Text>
            <View style={styles.labelDivider} />
            <Text style={[styles.value, isLive && styles.valueLive]}>{distanceText}</Text>
          </View>
          <View style={[styles.targetIconWrap, isLive && styles.targetIconWrapLive]}>
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={22}
              color={isLive ? PATH_PLAN_GLASS.cyan : PATH_PLAN_GLASS.muted}
            />
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: 'hidden',
  },
  containerDragging: {
    borderColor: PATH_PLAN_GLASS.dragBorder,
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },
  accentLine: {
    height: 2,
    backgroundColor: PATH_PLAN_GLASS.cyan,
    opacity: 0.55,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    gap: 12,
  },
  valueColumn: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  labelDivider: {
    height: 1,
    backgroundColor: PATH_PLAN_GLASS.borderSubtle,
    marginRight: 8,
  },
  value: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  valueLive: {
    color: PATH_PLAN_GLASS.cyan,
  },
  targetIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: 'rgba(103, 232, 249, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetIconWrapLive: {
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.badgeBg,
  },
});
