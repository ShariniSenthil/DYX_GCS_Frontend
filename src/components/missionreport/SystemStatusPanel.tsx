import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { OptionalGestureDetector } from '../shared/OptionalGestureDetector';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { useRoverStatusIndicators } from '../../hooks/useRoverStatusIndicators';
import { useTelemetry } from '../../context/TelemetryContext';
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
  label: string;
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
    network = { icon: 'hardware-chip', color: GREEN, opacity: 1, label: 'ETH' };
  } else if (ind.networkType === 'wifi' && ind.wifiConnected) {
    const bars = ind.wifiSignalBars;
    network = {
      icon: 'wifi',
      color: GREEN,
      opacity: bars >= 4 ? 1 : bars >= 3 ? 0.8 : bars >= 2 ? 0.6 : 0.4,
      label: 'WiFi',
    };
  } else {
    network = { icon: 'wifi-outline', color: RED, opacity: 0.7, label: 'WiFi' };
  }

  // 2) RTK — discrete UI state.
  const rtkVisuals: Record<RtkUiState, IconVisual> = {
    off: { icon: 'radio-outline', color: GREY, opacity: 0.7, label: 'RTK' },
    starting: { icon: 'radio-outline', color: AMBER, opacity: 0.9, label: 'RTK' },
    streaming: { icon: 'radio-outline', color: CYAN, opacity: 1, label: 'RTK' },
    rtk_float: { icon: 'radio-outline', color: AMBER, opacity: 1, label: 'RTK' },
    rtk_fixed: { icon: 'radio-outline', color: GREEN, opacity: 1, label: 'RTK' },
    error: { icon: 'alert-circle-outline', color: RED, opacity: 1, label: 'RTK' },
  };
  const rtk = rtkVisuals[ind.rtkState];

  // 3) GCS-link = frontend ↔ backend (Socket.IO websocket).
  const gcs: IconVisual = ind.gcsConnected
    ? { icon: 'cloud', color: GREEN, opacity: 1, label: 'WS' }
    : { icon: 'cloud-offline-outline', color: RED, opacity: 0.7, label: 'WS' };

  // 4) FCU-link = backend ↔ PX4/MAVROS (telemetry.connected).
  const fcu: IconVisual = ind.fcuConnected
    ? { icon: 'airplane', color: GREEN, opacity: 1, label: 'FCU' }
    : { icon: 'airplane', color: RED, opacity: 0.7, label: 'FCU' };

  // 5) Battery — null-safe (missing telemetry shows neutral, never a false 0%).
  let battery: IconVisual;
  if (ind.batteryPct === null) {
    battery = { icon: 'battery-dead', color: GREY, opacity: 0.7, label: 'BAT' };
  } else if (ind.batteryPct > 50) {
    battery = { icon: 'battery-charging', color: GREEN, opacity: 1, label: 'BAT' };
  } else if (ind.batteryPct > 20) {
    battery = { icon: 'battery-half', color: AMBER, opacity: 1, label: 'BAT' };
  } else {
    battery = { icon: 'battery-dead', color: RED, opacity: 1, label: 'BAT' };
  }

  return [network, rtk, gcs, fcu, battery];
}

export const SystemStatusPanel: React.FC<Props> = ({
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const indicators = useRoverStatusIndicators();
  const { telemetry, missionLifecycle } = useTelemetry();

  const icons = useMemo(() => deriveVisuals(indicators), [indicators]);

  const extraRows = useMemo(() => {
    const mission = telemetry.mission;
    const rppOn = telemetry.rpp_debug_available === true;
    const spray = mission.spray_controller_state ?? "—";
    const sprayFault = mission.spray_fault_reason;
    const align = mission.alignment_active === true;
    const start =
      missionLifecycle.start_stage ?? mission.start_stage ?? "IDLE";
    const resume =
      missionLifecycle.resume_stage ?? mission.resume_stage ?? "IDLE";
    const stale = telemetry.stale === true;
    const age =
      typeof telemetry.ageMs === "number"
        ? `${Math.round(telemetry.ageMs / 100) / 10}s`
        : "—";
    return [
      { label: "RPP", value: rppOn ? "debug on" : "—" },
      { label: "Spray", value: sprayFault ? String(sprayFault) : String(spray) },
      { label: "Align", value: align ? "active" : "idle" },
      { label: "Start", value: String(start) },
      { label: "Resume", value: String(resume) },
      { label: "Link", value: stale ? `stale ${age}` : `ok ${age}` },
    ];
  }, [telemetry, missionLifecycle]);

  return (
    <View style={styles.container}>
      <OptionalGestureDetector gesture={dragGesture}>
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
      </OptionalGestureDetector>

      <View style={styles.statusPad}>
        <View style={styles.iconRow}>
          {icons.map((v, idx) => (
            <View key={idx} style={styles.iconCell}>
              <View
                style={[styles.iconWrapper, { opacity: v.opacity, borderColor: `${v.color}40` }]}
              >
                <Ionicons name={v.icon as any} size={18} color={v.color} />
              </View>
              <Text style={[styles.iconLabel, { color: v.color }]}>{v.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.extraGrid}>
          {extraRows.map((row) => (
            <View key={row.label} style={styles.extraRow}>
              <Text style={styles.extraLabel}>{row.label}</Text>
              <Text style={styles.extraValue} numberOfLines={1}>
                {row.value}
              </Text>
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
  iconCell: {
    alignItems: 'center',
    gap: 4,
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
  extraGrid: {
    marginTop: 8,
    gap: 4,
  },
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  extraLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  extraValue: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: '70%',
    textAlign: 'right',
  },
  iconLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
