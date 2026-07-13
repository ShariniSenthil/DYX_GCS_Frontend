import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { useRoverStatusIndicators } from '../../hooks/useRoverStatusIndicators';
import type { RoverStatusIndicators } from '../../hooks/useRoverStatusIndicators';
import type { RtkUiState } from '../../adapters/px4RtkUiStateAdapter';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  dragGesture?: any;
  isDraggingActive?: boolean;
  onClose?: () => void;
}

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN = '#00FF00';
const AMBER = '#FFAA00';
const RED = '#FF0000';
const GREY = '#666666';
const CYAN = '#22D3EE';

interface IconVisual {
  icon: string;
  color: string;
  opacity: number;
}

/**
 * Map the normalized rover status indicators to the five status icons
 * (network · RTK · GCS-link · FCU-link · battery). Pure presentation only —
 * no API calls, no raw backend object inspection.
 */
function deriveVisuals(ind: RoverStatusIndicators): IconVisual[] {
  // 1) Network — Wi-Fi bars, ethernet, or offline.
  let network: IconVisual;
  if (ind.networkType === 'ethernet') {
    network = { icon: 'hardware-chip', color: GREEN, opacity: 1 };
  } else if (ind.networkType === 'wifi' && ind.wifiConnected) {
    const bars = ind.wifiSignalBars;
    network = {
      icon: 'wifi',
      color: GREEN,
      opacity: bars >= 4 ? 1 : bars >= 3 ? 0.8 : bars >= 2 ? 0.6 : 0.4,
    };
  } else {
    network = { icon: 'wifi-outline', color: RED, opacity: 0.7 };
  }

  // 2) RTK — discrete UI state.
  const rtkVisuals: Record<RtkUiState, IconVisual> = {
    off: { icon: 'radio-outline', color: GREY, opacity: 0.7 },
    starting: { icon: 'radio-outline', color: AMBER, opacity: 0.9 },
    streaming: { icon: 'radio-outline', color: CYAN, opacity: 1 },
    rtk_float: { icon: 'radio-outline', color: AMBER, opacity: 1 },
    rtk_fixed: { icon: 'radio-outline', color: GREEN, opacity: 1 },
    error: { icon: 'alert-circle-outline', color: RED, opacity: 1 },
  };
  const rtk = rtkVisuals[ind.rtkState];

  // 3) GCS-link = frontend ↔ backend (Socket.IO lifecycle).
  const gcs: IconVisual = ind.gcsConnected
    ? { icon: 'cloud', color: GREEN, opacity: 1 }
    : { icon: 'cloud-offline-outline', color: RED, opacity: 0.7 };

  // 4) FCU-link = backend ↔ PX4/MAVROS (telemetry.connected).
  const fcu: IconVisual = ind.fcuConnected
    ? { icon: 'airplane', color: GREEN, opacity: 1 }
    : { icon: 'airplane', color: RED, opacity: 0.7 };

  // 5) Battery — null-safe (missing telemetry shows neutral, never a false 0%).
  let battery: IconVisual;
  if (ind.batteryPct === null) {
    battery = { icon: 'battery-dead', color: GREY, opacity: 0.7 };
  } else if (ind.batteryPct > 50) {
    battery = { icon: 'battery-charging', color: GREEN, opacity: 1 };
  } else if (ind.batteryPct > 20) {
    battery = { icon: 'battery-half', color: AMBER, opacity: 1 };
  } else {
    battery = { icon: 'battery-dead', color: RED, opacity: 1 };
  }

  return [network, rtk, gcs, fcu, battery];
}

export const SystemStatusPanel: React.FC<Props> = ({
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const indicators = useRoverStatusIndicators();

  const icons = useMemo(() => deriveVisuals(indicators), [indicators]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={dragGesture}>
        <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="pulse" size={14} color={PATH_PLAN_GLASS.cyan} />
            </View>
            <Text style={styles.headerTitle}>SYSTEM STATUS</Text>
          </View>
          <View style={styles.headerRight}>
            {onClose && (
              <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </GestureDetector>

      <View style={styles.statusPad}>
        <View style={styles.iconRow}>
          {icons.map((v, idx) => (
            <View
              key={idx}
              style={[styles.iconWrapper, { opacity: v.opacity, borderColor: `${v.color}40` }]}
            >
              <Ionicons name={v.icon as any} size={18} color={v.color} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
  statusPad: {
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
  },
});
