import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { Waypoint } from './types';

interface Props {
  waypoints: Waypoint[];
  currentIndex: number | null;
  markedCount?: number;
  isMissionActive?: boolean;
  dragGesture?: any;
  isDraggingActive?: boolean;
  onClose?: () => void;
}

export const MissionProgressCard: React.FC<Props> = ({
  waypoints,
  currentIndex,
  markedCount: providedMarkedCount,
  isMissionActive = false,
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const totalWaypoints = waypoints.length;
  const markedCount = isMissionActive ? (providedMarkedCount ?? 0) : 0;
  const nextIndex = (currentIndex ?? -1) + 1;
  const currentWp =
    isMissionActive && currentIndex !== null && currentIndex >= 0 ? waypoints[currentIndex] : null;
  const nextWp = isMissionActive && nextIndex < totalWaypoints ? waypoints[nextIndex] : null;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={dragGesture}>
        <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="analytics" size={14} color={PATH_PLAN_GLASS.cyan} />
            </View>
            <Text style={styles.headerTitle}>MISSION PROGRESS</Text>
          </View>
          {onClose && (
            <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </GestureDetector>

      <View style={styles.counterRow}>
        <View style={[styles.counter, styles.markedCounter]}>
          <View style={[styles.counterAccent, { backgroundColor: PATH_PLAN_GLASS.cyan }]} />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>LAST</Text>
            <Text style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}>{markedCount}</Text>
          </View>
        </View>

        <View style={[styles.counter, styles.currentCounter]}>
          <View style={[styles.counterAccent, { backgroundColor: PATH_PLAN_GLASS.cyan }]} />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>CURRENT</Text>
            <Text style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}>
              {currentWp ? currentWp.sn : '0'}
            </Text>
          </View>
        </View>

        <View style={[styles.counter, styles.nextCounter]}>
          <View style={[styles.counterAccent, { backgroundColor: PATH_PLAN_GLASS.cyan }]} />
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>NEXT</Text>
            <Text style={[styles.counterValue, { color: PATH_PLAN_GLASS.cyan }]}>
              {nextWp ? nextWp.sn : '0'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 100,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
  },
  headerDragging: {
    borderBottomColor: PATH_PLAN_GLASS.dragBorder,
    backgroundColor: PATH_PLAN_GLASS.dragBg,
  },
  headerCloseBtn: PATH_PLAN_HEADER.closeBtn,
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  headerIconWrap: PATH_PLAN_HEADER.iconWrap,
  headerTitle: PATH_PLAN_HEADER.title,
  counterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  counter: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  markedCounter: {
    backgroundColor: 'rgba(192, 132, 252, 0.08)',
    borderColor: 'rgba(192, 132, 252, 0.3)',
  },
  currentCounter: {
    backgroundColor: 'rgba(103, 232, 249, 0.08)',
    borderColor: 'rgba(103, 232, 249, 0.3)',
  },
  nextCounter: {
    backgroundColor: 'rgba(110, 231, 183, 0.08)',
    borderColor: 'rgba(110, 231, 183, 0.3)',
  },
  counterAccent: {
    width: 3,
    alignSelf: 'stretch',
  },
  counterInner: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  counterLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: PATH_PLAN_GLASS.label,
  },
  counterValue: {
    fontSize: 12,
    fontWeight: '700',
  },
});
