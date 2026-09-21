import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, G, Line, Polygon } from 'react-native-svg';
import { MISSION_PROGRESS_LAYOUT } from '../constants/missionProgressLayout';
import { useRover } from '../context/RoverContext';
import { RobotSettingsModal } from '../components/dashboard/RobotSettingsModal';
import { saveParamsToFile, loadParamsFromFile } from '../services/paramFileService';
import { CATEGORIES } from '../types/robotSettings';
import { asFiniteNumber, formatCoord } from '../utils/formatCoord';

const ROBOT_PARAM_COUNT = Object.values(CATEGORIES).reduce(
  (sum, cat) => sum + cat.params.length,
  0,
);
const ROBOT_CAT_COUNT = Object.keys(CATEGORIES).length;

const ACCENT = '#2563EB';
const HEADING_ACCENT = '#4F46E5';
const INK = '#FFFFFF';
const SURFACE = '#111827';
const SUBSURFACE = '#0B1220';
const BORDER = '#253247';
const TITLE = '#F8FAFC';
const MUTED = '#94A3B8';
const LABEL = '#64748B';

type Grade = 'healthy' | 'average' | 'critical' | 'idle' | 'info';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const GRADE: Record<Grade, string> = {
  healthy: '#16A34A',
  average: '#D97706',
  critical: '#DC2626',
  idle: '#64748B',
  info: ACCENT,
};

const GRADE_TEXT: Record<Grade, string> = {
  healthy: 'CONNECTED',
  average: 'AVERAGE',
  critical: 'DISCONNECTED',
  idle: 'IDLE',
  info: 'LIVE',
};

const needsAttention = (grade: Grade) => grade === 'critical' || grade === 'average';

function getFixTypeLabel(fixType: number): string {
  const labels: Record<number, string> = {
    0: 'No GPS',
    1: 'No Fix',
    2: '2D Fix',
    3: '3D Fix',
    4: 'DGPS',
    5: 'RTK Float',
    6: 'RTK Fixed',
  };
  return labels[fixType] || 'Unknown';
}

function titleCase(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'Unknown';
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function gradeGps(fixType: number): Grade {
  if (fixType >= 6) return 'healthy';
  if (fixType >= 3) return 'average';
  return 'critical';
}

function gradeBattery(pct: number | null): Grade {
  if (pct == null) return 'idle';
  if (pct > 50) return 'healthy';
  if (pct > 20) return 'average';
  return 'critical';
}

function gradeSignal(connected: boolean, rssi: number): Grade {
  if (!connected) return 'critical';
  if (rssi >= -60) return 'healthy';
  if (rssi >= -75) return 'average';
  return 'critical';
}

function gradeNetwork(type: string): Grade {
  const t = (type || 'none').toLowerCase();
  if (t === 'wifi' || t === 'ethernet') return 'healthy';
  return 'critical';
}

function gradeSats(sats: number): Grade {
  if (sats >= 14) return 'healthy';
  if (sats >= 8) return 'average';
  return 'critical';
}

function gradeMission(status: string): Grade {
  const s = (status || 'idle').toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('abort')) return 'critical';
  if (s.includes('pause') || s.includes('wait')) return 'average';
  if (s.includes('run') || s.includes('active') || s.includes('auto') || s.includes('progress')) {
    return 'healthy';
  }
  if (s === 'idle' || s === 'ready') return 'idle';
  return 'info';
}

function gradeArm(connected: boolean, armed: boolean): Grade {
  if (!connected) return 'idle';
  return armed ? 'critical' : 'healthy';
}

