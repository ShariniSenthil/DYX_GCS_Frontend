/**
 * TelemetryDisplay Component
 * 
 * Displays live telemetry data from the rover
 * Shows connection status, position, battery, RTK, and mission info
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRover } from '../context/RoverContext';

const TelemetryDisplay: React.FC = () => {
  const { telemetry, connectionState, roverPosition } = useRover();

  // Memoize status calculations
  const statusInfo = useMemo(
    () => ({
      isConnected: connectionState === 'connected',
      isConnecting: connectionState === 'connecting',
      isError: connectionState === 'error',
      connectionText: connectionState.toUpperCase(),
      armStatus: telemetry.state.armed ? 'ARMED' : 'DISARMED',
      armColor: telemetry.state.armed ? '#00FF00' : '#FF0000',
      fixTypeText: getFixTypeLabel(telemetry.rtk.fix_type),
      missionProgress:
        telemetry.mission.total_wp > 0
          ? `${telemetry.mission.current_wp}/${telemetry.mission.total_wp}`
          : 'N/A',
    }),
    [telemetry, connectionState],
  );

  const onRefresh = React.useCallback(() => {
    // Telemetry updates automatically, this is just for visual feedback
    setTimeout(() => {
      // Trigger re-render
    }, 1000);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
    >
      {/* Header: Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONNECTION STATUS</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: statusInfo.isConnected
                  ? '#00FF00'
                  : statusInfo.isConnecting
                    ? '#FFAA00'
                    : '#FF0000',
              },
            ]}
          />
          <Text style={styles.statusText}>{statusInfo.connectionText}</Text>
          {statusInfo.isConnecting && <ActivityIndicator color="#FFAA00" size="small" />}
        </View>
        {roverPosition && (
          <Text style={styles.detailText}>
            Last Update: {new Date(roverPosition.timestamp).toLocaleTimeString()}
          </Text>
        )}
      </View>

      {/* Vehicle State */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ROBOT STATE</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, { color: statusInfo.armColor }]}>{statusInfo.armStatus}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Mode:</Text>
          <Text style={styles.value}>{telemetry.state.mode}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>System Status:</Text>
          <Text style={styles.value}>{telemetry.state.system_status}</Text>
        </View>
      </View>

      {/* Position & Altitude */}
      {roverPosition ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POSITION</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Latitude:</Text>
            <Text style={styles.value}>{roverPosition.lat.toFixed(7)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Longitude:</Text>
            <Text style={styles.value}>{roverPosition.lng.toFixed(7)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Altitude (Rel):</Text>
            <Text style={styles.value}>{telemetry.global.alt_rel.toFixed(2)} m</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ground Speed:</Text>
            <Text style={styles.value}>{telemetry.global.vel.toFixed(2)} m/s</Text>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POSITION</Text>
          <Text style={styles.detailText}>No position data available</Text>
        </View>
      )}

      {/* Battery */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>BATTERY</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Percentage:</Text>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Text
              style={[
                styles.value,
                {
                  color: telemetry.battery?.percentage > 30 ? '#00FF00' : '#FF0000',
                  flex: 0,
                },
              ]}
            >
              {(telemetry.battery?.percentage ?? 0).toFixed(1)} %
            </Text>
            <Text style={styles.voltageInline}>  {(telemetry.battery?.voltage ?? 0).toFixed(2)} V</Text>
          </View>
        </View>
        {/* Voltage shown inline with percentage above */}
        <View style={styles.row}>
          <Text style={styles.label}>Current:</Text>
          <Text style={styles.value}>{(telemetry.battery?.current ?? 0).toFixed(2)} A</Text>
        </View>
      </View>

      {/* RTK / GPS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GPS / RTK</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Fix Type:</Text>
          <Text style={styles.value}>{statusInfo.fixTypeText}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Satellites:</Text>
          <Text style={styles.value}>{telemetry.global.satellites_visible}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Base Linked:</Text>
          <Text style={[styles.value, { color: telemetry.rtk.base_linked ? '#00FF00' : '#FF0000' }]}>
            {telemetry.rtk.base_linked ? 'YES' : 'NO'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Baseline Age:</Text>
          <Text style={styles.value}>{telemetry.rtk.baseline_age} ms</Text>
        </View>
        {telemetry.hrms > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>HRMS:</Text>
            <Text style={styles.value}>{telemetry.hrms.toFixed(3)} m</Text>
          </View>
        )}
        {telemetry.vrms > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>VRMS:</Text>
            <Text style={styles.value}>{telemetry.vrms.toFixed(3)} m</Text>
          </View>
        )}
      </View>

      {/* Mission */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MISSION</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Progress:</Text>
          <Text style={styles.value}>{statusInfo.missionProgress}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>{telemetry.mission.status}</Text>
        </View>
        {telemetry.mission.total_wp > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Progress %:</Text>
            <Text style={styles.value}>{telemetry.mission.progress_pct.toFixed(1)} %</Text>
          </View>
        )}
      </View>

      {/* Network */}
      {telemetry.network.connection_type !== 'none' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NETWORK</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Connection Type:</Text>
            <Text style={styles.value}>{telemetry.network.connection_type}</Text>
          </View>
          {telemetry.network.wifi_connected && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>WiFi RSSI:</Text>
                <Text style={styles.value}>{telemetry.network.wifi_rssi} dBm</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Signal Strength:</Text>
                <Text style={styles.value}>{telemetry.network.wifi_signal_strength} %</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* IMU Status */}
      {telemetry.imu_status && telemetry.imu_status !== 'UNKNOWN' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>IMU</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text
              style={[
                styles.value,
                {
                  color: telemetry.imu_status === 'ALIGNED' ? '#00FF00' : '#FFAA00',
                },
              ]}
            >
              {telemetry.imu_status}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

/**
 * Helper: Get RTK fix type label
 */
function getFixTypeLabel(fixType: number): string {
  const labels: { [key: number]: string } = {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001F3F',
    paddingVertical: 8,
  },
  section: {
    backgroundColor: '#002244',
    marginHorizontal: 8,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#00FFFF',
  },
  sectionTitle: {
    color: '#00FFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    color: '#88CCFF',
    fontSize: 13,
    flex: 1,
  },
  value: {
    color: '#00FF00',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'right',
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#00FFFF',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  detailText: {
    color: '#88CCFF',
    fontSize: 12,
    marginTop: 4,
  },
  voltageInline: {
    color: '#88CCFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default TelemetryDisplay;
