import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { OptionalGestureDetector } from '../shared/OptionalGestureDetector';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { VehicleStatus } from './types';
import { RoverTelemetry } from '../../types/telemetry';

interface Props {
  status: VehicleStatus;
  telemetry?: RoverTelemetry;
  isConnected: boolean;
  /** Injected by DraggableCard (handleType="custom") */
  dragGesture?: any;
  isDraggingActive?: boolean;
  onClose?: () => void;
}

const VEHICLE_CARD_LAYOUT: { height?: number | string; minHeight?: number; width?: number | string; flex?: number } = {
  height: 345,
  minHeight: 120,
  width: '100%',
};

const getRtkColor = (telemetry: any): string => {
  if (!telemetry) return colors.danger;
  const fixType = telemetry.rtk?.fix_type ?? 0;
  if (fixType >= 5) return colors.success;
  if (fixType >= 3) return colors.warning;
  return colors.danger;
};

const getBatteryColor = (telemetry: any): string => {
  if (!telemetry) return colors.danger;
  const pct = telemetry.battery?.percentage ?? 0;
  if (pct > 50) return colors.success;
  if (pct > 20) return colors.warning;
  return colors.danger;
};

const getAccuracyColor = (value: number): string => {
  if (value < 0.1) return colors.success;
  if (value < 5) return colors.warning;
  if (value < 10) return colors.accent;
  return colors.danger;
};

const getSatelliteColor = (telemetry: any): string => {
  if (!telemetry) return colors.danger;
  const satCount = telemetry.global?.satellites_visible ?? 0;
  if (satCount >= 14) return colors.success;
  if (satCount >= 6) return colors.warning;
  if (satCount >= 2) return colors.accent;
  return colors.danger;
};

function useDebouncedColor(computeColor: () => string, dep: any, delay = 350): string {
  const [color, setColor] = useState(computeColor);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const next = computeColor();
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setColor(next);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setColor(next), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dep]);

  return color;
}

type StatusRowItem = {
  key: string;
  label: string;
  value: string | number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const VehicleStatusCard: React.FC<Props> = ({
  status,
  telemetry,
  isConnected,
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const connectionColor = isConnected ? colors.success : colors.danger;

  const rtkColor = useDebouncedColor(() => getRtkColor(telemetry), telemetry?.rtk?.fix_type);
  const batteryColor = useDebouncedColor(() => getBatteryColor(telemetry), telemetry?.battery?.percentage);
  const hrmsColor = useDebouncedColor(() => getAccuracyColor((telemetry as any)?.hrms ?? 0), (telemetry as any)?.hrms);
  const vrmsColor = useDebouncedColor(() => getAccuracyColor((telemetry as any)?.vrms ?? 0), (telemetry as any)?.vrms);
  const satColor = useDebouncedColor(() => getSatelliteColor(telemetry), telemetry?.global?.satellites_visible);

  const rows: StatusRowItem[] = [
    { key: 'battery', label: 'Battery', value: status.battery, color: batteryColor, icon: 'battery-charging' },
    { key: 'gps', label: 'GPS / RTK', value: status.gps, color: rtkColor, icon: 'cellular' },
    { key: 'satellites', label: 'Satellites', value: status.satellites, color: satColor, icon: 'radio' },
    { key: 'hrms', label: 'HRMS', value: status.hrms, color: hrmsColor, icon: 'analytics' },
    { key: 'vrms', label: 'VRMS', value: status.vrms, color: vrmsColor, icon: 'analytics-outline' },
    { key: 'imu', label: 'IMU', value: status.imu, color: colors.accent, icon: 'compass' },
    ...(status.mode ? [{ key: 'mode', label: 'Mode', value: status.mode, color: colors.accent, icon: 'settings-sharp' as keyof typeof Ionicons.glyphMap }] : []),
  ];

  return (
    <View style={styles.container}>
      <OptionalGestureDetector gesture={dragGesture}>
        <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="hardware-chip" size={14} color={PATH_PLAN_GLASS.cyan} />
            </View>
            <Text style={styles.headerTitle}>ROBOT STATUS</Text>
            <View style={[styles.connectionDot, { backgroundColor: connectionColor }]} />
          </View>
          <View style={styles.headerRight}>
            {onClose && (
              <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </OptionalGestureDetector>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {rows.map((row, idx) => (
          <View key={row.key} style={[styles.row, idx === rows.length - 1 && styles.rowLast]}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIconWrap, { borderColor: `${row.color}40` }]}>
                <Ionicons name={row.icon} size={13} color={row.color} />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
            </View>
            <View style={[styles.valueBadge, { backgroundColor: `${row.color}20`, borderColor: `${row.color}50` }]}>
              <View style={[styles.valueDot, { backgroundColor: row.color }]} />
              <Text style={[styles.valueText, { color: row.color }]} numberOfLines={1}>
                {String(row.value)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...(VEHICLE_CARD_LAYOUT as any),
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCloseBtn: PATH_PLAN_HEADER.closeBtn,
  headerIconWrap: PATH_PLAN_HEADER.iconWrap,
  headerTitle: PATH_PLAN_HEADER.title,
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  list: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 53,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  rowLast: {
    borderBottomWidth: 1,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  valueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
    maxWidth: '55%',
  },
  valueDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  valueText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
});
