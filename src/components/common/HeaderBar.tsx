import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import VoiceSettingsModal from './VoiceSettingsModal';
import { FailsafeModeSelector } from '../pathplan/FailsafeModeSelector';
import { colors } from '../../theme/colors';
import { useRover } from '../../context/RoverContext';
import { emergencyStop, releaseEmergencyStop } from '../../services/vehicleControlService';
import { ROVER_ENABLED } from '../../config/featureFlags';
import { getBackendURL } from '../../config';

export function HeaderBar({ missionMode = 'DGPS Mark' }: { missionMode?: string }) {
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const { gpsFailsafeMode, setGpsFailsafeMode, telemetry, services, connectionState, reconnect } = useRover();
  const [showFailsafeModeSelector, setShowFailsafeModeSelector] = useState(false);
  const [isEmergencyStopping, setIsEmergencyStopping] = useState(false);
  const [isReleasingEstop, setIsReleasingEstop] = useState(false);
  const getModeIcon = (mode: string): string => {
    switch (mode.toLowerCase()) {
      case 'dgps mark':
        return 'star-three-points-outline';
      case 'interval spray':
        return '💧';
      case 'survey':
        return '🗺️';
      case 'manual control':
        return '🎮';
      case 'custom':
        return '⚙️';
      default:
        return '🎯';
    }
  };

  const connectionInfo = useMemo(() => {
    const host = getBackendURL().replace(/^https?:\/\//, '');
    if (connectionState === 'connecting') {
      return { label: 'Connecting…', sublabel: host, color: colors.warning, dot: colors.warning };
    }
    if (connectionState === 'connected') {
      const fcuUp = telemetry.fcu_connected !== false;
      return fcuUp
        ? { label: 'Online', sublabel: host, color: colors.success, dot: colors.success }
        : { label: 'GCS only', sublabel: `${host} · FCU offline`, color: colors.warning, dot: colors.warning };
    }
    if (connectionState === 'error') {
      return { label: 'Error', sublabel: host, color: colors.danger, dot: colors.danger };
    }
    return { label: 'Offline', sublabel: host, color: colors.danger, dot: colors.danger };
  }, [connectionState, telemetry.fcu_connected]);

  const handleEmergencyStop = async () => {
    Alert.alert(
      '🚨 EMERGENCY STOP',
      'This will immediately stop all operations. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'STOP NOW',
          style: 'destructive',
          onPress: async () => {
            setIsEmergencyStopping(true);
            try {
              if (ROVER_ENABLED) {
                // PX4: use the acknowledged REST E-stop service.
                await emergencyStop((result) => {
                  if (result.success) {
                    Alert.alert('✅ Emergency Stop', 'All operations stopped');
                  } else {
                    Alert.alert('⚠️ E-Stop', result.message || 'Stop issued');
                  }
                });
              } else {
                // Legacy ArduRover path
                const response = await services.emergencyStop();
                if (response?.success) {
                  Alert.alert('✅ Emergency Stop', 'All operations stopped');
                } else {
                  Alert.alert('❌ Failed', 'Emergency stop failed');
                }
              }
            } catch (error) {
              console.error('[EMERGENCY] Error:', error);
              Alert.alert('❌ Error', 'Failed to execute emergency stop');
            } finally {
              setIsEmergencyStopping(false);
            }
          },
        },
      ]
    );
  };

  const handleReleaseEmergencyStop = async () => {
    Alert.alert(
      '🔓 Release E-Stop',
      'This clears the emergency stop latch. The rover stays disarmed and ' +
        'the mission stays disabled until you press Start. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'RELEASE',
          onPress: async () => {
            setIsReleasingEstop(true);
            try {
              await releaseEmergencyStop((result) => {
                if (result.success) {
                  Alert.alert(
                    '✅ E-Stop Released',
                    result.message || 'Emergency stop released; mission movement remains disabled.',
                  );
                } else {
                  Alert.alert('⚠️ Release Failed', result.message || 'Unable to release emergency stop');
                }
              });
            } catch (error) {
              console.error('[ESTOP RELEASE] Error:', error);
              Alert.alert('❌ Error', 'Failed to release emergency stop');
            } finally {
              setIsReleasingEstop(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.header}>
      <View style={styles.leftSection}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>⚙️</Text>
        </View>
        <View style={styles.brandingSection}>
          <Text style={styles.title}>DYX Autonomous</Text>
          <Text style={styles.subtitle}>Way To Mark</Text>
        </View>
      </View>

      <View style={styles.menuItems}>
        <Text style={styles.menuText}>Dashboard</Text>
        <Text style={styles.menuText}>Path Plan</Text>
        <Text style={[styles.menuText, styles.active]}>Mission Report</Text>
      </View>

      <View style={styles.rightSection}>
        <View style={styles.modeBox}>
          {getModeIcon(missionMode) === 'star-three-points-outline' ? (
            <MaterialCommunityIcons
              name="star-three-points-outline"
              size={14}
              color="#fff"
              style={styles.modeIconMdi}
            />
          ) : (
            <Text style={styles.modeIcon}>{getModeIcon(missionMode)}</Text>
          )}
          <View>
            <Text style={styles.modeLabel}>MODE</Text>
            <Text style={styles.modeValue}>{missionMode}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { borderColor: `${connectionInfo.color}55` }]}>
          <View style={[styles.statusDot, { backgroundColor: connectionInfo.dot }]} />
          <View>
            <Text style={[styles.statusText, { color: connectionInfo.color }]}>
              {connectionInfo.label}
            </Text>
            <Text style={styles.statusHost} numberOfLines={1}>
              {connectionInfo.sublabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.reconnectButton}
          onPress={reconnect}
          accessibilityLabel="Reconnect to rover"
          accessibilityRole="button"
        >
          <Text style={styles.reconnectIcon}>🔄</Text>
          <Text style={styles.reconnectText}>Reconnect</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            console.log('🔊 Voice button pressed - opening modal');
            setShowVoiceModal(true);
          }}
          style={styles.voiceButton}
          accessibilityLabel="Open voice settings"
          accessibilityRole="button"
        >
          <Text style={styles.voiceIcon}>🔊</Text>
          <Text style={styles.voiceText}>Voice</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReleaseEmergencyStop}
          style={[styles.releaseButton, isReleasingEstop && styles.buttonDisabled]}
          disabled={isReleasingEstop}
          accessibilityLabel="Release emergency stop"
          accessibilityRole="button"
        >
          <Text style={styles.releaseIcon}>🔓</Text>
          <Text style={styles.releaseText}>
            {isReleasingEstop ? 'Releasing...' : 'RELEASE'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleEmergencyStop}
          style={[styles.emergencyButton, isEmergencyStopping && styles.buttonDisabled]}
          disabled={isEmergencyStopping}
          accessibilityLabel="Emergency stop"
          accessibilityRole="button"
        >
          <Text style={styles.emergencyIcon}>🚨</Text>
          <Text style={styles.emergencyText}>
            {isEmergencyStopping ? 'Stopping...' : 'STOP'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowFailsafeModeSelector(true)}
          style={styles.gearButton}
          accessibilityLabel="Open GPS failsafe settings"
          accessibilityRole="button"
        >
          <Text style={styles.gearIcon}>⚙️</Text>
        </TouchableOpacity>
        <Text style={styles.expandIcon}>⛶</Text>
        <VoiceSettingsModal visible={showVoiceModal} onClose={() => setShowVoiceModal(false)} />
        <FailsafeModeSelector
          visible={showFailsafeModeSelector}
          currentMode={gpsFailsafeMode}
          onModeChange={setGpsFailsafeMode}
          onClose={() => setShowFailsafeModeSelector(false)}
          disabled={telemetry.mission.status !== 'IDLE'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.headerBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 36,
    height: 36,
    backgroundColor: '#1a5d99',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  brandingSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#88b4ff',
    fontSize: 12,
    marginLeft: 10,
  },
  menuItems: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'center',
  },
  menuText: {
    color: '#c6d7ff',
    marginHorizontal: 16,
    fontSize: 14,
  },
  active: {
    color: '#fff',
    fontWeight: '600',
    backgroundColor: '#1a75d2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#059669',
    marginRight: 4,
    minWidth: 85,
  },
  voiceIcon: {
    fontSize: 18,
    marginRight: 6,
    color: '#ffffff'
  },
  voiceText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#991B1B',
    marginRight: 4,
    minWidth: 90,
  },
  emergencyIcon: {
    fontSize: 16,
    marginRight: 6,
    color: '#ffffff'
  },
  emergencyText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  releaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#166534',
    marginRight: 4,
    minWidth: 90,
  },
  releaseIcon: {
    fontSize: 16,
    marginRight: 6,
    color: '#ffffff'
  },
  releaseText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  gearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a75d2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#059669',
  },
  gearIcon: {
    fontSize: 18,
    color: '#ffffff'
  },
  modeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d2740',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1a75d2',
  },
  modeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  modeIconMdi: {
    marginRight: 6,
  },
  modeLabel: {
    color: '#88b4ff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modeValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d2740',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fbbf24',
    marginRight: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusHost: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    maxWidth: 140,
    fontFamily: 'monospace',
  },
  reconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  reconnectIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  reconnectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  expandIcon: {
    color: '#c6d7ff',
    fontSize: 18,
  },
});
