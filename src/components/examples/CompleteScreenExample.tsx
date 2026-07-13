/**
 * Example: Screen with Full Readiness Integration
 * 
 * This example shows a complete screen with:
 * - Screen initialization tracking
 * - Multiple component dependencies
 * - Action guards on buttons
 * - Error handling
 */

import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useScreenReadiness, useActionGuard } from '../../hooks/useComponentReadiness';
import { colors } from '../../theme/colors';

// Mock services
const mockLoadWaypoints = () => new Promise(resolve => setTimeout(resolve, 500));
const mockConnectTelemetry = () => new Promise(resolve => setTimeout(resolve, 300));
const mockInitializeMap = () => new Promise(resolve => setTimeout(resolve, 400));
const mockStartMission = () => new Promise(resolve => setTimeout(resolve, 1000));

export function CompleteScreenExample() {
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [telemetryConnected, setTelemetryConnected] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Track screen readiness with multi-step initialization
  const { isReady: screenReady, error: screenError } = useScreenReadiness(
    'example-screen',
    'Example Screen',
    async (setProgress) => {
      try {
        // Step 1: Load waypoints
        setProgress(25, 'Loading waypoints...');
        await mockLoadWaypoints();
        setWaypoints([
          { id: 1, lat: 37.7749, lng: -122.4194 },
          { id: 2, lat: 37.7849, lng: -122.4094 },
        ]);
        
        // Step 2: Connect telemetry
        setProgress(50, 'Connecting telemetry...');
        await mockConnectTelemetry();
        setTelemetryConnected(true);
        
        // Step 3: Initialize map
        setProgress(75, 'Initializing map...');
        await mockInitializeMap();
        setMapReady(true);
        
        // All done - setReady() called automatically
      } catch (error) {
        throw new Error(`Initialization failed: ${error}`);
      }
    },
    true, // critical
    [] // no dependencies - runs once
  );

  // Guard actions to prevent execution during initialization
  const { isReady: controlReady, preventAction } = useActionGuard('example-screen');

  const handleStartMission = preventAction(async () => {
    try {
      await mockStartMission();
      Alert.alert('Success', 'Mission started successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to start mission');
    }
  }, 'Cannot start mission - system is still initializing');

  const handleLoadNewMission = preventAction(async () => {
    Alert.alert('Info', 'Loading new mission...');
  }, 'Please wait for current initialization to complete');

  // Show error state
  if (screenError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>❌ {screenError}</Text>
        <Button title="Retry" onPress={() => {
          // Trigger re-initialization
          window.location.reload();
        }} />
      </View>
    );
  }

  // Show loading state
  if (!screenReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Initializing screen...</Text>
        <Text style={styles.subText}>Please wait while we set everything up</Text>
      </View>
    );
  }

  // Show ready state
  return (
    <View style={styles.container}>
      <Text style={styles.title}>✅ Example Screen Ready</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>
          Waypoints: {waypoints.length} loaded
        </Text>
        <Text style={styles.statusLabel}>
          Telemetry: {telemetryConnected ? '✅ Connected' : '❌ Disconnected'}
        </Text>
        <Text style={styles.statusLabel}>
          Map: {mapReady ? '✅ Ready' : '⏳ Loading'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Start Mission"
          onPress={handleStartMission}
          disabled={!controlReady}
          color={colors.success}
        />
        
        <View style={{ height: 10 }} />
        
        <Button
          title="Load New Mission"
          onPress={handleLoadNewMission}
          disabled={!controlReady}
          color={colors.info}
        />
      </View>

      <Text style={styles.infoText}>
        {controlReady 
          ? '✅ All systems operational - you can perform actions'
          : '⏳ Please wait - system is initializing...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 20,
  },
  subText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 10,
  },
  errorText: {
    fontSize: 16,
    color: colors.danger,
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    width: '100%',
  },
  statusLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
