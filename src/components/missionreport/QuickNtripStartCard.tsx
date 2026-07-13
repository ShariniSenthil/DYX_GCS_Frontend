import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  onPress: () => void;
  onManualPress?: () => void;
  manualLoading?: boolean;
  loading?: boolean;
  connected?: boolean;
}

export const QuickNtripStartCard: React.FC<Props> = ({
  onPress,
  onManualPress,
  manualLoading = false,
  loading = false,
  connected = false,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          connected ? styles.buttonConnected : styles.buttonDisconnected,
          loading && styles.buttonLoading,
        ]}
        onPress={onPress}
        disabled={connected || loading}
        activeOpacity={0.82}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialCommunityIcons name="access-point-network" size={20} color="#ffffff" />
        )}
        <Text style={styles.buttonText}>RTK-GPS</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonManual]}
        onPress={onManualPress}
        disabled={!onManualPress || manualLoading}
        activeOpacity={0.82}
      >
        {manualLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialCommunityIcons name="gamepad-variant" size={20} color="#ffffff" />
        )}
        <Text style={styles.buttonText}>MANUAL</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'column',
    gap: 16,
  },
  button: {
    width: '100%',
    minHeight: 72,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  buttonDisconnected: {
    backgroundColor: '#dc2626',
  },
  buttonConnected: {
    backgroundColor: '#16a34a',
  },
  buttonLoading: {
    opacity: 0.85,
  },
  buttonManual: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