function formatSigned(value: number, digits: number, suffix: string): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)} ${suffix}`;
}

function cardinalFromHeading(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const d = ((deg % 360) + 360) % 360;
  return dirs[Math.round(d / 45) % 8];
}

const GradeDot = React.memo(({ grade, size = 7, color }: { grade: Grade; size?: number; color?: string }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color || GRADE[grade],
    }}
  />
));

const GradeBadge = React.memo(({ grade, label, inverted = false }: { grade: Grade; label?: string; inverted?: boolean }) => (
  <View style={[styles.badge, inverted ? styles.badgeInverted : { borderColor: `${GRADE[grade]}33`, backgroundColor: `${GRADE[grade]}0D` }]}>
    <GradeDot grade={grade} size={6} color={inverted ? '#FFFFFF' : undefined} />
    <Text style={[styles.badgeText, { color: inverted ? '#FFFFFF' : GRADE[grade] }]}>{label || GRADE_TEXT[grade]}</Text>
  </View>
));

const StatusTile = React.memo(
  ({
    title,
    value,
    grade,
    icon,
    isLightMode,
  }: {
    title: string;
    value: string;
    grade: Grade;
    icon: IconName;
    isLightMode?: boolean;
  }) => {
    const attention = needsAttention(grade);

    return (
    <View
      style={[
        styles.statusTile,
        isLightMode && lightStyles.statusTile,
        attention && { backgroundColor: GRADE[grade], borderColor: GRADE[grade] },
      ]}
    >
      <View style={styles.statusTileContent}>
        <View style={styles.statusTileLeft}>
          <View
            style={[
              styles.statusIconWrap,
              isLightMode && lightStyles.statusIconWrap,
              attention && styles.statusIconWrapAttention,
            ]}
          >
            <MaterialCommunityIcons name={icon} size={14} color={attention ? '#FFFFFF' : (isLightMode ? '#64748B' : MUTED)} />
          </View>
          <GradeDot grade={grade} size={5} color={attention ? '#FFFFFF' : undefined} />
          <Text style={[styles.statusTitle, isLightMode && lightStyles.statusTitle, attention && styles.statusTextAttention]}>{title}</Text>
        </View>
        <Text style={[styles.statusValue, { color: attention ? '#FFFFFF' : GRADE[grade] }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
    );
  },
);

const HeadingTape = React.memo(({ heading, isLightMode, isColorBlock = false }: { heading: number; isLightMode?: boolean; isColorBlock?: boolean }) => {
  const pxPerDeg = 3.4;

  // Generate absolute markers around the current heading
  const centerTick = Math.round(heading / 10) * 10;
  const marks: number[] = [];
  for (let val = centerTick - 90; val <= centerTick + 90; val += 10) {
    marks.push(val);
  }

  const labelFor = (raw: number) => {
    if (raw === 0) return 'N';
    if (raw === 90) return 'E';
    if (raw === 180) return 'S';
    if (raw === 270) return 'W';
    return String(raw).padStart(3, '0');
  };

  return (
    <View style={[styles.tapeWrap, isLightMode && lightStyles.tapeWrap, isColorBlock && styles.colorBlockTape, { padding: 0 }]}>
      <View style={[styles.tapeWindow, { position: 'relative', height: '100%' }]}>
        {marks.map((val) => {
          const raw = ((val % 360) + 360) % 360;
          const offset = val - heading;
          const cardinal = raw % 90 === 0;
          const labeled = cardinal || raw % 30 === 0;
          return (
            <View
              key={val}
              style={[
                styles.tapeMark,
                { transform: [{ translateX: offset * pxPerDeg }], top: 0, height: '100%' },
              ]}
            >
              {labeled ? (
                <Text style={[styles.tapeLabel, isLightMode && lightStyles.tapeLabel, cardinal && styles.tapeLabelCardinal, isColorBlock && styles.colorBlockSubText, { position: 'absolute', top: 6, width: '100%', textAlign: 'center', fontSize: cardinal ? 11 : 9, color: isColorBlock ? '#FFFFFF' : (cardinal ? ACCENT : (isLightMode ? '#64748B' : '#94A3B8')) }]}>{labelFor(raw)}</Text>
              ) : null}
              <View style={[styles.tapeTick, isLightMode && lightStyles.tapeTick, cardinal && styles.tapeTickMajor, isColorBlock && styles.colorBlockTick, { position: 'absolute', bottom: 0 }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.tapeLubber} />
      <View style={styles.tapeCaret} />
    </View>
  );
});

const RingMeter = React.memo(
  ({
    value,
    color,
    size = 96,
    suffix = '%',
    display,
    children,
    isLightMode,
    isColorBlock = false,
  }: {
    value: number;
    color: string;
    size?: number;
    suffix?: string;
    display?: string;
    children?: React.ReactNode;
    isLightMode?: boolean;
    isColorBlock?: boolean;
  }) => {
    const stroke = 8;
    const r = (size - stroke) / 2 - 3;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={isLightMode ? '#E2E8F0' : '#293548'} strokeWidth={stroke} fill="transparent" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - pct / 100)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        {children ?? (
          <>
            <Text style={[styles.ringNum, isLightMode && lightStyles.ringNum]}>
              {display ?? (Number.isFinite(value) ? Math.round(value) : '—')}
            </Text>
            {suffix ? <Text style={[styles.ringSuffix, isLightMode && lightStyles.ringSuffix, isColorBlock && styles.colorBlockSubText]}>{suffix}</Text> : null}
          </>
        )}
      </View>
    );
  },
);

const SparkTrack = React.memo(({ speed, isLightMode, isColorBlock = false }: { speed: number; isLightMode?: boolean; isColorBlock?: boolean }) => {
  const bars = 22;
  const moving = Number.isFinite(speed) && speed > 0.08;
  const lit = moving ? Math.max(3, Math.min(bars, Math.round(speed * 5) + 4)) : 2;
  return (
    <View style={styles.sparkRow}>
      {Array.from({ length: bars }, (_, i) => {
        const on = i < lit;
        const mid = Math.abs(i - lit / 2);
        const h = on ? 8 + Math.max(0, 8 - mid) : 4;
        return (
          <View
            key={i}
            style={[
              styles.sparkBar,
              { height: h, backgroundColor: on ? (isColorBlock ? '#FFFFFF' : ACCENT) : (isColorBlock ? 'rgba(255,255,255,0.26)' : (isLightMode ? '#CBD5E1' : '#334155')) },
            ]}
          />
        );
      })}
    </View>
  );
});

const InstCard = React.memo(
  ({
    icon,
    title,
    right,
    children,
    alert,
    isLightMode,
    colorBlock,
  }: {
    icon: IconName;
    title: string;
    right?: React.ReactNode;
    children: React.ReactNode;
    alert?: boolean;
    isLightMode?: boolean;
    colorBlock?: string;
  }) => (
    <View style={[styles.instCard, isLightMode && lightStyles.instCard, alert && styles.cardAlert, colorBlock && { backgroundColor: colorBlock, borderColor: colorBlock }]}>
      <View style={[styles.instAccent, colorBlock && styles.colorBlockAccent]} />
      <View style={styles.instHead}>
        <View style={styles.instHeadLeft}>
          <View style={[styles.instIcon, colorBlock && styles.colorBlockIcon]}>
            <MaterialCommunityIcons name={icon} size={14} color={colorBlock ? '#FFFFFF' : ACCENT} />
          </View>
          <Text style={[styles.kicker, isLightMode && lightStyles.kicker, colorBlock && styles.colorBlockText]}>{title}</Text>
        </View>
        {right}
      </View>
      <View style={styles.instBody}>{children}</View>
    </View>
  ),
);

export default function DashboardScreen({ isLightMode = false }: { isLightMode?: boolean }) {
  const { telemetry, connectionState, roverPosition, services } = useRover();
  const mountedRef = useRef(true);
  const [showRobotSettings, setShowRobotSettings] = useState(false);
  const [paramSaving, setParamSaving] = useState(false);
  const [paramLoading, setParamLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSaveParams = async () => {
    if (paramSaving) return;
    setParamSaving(true);
    try {
      await saveParamsToFile(services);
    } finally {
      if (mountedRef.current) setParamSaving(false);
    }
  };

  const handleLoadParams = async () => {
    if (paramLoading) return;
    setParamLoading(true);
    try {
      await loadParamsFromFile(services);
    } finally {
      if (mountedRef.current) setParamLoading(false);
    }
  };

  const vehicle = useMemo(() => {
    const armed = Boolean(telemetry.state?.armed);
    const connected = connectionState === 'connected';
    const fixType = telemetry.rtk?.fix_type ?? 0;
    const hasBattery =
      (telemetry.battery?.voltage ?? 0) > 0 || (telemetry.battery?.percentage ?? 0) > 0;
    const net = telemetry.network?.connection_type || 'none';
    const wifiOn = Boolean(telemetry.network?.wifi_connected);
    const rssi = asFiniteNumber(telemetry.network?.wifi_rssi) ?? 0;

    return {
      connected,
      armed,
      armStatus: armed ? 'ARMED' : 'DISARMED',
      sysStatus: telemetry.state?.system_status || (armed ? 'ARMED' : 'DISARMED'),
      mode: telemetry.state?.mode || 'UNKNOWN',
      fixType,
      fixTypeLabel: getFixTypeLabel(fixType),
      network: net.toUpperCase(),
      batteryPct: hasBattery ? telemetry.battery.percentage : null,
      wifiOn,
      rssi,
      armGrade: gradeArm(connected, armed),
      gpsGrade: gradeGps(fixType),
      netGrade: gradeNetwork(net),
      batGrade: gradeBattery(hasBattery ? telemetry.battery.percentage : null),
      sigGrade: gradeSignal(wifiOn, rssi),
      connGrade: (connected ? 'healthy' : 'critical') as Grade,
    };
  }, [
    telemetry.state?.armed,
    telemetry.state?.mode,
    telemetry.state?.system_status,
    telemetry.rtk?.fix_type,
    telemetry.battery?.voltage,
    telemetry.battery?.percentage,
    telemetry.network?.connection_type,
    telemetry.network?.wifi_connected,
    telemetry.network?.wifi_rssi,
    connectionState,
  ]);

  const heading = asFiniteNumber(telemetry.attitude?.yaw_deg) ?? 0;
  const speed = asFiniteNumber(telemetry.global?.vel) ?? 0;
  const sats = asFiniteNumber(telemetry.global?.satellites_visible) ?? 0;
  const hasFix = Boolean(roverPosition);
  const posGrade: Grade = !vehicle.connected ? 'critical' : hasFix ? 'healthy' : 'average';
  const missionStatus = telemetry.mission.status?.toUpperCase();
  const missionGrade = gradeMission(missionStatus || 'idle');
  const missionPct = Math.max(0, Math.min(100, telemetry.mission.progress_pct || 0));
  const heroGrade: Grade = !vehicle.connected ? 'critical' : vehicle.armed ? 'critical' : 'healthy';
  const headline = titleCase(vehicle.connected ? vehicle.sysStatus || vehicle.armStatus : 'Disconnected');
  const activityLabel = !vehicle.connected ? 'OFFLINE' : vehicle.armed ? 'ACTIVE' : 'STANDBY';
  const activityGrade: Grade = !vehicle.connected ? 'critical' : vehicle.armed ? 'average' : 'idle';
  const batLabel =
    vehicle.batteryPct == null
      ? 'NO DATA'
      : vehicle.batGrade === 'healthy'
        ? 'OK'
        : vehicle.batGrade === 'average'
          ? 'AVERAGE'
          : 'LOW';

  return (
    <View style={[styles.container, isLightMode && lightStyles.container]}>

      {/* Page header — Pure Telemetry Layout */}
      <View style={[styles.pageHead, isLightMode && lightStyles.pageHead]}>
        <View style={styles.pageHeadLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 0 }}>
            <GradeDot grade={heroGrade} size={8} />
            <Text style={styles.eyebrow}>SYSTEM TELEMETRY</Text>
          </View>
          <Text style={[styles.headline, isLightMode && lightStyles.headline]} numberOfLines={1} adjustsFontSizeToFit>
            {headline}
          </Text>
        </View>

        <View style={styles.headerMeta}>
          {[
            { label: 'LINK', val: vehicle.connected ? 'OK' : 'ERR', grade: vehicle.connGrade },
            { label: 'MODE', val: vehicle.mode, grade: 'info' as Grade },
            { label: 'TASK', val: activityLabel, grade: activityGrade }
          ].map((badge, idx) => (
            <View key={idx} style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>{badge.label}</Text>
              <Text style={[styles.headerMetaValue, { color: GRADE[badge.grade] }]}>{badge.val}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* Instruments */}
        <View style={styles.instruments}>
          <View style={styles.instRow}>
            <InstCard isLightMode={isLightMode} icon="speedometer" title="GROUND SPEED" colorBlock={ACCENT}>
              <View style={styles.speedRow}>
                <Text style={[styles.bigNum, styles.colorBlockText]} numberOfLines={1} adjustsFontSizeToFit>
                  {Number.isFinite(speed) ? speed.toFixed(1) : '—'}
                </Text>
                <Text style={[styles.unit, styles.colorBlockText]}>m/s</Text>
              </View>
              <SparkTrack isLightMode={isLightMode} speed={speed} isColorBlock />
              <Text style={[styles.sparkCaption, styles.colorBlockSubText]}>SPEED HISTORY · 60S</Text>
            </InstCard>

            <InstCard
              icon="compass-outline"
              title="HEADING"
              right={<GradeBadge grade="info" label={cardinalFromHeading(heading)} inverted />}
              colorBlock={HEADING_ACCENT}
            >
              <View style={styles.headingStack}>
                <View style={styles.headingTop}>
                  <View style={styles.headingCenterStack}>
                    <View style={styles.headingDataRow}>
                      <Text style={[styles.bigNum, styles.colorBlockText]} numberOfLines={1} adjustsFontSizeToFit>
                        {Number.isFinite(heading) ? String(((Math.round(heading) % 360) + 360) % 360) : '—'}
                      </Text>
                      <Text style={[styles.degreeTop, styles.colorBlockText]}>°</Text>
                    </View>
                  </View>
                  <View style={styles.headingCardinalWrap}>
                    <Text style={[styles.sparkCaptionRight, styles.colorBlockSubText]}>TRUE NORTH</Text>
                  </View>
                </View>
                <HeadingTape isLightMode={isLightMode} heading={heading} isColorBlock />
              </View>
            </InstCard>
          </View>

          <View style={styles.instRow}>
            <InstCard
              icon="battery-70"
              title="BATTERY"
              alert={vehicle.batGrade === 'critical'}
              right={<GradeBadge grade={vehicle.batGrade} label={batLabel} inverted />}
              colorBlock={GRADE[vehicle.batGrade]}
            >
              <View style={styles.instSplit}>
                <RingMeter
                  value={vehicle.batteryPct ?? 0}
                  color="#FFFFFF"
                  display={vehicle.batteryPct == null ? '—' : `${Math.round(vehicle.batteryPct)}`}
                  isColorBlock
                />
                <View style={[styles.statStack, isLightMode && lightStyles.statStack, isLightMode && lightStyles.statStack]}>
                  <View style={[styles.statChip, styles.colorBlockChip]}>
                    <Text style={[styles.statChipLabel, styles.colorBlockSubText]}>VOLTS</Text>
                    <Text style={[styles.statChipValue, styles.colorBlockText]}>{formatSigned(telemetry.battery.voltage, 1, 'V')}</Text>
                  </View>
                  <View style={[styles.statChip, styles.colorBlockChip]}>
                    <Text style={[styles.statChipLabel, styles.colorBlockSubText]}>AMPS</Text>
                    <Text style={[styles.statChipValue, styles.colorBlockText]}>{formatSigned(telemetry.battery.current, 1, 'A')}</Text>
                  </View>
                </View>
              </View>
            </InstCard>

            <InstCard
              icon="satellite-uplink"
              title="RTK / GPS"
              alert={vehicle.gpsGrade === 'critical'}
              right={
                <GradeBadge
                  grade={telemetry.rtk.base_linked ? 'healthy' : 'critical'}
                  label={telemetry.rtk.base_linked ? 'BASE LINKED' : 'BASE LOST'}
                  inverted
                />
              }
              colorBlock={GRADE[vehicle.gpsGrade]}
            >
              <View style={styles.instSplit}>
                <RingMeter isLightMode={isLightMode} isColorBlock value={(vehicle.fixType / 6) * 100} color="#FFFFFF">
                  <MaterialCommunityIcons name="satellite-uplink" size={22} color="#FFFFFF" />
                </RingMeter>
                <View style={[styles.statStack, isLightMode && lightStyles.statStack, isLightMode && lightStyles.statStack]}>
                  <Text style={[styles.fixName, styles.colorBlockText]} numberOfLines={1}>
                    {vehicle.fixTypeLabel}
                  </Text>
                  <View style={[styles.statChip, styles.colorBlockChip]}>
                    <Text style={[styles.statChipLabel, styles.colorBlockSubText]}>SATS</Text>
                    <Text style={[styles.statChipValue, styles.colorBlockText]}>{sats}</Text>
                  </View>
                  <Text style={[styles.meta, styles.colorBlockSubText]}>RTK: --</Text>
                </View>
              </View>
            </InstCard>
          </View>
        </View>

        <View style={[styles.sheet, isLightMode && lightStyles.sheet]}>
          <View style={styles.instAccent} />
          <View style={styles.instHead}>
            <View style={styles.instHeadLeft}>
              <View style={styles.instIcon}>
                <MaterialCommunityIcons name="car-connected" size={14} color={ACCENT} />
              </View>
              <Text style={[styles.kicker, isLightMode && lightStyles.kicker, isLightMode && lightStyles.kicker]}>VEHICLE STATUS</Text>
            </View>
            <GradeBadge grade={vehicle.connGrade} />
          </View>

          <View style={styles.statusGrid}>
            <StatusTile
              title="LINK"
              value={GRADE_TEXT[vehicle.connGrade]}
              grade={vehicle.connGrade}
              icon="access-point-network"
            />
            <StatusTile isLightMode={isLightMode} title="ARM" value={vehicle.armStatus} grade={vehicle.armGrade} icon="shield-alert-outline" />
            <StatusTile isLightMode={isLightMode} title="MODE" value={vehicle.mode} grade="info" icon="steering" />
            <StatusTile isLightMode={isLightMode} title="GPS / RTK" value={vehicle.fixTypeLabel} grade={vehicle.gpsGrade} icon="satellite-uplink" />
            <StatusTile isLightMode={isLightMode} title="NETWORK" value={vehicle.network} grade={vehicle.netGrade} icon="lan" />
            <StatusTile
              title="SIGNAL"
              value={vehicle.wifiOn ? `${vehicle.rssi} dBm` : '—'}
              grade={vehicle.sigGrade}
              icon="wifi"
            />
          </View>

          <View style={styles.sheetFoot}>
            <View style={styles.rowBetween}>
              <Text style={[styles.kicker, isLightMode && lightStyles.kicker, isLightMode && lightStyles.kicker]}>QUICK TUNE</Text>
              <GradeBadge grade="idle" label="PX4 OFF" />
            </View>
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Text style={[styles.chipText, isLightMode && lightStyles.chipText]}>STEERING PID</Text>
              </View>
              <View style={styles.chip}>
                <Text style={[styles.chipText, isLightMode && lightStyles.chipText]}>SPEED GAINS</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.missionBar, isLightMode && lightStyles.missionBar]}>
        <View style={[styles.missionCell, { flex: 0.8 }]}>
          <Text style={[styles.kicker, isLightMode && lightStyles.kicker]}>WAYPOINT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
            <Text style={[styles.missionNum, isLightMode && lightStyles.missionNum]}>
              {telemetry.mission.current_wp}
            </Text>
            <Text style={[styles.missionSub, isLightMode && lightStyles.missionSub, { opacity: 0.6, marginLeft: 6 }]}>
              / {telemetry.mission.total_wp || 1}
            </Text>
          </View>
        </View>

        <View style={styles.vSplit} />

        <View style={[styles.missionCell, { flex: 1.2 }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.kicker, isLightMode && lightStyles.kicker]}>MISSION PROGRESS</Text>
            <GradeBadge grade={missionGrade} label={missionStatus || 'IDLE'} />
          </View>
          <View style={[styles.progressRow, { marginTop: 4 }]}>
            <Text style={[styles.missionNum, isLightMode && lightStyles.missionNum]}>{Math.round(missionPct)}%</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${missionPct}%`, backgroundColor: GRADE[missionGrade] }]} />
            </View>
          </View>
        </View>

        <View style={styles.vSplit} />

        <View style={[styles.missionCellWide, { flex: 1.5, justifyContent: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coordinateLabel, isLightMode && lightStyles.coordinateLabel]}>LATITUDE</Text>
              <Text style={[styles.coord, isLightMode && lightStyles.coord, { fontSize: 16, letterSpacing: 0.5 }]}>{hasFix ? roverPosition!.lat.toFixed(6) : '—'}</Text>
            </View>
            <View style={[styles.coordinateDivider, isLightMode && lightStyles.coordinateDivider]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.coordinateLabel, isLightMode && lightStyles.coordinateLabel]}>LONGITUDE</Text>
              <Text style={[styles.coord, isLightMode && lightStyles.coord, { fontSize: 16, letterSpacing: 0.5 }]}>{hasFix ? roverPosition!.lng.toFixed(6) : '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, isLightMode && lightStyles.actionBtn, styles.actionPrimary, !vehicle.connected && styles.opacityLow]}
          onPress={() => setShowRobotSettings(true)}
          disabled={!vehicle.connected}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, styles.actionPrimaryIcon]}>
            <MaterialCommunityIcons name="cog-outline" size={18} color={INK} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionPrimaryTitle}>Robot Settings</Text>
            <Text style={styles.actionPrimarySub}>
              {ROBOT_PARAM_COUNT} params · {ROBOT_CAT_COUNT} cat.
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionSecondary, styles.actionSave, !vehicle.connected && styles.opacityLow]}
          onPress={handleSaveParams}
          disabled={!vehicle.connected || paramSaving}
        >
          {paramSaving ? (
            <View style={[styles.actionIcon, styles.actionSaveIcon]}>
              <ActivityIndicator size={16} color="#FFFFFF" />
            </View>
          ) : (
            <View style={[styles.actionIcon, styles.actionSaveIcon]}>
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Save Params</Text>
            <Text style={styles.actionSub}>Export configuration</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionSecondary, styles.actionLoad, !vehicle.connected && styles.opacityLow]}
          onPress={handleLoadParams}
          disabled={!vehicle.connected || paramLoading}
        >
          {paramLoading ? (
            <View style={[styles.actionIcon, styles.actionLoadIcon]}>
              <ActivityIndicator size={16} color="#FFFFFF" />
            </View>
          ) : (
            <View style={[styles.actionIcon, styles.actionLoadIcon]}>
              <MaterialCommunityIcons name="folder-open-outline" size={18} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Load Params</Text>
            <Text style={styles.actionSub}>Import configuration</Text>
          </View>
        </TouchableOpacity>
      </View>

      <RobotSettingsModal visible={showRobotSettings} onClose={() => setShowRobotSettings(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SUBSURFACE,
    paddingTop: MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE,
    paddingHorizontal: MISSION_PROGRESS_LAYOUT.EDGE,
    paddingBottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET,
    gap: 12,
  },
  flex1: { flex: 1, minWidth: 0 },

  pageHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 16,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  pageHeadLeft: { flex: 1, minWidth: 0, paddingRight: 16 },
  eyebrow: { color: MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  headerMeta: { gap: 6, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerMetaLabel: { color: LABEL, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  headerMetaValue: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  kicker: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  headline: {
    color: TITLE,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.2,
    marginTop: 4,
  },
  hint: {
    color: MUTED,
    fontSize: 13,
    marginTop: 4,
  },

  body: { flex: 1, flexDirection: 'row', gap: 12, minHeight: 0 },
  instruments: { flex: 1.35, gap: 12, minWidth: 0 },
  instRow: { flex: 1, flexDirection: 'row', gap: 12, minHeight: 0 },
  instCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    paddingTop: 12,
    minWidth: 0,
    overflow: 'hidden',
  },
  instAccent: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: BORDER,
    opacity: 1,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  colorBlockAccent: { backgroundColor: 'rgba(255,255,255,0.82)' },
  instHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  instHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  instIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#17233A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instBody: { flex: 1, minHeight: 0, justifyContent: 'center' },
  cardAlert: { borderColor: 'rgba(255, 59, 48, 0.7)' },
  instSplit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headingBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  headingReadout: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headingCardinal: {
    color: ACCENT,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  unitInline: { color: ACCENT, fontSize: 22, fontWeight: '700' },
  speedRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  bigNum: {
    color: TITLE,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.6,
    lineHeight: 52,
    fontVariant: ['tabular-nums'],
  },
  unit: { color: ACCENT, fontSize: 14, fontWeight: '700', marginBottom: 6, letterSpacing: 0.6 },
  unitHint: { color: MUTED, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  fixName: { fontSize: 20, fontWeight: '700' },
  meta: { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statStack: { flex: 1, gap: 8, minWidth: 0 },
  statChip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statChipLabel: {
    color: LABEL,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  statChipValue: {
    color: TITLE,
    fontSize: 15,
    fontWeight: '700',
  },

  sparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 1.5,
  },
  sparkCaption: {
    color: MUTED,
    fontSize: 8,
    letterSpacing: 1.1,
    fontWeight: '600',
    marginTop: 8,
  },
  sparkCaptionRight: {
    color: MUTED,
    fontSize: 8,
    letterSpacing: 1.1,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'right',
  },
  compassN: { position: 'absolute', top: 4, color: ACCENT, fontSize: 9, fontWeight: '700' },
  compassS: { position: 'absolute', bottom: 4, color: MUTED, fontSize: 9, fontWeight: '700' },
  compassE: { position: 'absolute', right: 5, color: MUTED, fontSize: 9, fontWeight: '700' },
  compassW: { position: 'absolute', left: 5, color: MUTED, fontSize: 9, fontWeight: '700' },
  ringNum: { color: TITLE, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  ringSuffix: { color: MUTED, fontSize: 9, fontWeight: '700', marginTop: -2, letterSpacing: 0.8 },

  sheet: {
    width: 300,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    paddingTop: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  linkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: SUBSURFACE,
    marginBottom: 8,
  },
  linkDotRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkKicker: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  linkValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  sheetList: { flex: 1, justifyContent: 'center', gap: 6, paddingVertical: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    backgroundColor: SUBSURFACE,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingRight: 12,
  },
  statusStripe: { width: 3, alignSelf: 'stretch' },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sheetFoot: {
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: SUBSURFACE,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: { color: MUTED, fontSize: 8, fontWeight: '700', letterSpacing: 0.4 },

  missionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  missionCell: { gap: 4, minWidth: 108 },
  missionCellWide: { gap: 4, minWidth: 168 },
  missionNum: { color: TITLE, fontSize: 20, fontWeight: '700' },
  missionSub: { color: MUTED, fontSize: 13, fontWeight: '600' },
  vSplit: { width: 1, alignSelf: 'stretch', backgroundColor: BORDER },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2C3A4F',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  coord: {
    color: TITLE,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  coordinateLabel: { color: LABEL, fontSize: 9, fontWeight: '700', marginBottom: 4, letterSpacing: 1 },
  coordinateDivider: { width: 1, height: 28, backgroundColor: BORDER, marginHorizontal: 16 },

  headingStack: { flex: 1, justifyContent: 'space-between' },
  headingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  headingCardinalWrap: {
    position: 'absolute',
    right: 0,
    alignItems: 'flex-end',
  },
  headingCenterStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingDataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  degreeTop: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  tapeWrap: {
    height: 44,
    backgroundColor: SUBSURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorBlockTape: { backgroundColor: 'rgba(0,0,0,0.12)', borderColor: 'rgba(255,255,255,0.22)' },
  colorBlockTick: { backgroundColor: 'rgba(255,255,255,0.55)' },
  tapeWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  tapeMark: {
    position: 'absolute',
    alignItems: 'center',
    width: 60,
    left: '50%',
    marginLeft: -30,
  },
  tapeTick: {
    width: 2,
    height: 6,
    backgroundColor: '#526174',
    borderRadius: 1,
  },
  tapeTickMajor: {
    height: 10,
    backgroundColor: MUTED,
  },
  tapeLabel: {
    color: MUTED,
    fontSize: 9,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  tapeLabelCardinal: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  tapeLubber: {
    position: 'absolute',
    width: 2,
    height: 44,
    backgroundColor: ACCENT,
    top: 0,
    left: '50%',
    marginLeft: -1,
    zIndex: 2,
  },
  tapeCaret: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: ACCENT,
    zIndex: 3,
  },

  statusGrid: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
  },
  statusTile: {
    width: '100%',
    backgroundColor: SUBSURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  statusTileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 12,
  },
  statusTileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#17233A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBlockIcon: { backgroundColor: 'rgba(255,255,255,0.16)' },
  colorBlockText: { color: '#FFFFFF' },
  colorBlockSubText: { color: 'rgba(255,255,255,0.76)' },
  colorBlockChip: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.22)' },
  statusIconWrapAttention: { backgroundColor: 'rgba(255,255,255,0.18)' },
  statusTextAttention: { color: '#FFFFFF' },

  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 58,
    paddingHorizontal: 14,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  actionPrimary: { flex: 1.45, backgroundColor: ACCENT, borderColor: '#60A5FA' },
  actionSecondary: { backgroundColor: '#111C2D' },
  actionSave: { backgroundColor: '#102A22', borderColor: '#237452' },
  actionLoad: { backgroundColor: '#142640', borderColor: '#3468A7' },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionPrimaryIcon: { backgroundColor: 'rgba(255,255,255,0.16)' },
  actionSaveIcon: { backgroundColor: '#21845B' },
  actionLoadIcon: { backgroundColor: '#326BB0' },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  actionSub: { color: 'rgba(255,255,255,0.64)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  actionPrimaryTitle: { color: INK, fontSize: 14, fontWeight: '800' },
  actionPrimarySub: { color: 'rgba(255,255,255,0.76)', fontSize: 10, fontWeight: '600', marginTop: 2 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeInverted: { borderColor: 'rgba(255,255,255,0.34)', backgroundColor: 'rgba(255,255,255,0.12)' },
  badgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  opacityLow: { opacity: 0.42 },
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F1F5F9' },
  pageHead: { borderBottomColor: '#D8E0EA' },
  instCard: { backgroundColor: '#FFFFFF', borderColor: '#D8E0EA' },
  sheet: { backgroundColor: '#FFFFFF', borderColor: '#D8E0EA' },
  missionBar: { backgroundColor: '#FFFFFF', borderColor: '#D8E0EA' },
  statusTile: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  statusIconWrap: { backgroundColor: '#EEF2F7' },
  coordinateDivider: { backgroundColor: '#D8E0EA' },
  statusTitle: { color: '#475569' },
  ringNum: { color: '#0F172A' },
  ringSuffix: { color: '#64748B' },
  statChip: { borderColor: '#D8E0EA' },
  statChipLabel: { color: '#64748B' },
  statChipValue: { color: '#0F172A' },
  meta: { color: '#64748B' },
  chipText: { color: '#475569' },
  coordinateLabel: { color: '#64748B' },
  kicker: { color: '#64748B' },
  headline: { color: '#0F172A' },
  hint: { color: '#475569' },
  title: { color: '#0F172A' },
  value: { color: '#0F172A' },
  bigNum: { color: '#0F172A' },
  actionPrimaryTitle: { color: '#FFFFFF' },
  actionPrimarySub: { color: 'rgba(255,255,255,0.72)' },
  coord: { color: '#0F172A' },
  missionNum: { color: '#0F172A' },
  missionSub: { color: '#64748B' },
  tapeLabel: { color: 'rgba(0,0,0,0.6)' },
  tapeWrap: { backgroundColor: '#F8FAFC', borderColor: '#D8E0EA' },
  tapeTick: { backgroundColor: 'rgba(0,0,0,0.3)' },
  tapeTickMajor: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sparkCaption: { color: '#475569' },
  sparkCaptionRight: { color: '#475569' },
  actionBtn: { backgroundColor: '#FFFFFF', borderColor: '#D8E0EA' },
  statStack: { backgroundColor: 'transparent' },
});
