/**
 * TelemetryScreen
 * 
 * A screen to display live telemetry from the rover backend
 * Tests the Socket.IO connection and real-time data streaming
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import TelemetryDisplay from '../components/TelemetryDisplay';

const TelemetryScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <TelemetryDisplay />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001F3F',
  },
});

export default TelemetryScreen;
