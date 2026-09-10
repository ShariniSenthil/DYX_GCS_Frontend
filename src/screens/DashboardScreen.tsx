import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useRover } from '../context/RoverContext';
import { RobotSettingsModal } from '../components/dashboard/RobotSettingsModal';
import { saveParamsToFile, loadParamsFromFile } from '../services/paramFileService';

// ── UTILS ────────────────────────────────────────────────────────
function getFixTypeLabel(fixType: number): string {
  const labels: { [key: number]: string } = {
    0: 'No GPS', 1: 'No Fix', 2: '2D Fix',
    3: '3D Fix', 4: 'DGPS', 5: 'RTK Float', 6: 'RTK Fixed',
  };
  return labels[fixType] || 'Unknown';
}

const getStatusColor = (level: 'healthy' | 'warning' | 'critical' | 'neutral') => {
  switch (level) {
    case 'healthy':  return colors.success;
    case 'warning':  return colors.warning;
    case 'critical': return colors.danger;
    default:         return colors.textMuted;
  }
};

// ── MEMOIZED SUB-COMPONENTS FOR PERFORMANCE ──────────────────────

const TopCard = React.memo(({ title, value, color, danger, flex = 1 }: any) => (
  <View style={[styles.topCard, { flex }, danger && styles.borderDanger]}>
    <Text style={styles.blockLabel}>{title}</Text>
    <Text style={[styles.topValue, { color: color || colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  </View>
));

const SubCardLayer = ({ children, style }: any) => (
  <View style={[styles.gridBlock, style]}>
    {children}
  </View>
);

const GroundSpeedCard = React.memo(({ speed }: { speed: number }) => (
  <View style={[styles.gridBlock, styles.flex2]}>
    <View style={styles.rowBetween}>
      <Text style={styles.blockLabel}>GROUND SPEED</Text>
      <View style={styles.chip}>
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <Text style={styles.chipText}>M/S</Text>
      </View>
    </View>
    <View style={styles.centerOuter}>
      <Text style={styles.hugeValue} numberOfLines={1} adjustsFontSizeToFit>{speed.toFixed(1)}</Text>
    </View>
    <View style={styles.placeholderBox}>
      <Text style={styles.placeholderText}>SPEED HISTORY · 60S</Text>
    </View>
  </View>
));

const HeadingCard = React.memo(({ heading }: { heading: number }) => (
  <View style={[styles.gridBlock, styles.flex2]}>
    <View style={styles.rowBetween}>
      <Text style={styles.blockLabel}>HEADING</Text>
      <View style={styles.chip}>
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <Text style={styles.chipText}>DEG</Text>
      </View>
    </View>
    <View style={styles.centerOuter}>
      <Text style={styles.hugeValue} numberOfLines={1} adjustsFontSizeToFit>{Math.round(heading)}°</Text>
    </View>
    <View style={styles.placeholderBox}>
      <Text style={styles.placeholderText}>COMPASS ROSE · N/E/S/W</Text>
    </View>
  </View>
));

const HeroStateCard = React.memo(({ armStatus, mode, connectionState, sysStatus, flex = 3 }: any) => {
  const isArmed = armStatus === 'ARMED';
  const mainColor = isArmed ? colors.danger : colors.textPrimary;
  const isConnected = connectionState === 'connected';

  return (
    <View style={[styles.gridBlock, styles.heroContainer, { flex }]}>
      <Text style={styles.heroSystemTitle}>System State</Text>
      <Text
        style={[styles.heroHugeText, { color: mainColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {isConnected ? sysStatus || armStatus : 'DISCONNECTED'}
      </Text>

      <View style={styles.heroPillRow}>
        <View style={styles.heroPill}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={styles.heroPillText}>MODE: {mode}</Text>
        </View>
        <View style={[styles.heroPill, { borderColor: colors.warning }]}>
          <View style={[styles.dot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.heroPillText, { color: colors.warning }]}>
            {isConnected ? (isArmed ? 'ACTIVE' : 'NEUTRAL') : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <Text style={styles.heroBottomText}>
        {isConnected ? 'ready · awaiting command' : 'check connection...'}
      </Text>
    </View>
  );
});

const MiniMissionProgress = React.memo(({ status, wp, totalWp, pct, flex = 1 }: any) => (
  <View style={[styles.rowGap, { flex }]}>
        <View style={[styles.gridBlock, styles.missionStatBox, { flex: 1 }]}>
          <Text style={styles.blockLabel}>WAYPOINT</Text>
          <View style={styles.centerOuter}>
            <Text style={styles.medValue} numberOfLines={1} adjustsFontSizeToFit>
              {wp} <Text style={styles.medValueSub}>/ {totalWp || 1}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.hGapSpace} />
        <View style={[styles.gridBlock, styles.missionStatBox, { flex: 1 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.blockLabel}>MISSION PROGRESS</Text>
            <View style={styles.chip}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={styles.chipText}>{status || 'IDLE'}</Text>
            </View>
          </View>
          <View style={styles.centerOuter}>
            <Text style={styles.medValue} numberOfLines={1} adjustsFontSizeToFit>{Math.round(pct)}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
          </View>
        </View>
  </View>
));

const DetailedBatteryCard = React.memo(({ pct, voltage, current }: any) => {
  const isDanger = pct <= 20;
  return (
    <View style={[styles.gridBlock, styles.flex2, isDanger && styles.borderDanger]}>
      <View style={styles.rowBetween}>
        <Text style={styles.blockLabel}>BATTERY</Text>
        <View style={[styles.chip, { borderColor: isDanger ? colors.danger : colors.success }]}>
          <View style={[styles.dot, { backgroundColor: isDanger ? colors.danger : colors.success }]} />
          <Text style={[styles.chipText, { color: isDanger ? colors.danger : colors.success }]}>
            {isDanger ? 'LOW' : 'OK'}
          </Text>
        </View>
      </View>
      <View style={styles.centerOuterLevel2}>
        <View style={styles.batteryMainRow}>
          <Text style={styles.bigValue} numberOfLines={1} adjustsFontSizeToFit>{Math.round(pct)}</Text>
          <Text style={styles.bigValueSub}>%</Text>
        </View>
      </View>

      {/* Custom Bar representing limits */}
      <View style={styles.batteryBarContainer}>
        <View style={styles.batteryBarTrack}>
          <View style={[styles.batteryBarFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: isDanger ? colors.danger : colors.success }]} />
        </View>
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.microText}>{voltage.toFixed(1)} V</Text>
        <Text style={styles.microText}>{current.toFixed(1)} A</Text>
      </View>
    </View>
  );
});

const DetailedRTKCard = React.memo(({ fixLevel, fixLabel, sats, baseLink, rtkBase }: any) => {
  const isDanger = fixLevel < 2;
  return (
    <View style={[styles.gridBlock, styles.flex2, isDanger && styles.borderDanger]}>
      <View style={styles.rowBetween}>
        <Text style={styles.blockLabel}>RTK / GPS</Text>
        <View style={[styles.chip, { borderColor: baseLink ? colors.success : colors.danger }]}>
          <View style={[styles.dot, { backgroundColor: baseLink ? colors.success : colors.danger }]} />
          <Text style={[styles.chipText, { color: baseLink ? colors.success : colors.danger }]}>
            {baseLink ? 'BASE LINKED' : 'BASE LOST'}
          </Text>
        </View>
      </View>
      <View style={styles.centerOuter}>
        <Text style={[styles.hugeValue2, { color: isDanger ? colors.danger : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
          {fixLabel}
        </Text>
      </View>
      <Text style={styles.microTextCentered}>{sats} sats</Text>
      
      <View style={styles.flexSpacer} />
      <Text style={[styles.microText, { textAlign: 'right' }]}>RTK: {(rtkBase || '--')}</Text>
    </View>
  );
});

const BottomActionBtn = React.memo(({ title, children, status, statusColor, disabled, onPress, flex = 1 }: any) => (
  <TouchableOpacity 
    style={[styles.gridBlock, { flex }, disabled && styles.opacityLow]} 
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.7}
  >
    <View style={styles.rowBetweenBase}>
      <Text style={styles.blockLabel}>{title}</Text>
      {status && (
        <View style={[styles.chip, { borderColor: statusColor || colors.accent }]}>
          <Text style={[styles.chipText, { color: statusColor || colors.accent }]}>{status}</Text>
        </View>
      )}
    </View>
    <View style={styles.actionContent}>
      {children}
    </View>
  </TouchableOpacity>
));

const BottomParamFileCard = React.memo(({ onSave, onLoad, saving, loading, disabled, flex = 1 }: any) => (
  <View style={[styles.gridBlock, { flex }]}>
    <View style={styles.rowBetweenBase}>
      <Text style={styles.blockLabel}>EVENTS / FILES</Text>
      <Text style={styles.microTextBase}>.PARAM</Text>
    </View>
    <View style={styles.fileButtonsRow}>
      <TouchableOpacity 
        style={[styles.smallBtn, disabled && styles.opacityLow, { borderColor: colors.success }]} 
        onPress={onSave} disabled={disabled || saving}
      >
        {saving ? <ActivityIndicator size={12} color={colors.success} /> : <Text style={[styles.smallBtnText, { color: colors.success }]}>SAVE PARAMS</Text>}
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.smallBtn, disabled && styles.opacityLow, { borderColor: colors.accentLight }]} 
        onPress={onLoad} disabled={disabled || loading}
      >
        {loading ? <ActivityIndicator size={12} color={colors.accentLight} /> : <Text style={[styles.smallBtnText, { color: colors.accentLight }]}>LOAD PARAMS</Text>}
      </TouchableOpacity>
    </View>
  </View>
));


// ── MAIN SCREEN COMPONENT ────────────────────────────────────────

export default function DashboardScreen() {
  const { telemetry, connectionState, roverPosition, services } = useRover();
  const mountedRef = useRef(true);
  const [showRobotSettings, setShowRobotSettings] = useState(false);
  const [paramSaving, setParamSaving] = useState(false);
  const [paramLoading, setParamLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleSaveParams = async () => {
    if (paramSaving) return;
    setParamSaving(true);
    try { await saveParamsToFile(services); } 
    finally { if (mountedRef.current) setParamSaving(false); }
  };

  const handleLoadParams = async () => {
    if (paramLoading) return;
    setParamLoading(true);
    try { await loadParamsFromFile(services); } 
    finally { if (mountedRef.current) setParamLoading(false); }
  };

  const vehicleStatus = useMemo(() => {
    const isArmed = Boolean(telemetry.state?.armed);
    return {
      isConnected: connectionState === 'connected',
      armStatus: isArmed ? 'ARMED' : 'DISARMED',
      sysStatus: telemetry.state?.system_status || (isArmed ? 'ARMED' : 'DISARMED'),
      fixTypeLabel: getFixTypeLabel(telemetry.rtk?.fix_type ?? 0),
      mode: telemetry.state?.mode || 'UNKNOWN',
    };
  }, [telemetry.state?.armed, telemetry.state?.mode, telemetry.state?.system_status, telemetry.rtk?.fix_type, connectionState]);

  const isConnected = connectionState === 'connected';

  // Derived styles and data
  const connColor = isConnected ? colors.success : colors.danger;
  const armColor  = vehicleStatus.armStatus === 'ARMED' ? colors.danger : colors.textPrimary;
  const fixColor  = telemetry.rtk.fix_type < 2 ? colors.danger : colors.textPrimary;

  return (
    <View style={styles.container}>
      
      {/* ── 1. HORIZONTAL TOP BAR ── */}
      <View style={styles.topRow}>
        <TopCard title="ARM" value={vehicleStatus.armStatus} />
        <TopCard title="MODE" value={vehicleStatus.mode} />
        <TopCard title="GPS / RTK" value={vehicleStatus.fixTypeLabel} color={fixColor} danger={telemetry.rtk.fix_type < 2} flex={1.2} />
        <TopCard title="NETWORK" value={(telemetry.network?.connection_type || "none").toUpperCase()} flex={0.8} />
        <TopCard title="BATTERY" value={`${Math.round(telemetry.battery?.percentage ?? 0)}%`} flex={0.7} />
        <TopCard title="SIGNAL" value={telemetry.network.wifi_connected ? `${telemetry.network.wifi_rssi}` : '—'} flex={0.6} />
      </View>

      {/* ── 2. MAIN 3-COLUMN LAYOUT SEAMS ── */}
      <View style={styles.mainGrid}>
        
        {/* Left Column (25%) */}
        <View style={styles.flex1}>
          <GroundSpeedCard speed={telemetry.global?.vel ?? 0} />
          <View style={styles.vGapSpace} />
          <HeadingCard heading={telemetry.attitude?.yaw_deg || 0} />
          <View style={styles.vGapSpace} />
          <BottomActionBtn 
            flex={1.2}
            title="QUICK TUNE" 
            status="PX4 OFF" statusColor={colors.textMuted}
            // NRP_ROS LEGACY DISABLED — QuickTune /api/quicktune/* has no 4WD_SERVER contract.
            onPress={undefined} disabled
          >
            <View style={styles.actionChipRow}>
              <View style={styles.chip}><View style={[styles.dot, {backgroundColor: colors.textPrimary}]} /><Text style={styles.chipText}>STEERING PID</Text></View>
              <View style={styles.chip}><View style={[styles.dot, {backgroundColor: colors.textPrimary}]} /><Text style={styles.chipText}>SPEED GAINS</Text></View>
            </View>
          </BottomActionBtn>
        </View>
        
        <View style={styles.hGapSpace} />

        {/* Center Column (50%) */}
        <View style={styles.flex2}>
          <HeroStateCard 
            armStatus={vehicleStatus.armStatus} 
            mode={vehicleStatus.mode} 
            connectionState={connectionState}
            sysStatus={vehicleStatus.sysStatus}
            flex={3}
          />
          <View style={styles.vGapSpace} />
          <MiniMissionProgress 
            status={telemetry.mission.status?.toUpperCase()}
            wp={telemetry.mission.current_wp} 
            totalWp={telemetry.mission.total_wp} 
            pct={telemetry.mission.progress_pct} 
            flex={1}
          />
          <View style={styles.vGapSpace} />
          <View style={[styles.rowGap, { flex: 1.2 }]}>
            <BottomActionBtn title="POSITION" flex={1} disabled={!isConnected}>
              <Text style={styles.posTextValue}>{roverPosition ? roverPosition.lat.toFixed(6) : 'awaiting position...'}</Text>
              <Text style={styles.posTextValue}>{roverPosition ? roverPosition.lng.toFixed(6) : ''}</Text>
            </BottomActionBtn>
            <View style={styles.hGapSpace} />
            <BottomActionBtn 
              title="ROBOT SETTINGS" flex={1}
              onPress={() => setShowRobotSettings(true)} disabled={!isConnected}
            >
               <View style={styles.actionChipRow}>
                <View style={styles.chip}><Text style={styles.chipText}>22 PARAMS</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>4 CAT.</Text></View>
              </View>
            </BottomActionBtn>
          </View>
        </View>

        <View style={styles.hGapSpace} />

        {/* Right Column (25%) */}
        <View style={styles.flex1}>
          <DetailedBatteryCard 
            pct={telemetry.battery.percentage} 
            voltage={telemetry.battery.voltage} 
            current={telemetry.battery.current} 
          />
          <View style={styles.vGapSpace} />
          <DetailedRTKCard 
            fixLevel={telemetry.rtk.fix_type} 
            fixLabel={vehicleStatus.fixTypeLabel}
            sats={telemetry.global.satellites_visible}
            baseLink={telemetry.rtk.base_linked}
            rtkBase={null}
          />
          <View style={styles.vGapSpace} />
          <BottomParamFileCard 
            flex={1.2}
            onSave={handleSaveParams} 
            onLoad={handleLoadParams} 
            saving={paramSaving} 
            loading={paramLoading} 
            disabled={!isConnected} 
          />
        </View>

      </View>

      {/* Modals */}
      <RobotSettingsModal visible={showRobotSettings} onClose={() => setShowRobotSettings(false)} />
    </View>
  );
}

// ── RIGID TACTICAL STYLES ────────────────────────────────────────
const BORDER_COLOR = colors.border;
const TEXT_MUTED = colors.textMuted;
const TEXT_BASE = colors.textPrimary;
const BG_PLATE = colors.panelBg; 
const BG_BASE = colors.primary;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_BASE,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  flexHalf: { flex: 1 }, 
  
  vGapSpace: { height: 8 },
  hGapSpace: { width: 8 },
  hGapSpaceAction: { width: 6 },
  flexSpacer: { flex: 1 },

  centerOuter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerOuterLevel2: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 },

  // Gaps within grids
  rowGap: { flexDirection: 'row', gap: 8 },

  // Primary Block Styling
  gridBlock: {
    backgroundColor: BG_PLATE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  
  borderDanger: {
    borderColor: colors.danger,
    borderWidth: 1,
  },
  
  blockLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_MUTED,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Utils
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowBetweenBase: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: TEXT_MUTED,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  
  opacityLow: { opacity: 0.5 },

  // -- ROW 1: TOP BAR --
  topRow: {
    flexDirection: 'row',
    gap: 6,
    height: 50,
  },
  topCard: {
    backgroundColor: BG_PLATE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  topValue: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },

  // -- ROW 2: MAIN MIDDLE GRID --
  mainGrid: {
    flex: 1,
    flexDirection: 'row',
  },
  
  // Big values
  hugeValue: {
    fontSize: 42,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: TEXT_BASE,
    letterSpacing: -1,
  },
  hugeValue2: {
    fontSize: 34,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: TEXT_BASE,
    letterSpacing: -1,
    marginTop: 8,
  },
  bigValue: {
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '800',
    color: TEXT_BASE,
    letterSpacing: -1,
  },
  bigValueSub: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 4,
    marginLeft: 2,
  },
  medValue: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: TEXT_BASE,
    marginTop: 6,
  },
  medValueSub: { fontSize: 13, color: TEXT_MUTED },
  microTextBase: { fontFamily: 'monospace', fontSize: 10, color: TEXT_MUTED },
  microText: { fontFamily: 'monospace', fontSize: 10, color: TEXT_MUTED, marginTop: 4 },
  microTextCentered: { fontFamily: 'monospace', fontSize: 10, color: TEXT_MUTED, marginTop: 4, textAlign: 'center' },

  placeholderBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 4,
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: 'rgba(148, 163, 184, 0.4)',
    letterSpacing: 1,
  },

  // Center Hero
  heroContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSystemTitle: {
    fontFamily: 'monospace',
    fontSize: 22,
    color: TEXT_BASE,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  heroHugeText: {
    fontFamily: 'monospace',
    fontSize: 64, // Massive size
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: -8,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  heroPillRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroPillText: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', color: TEXT_BASE, textTransform: 'uppercase' },
  heroBottomText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: TEXT_MUTED,
    marginTop: 16,
  },

  missionStatBox: { flex: 1, paddingVertical: 8, justifyContent: 'center' },
  progressBg: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: '100%', backgroundColor: TEXT_BASE, borderRadius: 2 },

  // Battery custom bar
  batteryMainRow: { flexDirection: 'row', alignItems: 'flex-end' },
  batteryBarContainer: { marginVertical: 8 },
  batteryBarTrack: { height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden' },
  batteryBarFill: { height: '100%', borderRadius: 3 },


  // -- ROW 3: BOTTOM ACTIONS --
  bottomRow: {
    flexDirection: 'row',
    height: 70,
  },
  actionContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  actionChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  posTextValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: TEXT_MUTED,
    fontStyle: 'italic',
  },

  fileButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    alignItems: 'flex-end',
  },
  smallBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  smallBtnText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
  }
});
