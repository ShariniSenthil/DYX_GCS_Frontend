import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTelemetry } from '../../context/TelemetryContext';
import { useConnection } from '../../context/ConnectionContext';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { isOfflineMode } from '../../config';
import { JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS } from '../../config/featureFlags';
import { useVirtualJoystick } from '../../hooks/useVirtualJoystick';
import { disarmVehicle } from '../../services/vehicleControlService';
import { canAcquireJoystick } from '../../utils/joystickFrontendSafety';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { MISSION_PROGRESS_LAYOUT } from '../../constants/missionProgressLayout';
import { processAxis } from '../../utils/joystickMath';
import { ManualJoystick, JoystickValues } from './ManualJoystick';
import type { FrontendJoystickState } from '../../types/px4/joystick';

interface ManualDrivePanelProps {
  onClose: () => void;
}

const PREVIEW_MAX_THROTTLE = 0.35;
const PREVIEW_MAX_STEERING = 0.5;

function formatSpeedMps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} m/s`;
}

function stateLabel(state: FrontendJoystickState): string {
  switch (state) {
    case 'ACTIVE':
      return 'Driving';
    case 'HELD':
      return 'Lease held';
    case 'ACQUIRING':
      return 'Acquiring';
    case 'RELEASING':
      return 'Releasing';
    case 'BLOCKED_BY_MISSION':
      return 'Blocked by mission';
    case 'SUSPENDED':
      return 'Suspended';
    case 'DISCONNECTED':
      return 'Disconnected';
    case 'DISABLED':
      return 'Disabled';
    case 'ERROR':
      return 'Error';
    default:
      return 'Available';
  }
}

export const ManualDrivePanel: React.FC<ManualDrivePanelProps> = ({ onClose }) => {
  const { telemetry } = useTelemetry();
  const { connectionState, services, socket } = useConnection();
  const { session } = useAuth();
  const [estopping, setEstopping] = useState(false);
  const [previewIntent, setPreviewIntent] = useState({ throttle: 0, steering: 0 });
  const acquireAttemptedRef = useRef(false);
  const autoArmAttemptedRef = useRef(false);
  const lastJoystickAlertRef = useRef<string | null>(null);

  const authToken = session?.token ?? '';
  const isSocketConnected = connectionState === 'connected';
  const offlinePreview = JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS && isOfflineMode();

  const showJoystickError = useCallback((_title: string, message: string) => {
    if (lastJoystickAlertRef.current === message) return;
    lastJoystickAlertRef.current = message;
    Alert.alert('Joystick', message);
    setTimeout(() => {
      if (lastJoystickAlertRef.current === message) {
        lastJoystickAlertRef.current = null;
      }
    }, 4000);
  }, []);

  const joystick = useVirtualJoystick({
    socket: offlinePreview ? null : socket,
    authToken,
    socketConnected: offlinePreview ? true : isSocketConnected,
    onErrorMessage: offlinePreview ? undefined : showJoystickError,
  });

  const isConnected = offlinePreview || (isSocketConnected && telemetry.fcu_connected !== false);
  const isArmed = offlinePreview || Boolean(telemetry.state?.armed);
  const mode = offlinePreview ? 'MANUAL' : (telemetry.state?.mode || 'UNKNOWN');
  const missionRunning = telemetry.mission_state === 'active';

  const hasLease = Boolean(joystick.leaseId);
  const stickEnabled =
    offlinePreview ||
    (hasLease && (joystick.state === 'ACTIVE' || joystick.state === 'HELD'));

  const canAcquire = canAcquireJoystick({
    missionRunning,
    frontendState: joystick.state,
    backendJoystickActive: telemetry.joystick_active ?? undefined,
    controlOwner: telemetry.control_owner ?? undefined,
  });

  // Fallback auto-arm (Three_Wheel pattern) when panel opens without prior arm
  useEffect(() => {
    if (offlinePreview) return;
    if (missionRunning || !isConnected || isArmed) return;
    if (autoArmAttemptedRef.current) return;

    autoArmAttemptedRef.current = true;
    void services.armVehicle();
  }, [offlinePreview, missionRunning, isConnected, isArmed, services]);

  // Auto-acquire when vehicle is ready (Three_Wheel pattern)
  useEffect(() => {
    if (offlinePreview) return;
    if (!isConnected || !isArmed) return;
    if (hasLease || joystick.state === 'ACQUIRING' || joystick.state === 'RELEASING') return;
    if (acquireAttemptedRef.current) return;
    if (!canAcquire) return;

    acquireAttemptedRef.current = true;
    joystick.acquire();
  }, [
    offlinePreview,
    isConnected,
    isArmed,
    hasLease,
    joystick,
    canAcquire,
  ]);

  // Reconcile telemetry into joystick state machine
  useEffect(() => {
    if (offlinePreview) return;
    joystick.reconcileTelemetry({
      joystick_state: telemetry.joystick_state ?? null,
      joystick_active: telemetry.joystick_active ?? null,
      joystick_last_valid_cmd_age_ms: telemetry.joystick_last_valid_cmd_age_ms ?? null,
      joystick_stop_reason: telemetry.joystick_stop_reason ?? null,
      control_owner: telemetry.control_owner ?? null,
      connected: isConnected,
      armed: isArmed,
      mode,
    });
  }, [
    telemetry.joystick_state,
    telemetry.joystick_active,
    telemetry.joystick_last_valid_cmd_age_ms,
    telemetry.joystick_stop_reason,
    telemetry.control_owner,
    isConnected,
    isArmed,
    mode,
    joystick,
    offlinePreview,
  ]);

  const maxThrottle = offlinePreview ? PREVIEW_MAX_THROTTLE : joystick.maxThrottle;
  const maxSteering = offlinePreview ? PREVIEW_MAX_STEERING : joystick.maxSteering;
  const displayIntent = offlinePreview ? previewIntent : joystick.displayIntent;

  const handleClose = useCallback(() => {
    if (!offlinePreview) {
      joystick.release();
    } else {
      setPreviewIntent({ throttle: 0, steering: 0 });
    }
    onClose();
  }, [joystick, offlinePreview, onClose]);

  const handleJoystickChange = useCallback(
    (values: JoystickValues) => {
      if (offlinePreview) {
        setPreviewIntent({
          throttle: processAxis(values.forward, 0.03, 1, maxThrottle),
          steering: processAxis(values.yaw, 0.03, 1, maxSteering),
        });
        return;
      }
      joystick.setIntent(values.forward, values.yaw);
    },
    [offlinePreview, joystick, maxThrottle, maxSteering],
  );

  const handleJoystickRelease = useCallback(() => {
    if (offlinePreview) {
      setPreviewIntent({ throttle: 0, steering: 0 });
      return;
    }
    joystick.setIntent(0, 0);
  }, [offlinePreview, joystick]);

  const handleEstop = useCallback(async () => {
    if (offlinePreview) {
      setPreviewIntent({ throttle: 0, steering: 0 });
      return;
    }
    setEstopping(true);
    joystick.handleEStop();
    try {
      const response = await services.emergencyStop();
      if (!response.success) {
        Alert.alert('E-stop failed', response.message || response.error || 'Unable to send E-stop');
        return;
      }
      if (isArmed) {
        const disarmResponse = await disarmVehicle();
        if (!disarmResponse.success) {
          Alert.alert(
            'Disarm failed',
            disarmResponse.message || 'E-stop was sent, but the rover did not disarm.',
          );
        }
      }
    } catch (err) {
      Alert.alert('E-stop failed', err instanceof Error ? err.message : 'Unable to send E-stop');
    } finally {
      setEstopping(false);
    }
  }, [isArmed, joystick, services, offlinePreview]);

  const status = useMemo(() => {
    if (offlinePreview) {
      return stickEnabled
        ? { label: 'ready', color: '#22c55e' }
        : { label: 'preparing', color: '#94a3b8' };
    }
    if (!isConnected) return { label: 'offline', color: '#ef4444' };
    if (!isArmed) return { label: 'arm vehicle first', color: '#f59e0b' };
    if (joystick.isDisabled) return { label: 'manual disabled', color: '#ef4444' };
    if (joystick.state === 'BLOCKED_BY_MISSION') return { label: 'mission active', color: '#f59e0b' };
    if (joystick.state === 'ACTIVE') return { label: 'driving', color: '#22c55e' };
    if (joystick.state === 'HELD') return { label: 'lease held', color: '#f4c10c' };
    return { label: stateLabel(joystick.state).toLowerCase(), color: '#94a3b8' };
  }, [offlinePreview, stickEnabled, isConnected, isArmed, joystick.state, joystick.isDisabled]);

  const speedDisplays = useMemo(() => {
    if (offlinePreview) {
      return { speed: '—', alongTrack: '—' };
    }
    const measured = telemetry.measured_speed_m_s;
    const ground = telemetry.global?.vel;
    const displaySpeed = measured ?? ground;
    return {
      speed: formatSpeedMps(displaySpeed),
      alongTrack: formatSpeedMps(telemetry.along_track_speed_mps),
    };
  }, [
    offlinePreview,
    telemetry.measured_speed_m_s,
    telemetry.global?.vel,
    telemetry.along_track_speed_mps,
  ]);

  const overlayMessage = offlinePreview
    ? null
    : joystick.state === 'ACQUIRING'
      ? 'Acquiring...'
      : !isArmed
        ? 'Arming...'
        : stateLabel(joystick.state);

  return (
    <ErrorBoundary
      componentName="Manual Drive Panel"
      fallback={
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
          <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 16 }}>
            Joystick failed to load. Mission controls remain active.
          </Text>
        </View>
      }
    >
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.backdrop}>
          <View style={styles.backdropDim} pointerEvents="none" />
          <View style={styles.panel}>
            <View style={styles.manualStatusBar}>
              <View style={[styles.manualStatusDot, { backgroundColor: status.color }]} />
              <Text style={styles.manualStatusText}>{status.label}</Text>
              <Text style={styles.modeText}>{mode}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                activeOpacity={0.7}
                accessibilityLabel="Close manual control"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.speedStrip}>
              <View style={styles.commandTile}>
                <Text style={styles.commandLabel}>Speed</Text>
                <Text style={styles.commandValue}>{speedDisplays.speed}</Text>
              </View>
              <View style={styles.commandTile}>
                <Text style={styles.commandLabel}>Along-Trk</Text>
                <Text style={styles.commandValue}>{speedDisplays.alongTrack}</Text>
              </View>
            </View>

            {joystick.error && !offlinePreview && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {joystick.error.message || joystick.error.code}
                </Text>
              </View>
            )}

            {joystick.stopReason && !offlinePreview && (
              <Text style={styles.stopReasonText}>Stop: {joystick.stopReason}</Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.estopButton, estopping && styles.disabledAction]}
                onPress={handleEstop}
                disabled={estopping}
                activeOpacity={0.82}
              >
                {estopping ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <MaterialCommunityIcons name="octagon" size={17} color="#ffffff" />
                )}
                <Text style={styles.actionText}>E-STOP</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.commandStrip}>
              <View style={styles.commandTile}>
                <Text style={styles.commandLabel}>Throttle</Text>
                <Text style={styles.commandValue}>
                  {maxThrottle > 0
                    ? `${Math.round((displayIntent.throttle / maxThrottle) * 100)}%`
                    : '0%'}
                </Text>
              </View>
              <View style={styles.commandTile}>
                <Text style={styles.commandLabel}>Steering</Text>
                <Text style={styles.commandValue}>
                  {maxSteering > 0
                    ? `${Math.round((displayIntent.steering / maxSteering) * 100)}%`
                    : '0%'}
                </Text>
              </View>
              <View style={styles.commandTile}>
                <Text style={styles.commandLabel}>Rate</Text>
                <Text style={styles.commandValue}>
                  {offlinePreview
                    ? '20Hz'
                    : joystick.commandRateHz
                      ? `${joystick.commandRateHz}Hz`
                      : '--'}
                </Text>
              </View>
            </View>

            <View style={styles.joystickCard} pointerEvents="box-none">
              <ManualJoystick
                key={stickEnabled ? 'stick-enabled' : 'stick-disabled'}
                onChange={handleJoystickChange}
                onRelease={handleJoystickRelease}
                size={176}
                knobSize={54}
                disabled={!stickEnabled}
              />
              {!stickEnabled && overlayMessage ? (
                <View style={styles.joystickOverlay} pointerEvents="none">
                  <Text style={styles.joystickOverlayText}>{overlayMessage}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.28)',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: MISSION_PROGRESS_LAYOUT.EDGE,
    paddingBottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET + 72,
    paddingLeft: MISSION_PROGRESS_LAYOUT.EDGE,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    width: MISSION_PROGRESS_LAYOUT.RIGHT_PANEL_WIDTH,
    maxWidth: '100%',
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  manualStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  manualStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  manualStatusText: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
    flex: 1,
  },
  modeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '800',
  },
  closeBtn: PATH_PLAN_HEADER.closeBtn,
  errorBox: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(127, 29, 29, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.38)',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '800',
  },
  stopReasonText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  joystickCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  joystickOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
  },
  joystickOverlayText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  commandStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  speedStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  commandTile: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  commandLabel: {
    color: 'rgba(226, 232, 240, 0.58)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  commandValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 5,
  },
  actions: {
    gap: 10,
  },
  estopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#991b1b',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.45)',
  },
  disabledAction: {
    opacity: 0.55,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default ManualDrivePanel;
