/**
 * Example: Telemetry Panel with Readiness Tracking
 * 
 * This example shows how to track real-time data connection status
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useConnectionReadiness } from '../../hooks/useComponentReadiness';
import { colors } from '../../theme/colors';

interface TelemetryPanelProps {
  telemetry: any;
  connectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
}

export function TelemetryPanelExample({ telemetry, connectionState }: TelemetryPanelProps) {
  const [dataReceived, setDataReceived] = useState(false);

  // Track telemetry connection readiness
  useConnectionReadiness(
    'telemetry-stream',
    'Telemetry Stream',
    connectionState === 'connected' && dataReceived,
    connectionState === 'reconnecting',
    true // Critical - mission control needs telemetry
  );

  useEffect(() => {
    if (telemetry && connectionState === 'connected') {
      setDataReceived(true);
    }
  }, [telemetry, connectionState]);

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return colors.success;
      case 'reconnecting': return colors.warning;
      case 'connecting': return colors.info;
      default: return colors.danger;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'connected': return '✅ Connected';
      case 'reconnecting': return '🔄 Reconnecting...';
      case 'connecting': return '⏳ Connecting...';
      default: return '❌ Disconnected';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={[styles.statusText, { color: getConnectionStatusColor() }]}>
          {getConnectionStatusText()}
        </Text>
      </View>

      {telemetry && (
        <View style={styles.dataContainer}>
          <Text style={styles.dataLabel}>Battery: {telemetry.battery?.percentage}%</Text>
          <Text style={styles.dataLabel}>Speed: {telemetry.global?.vel?.toFixed(2)} m/s</Text>
          <Text style={styles.dataLabel}>Satellites: {telemetry.global?.satellites_visible}</Text>
          <Text style={styles.dataLabel}>Mode: {telemetry.state?.mode}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: colors.cardBg,
    borderRadius: 8,
  },
  statusBar: {
    marginBottom: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dataContainer: {
    gap: 5,
  },
  dataLabel: {
    fontSize: 12,
    color: colors.textPrimary,
  },
});
