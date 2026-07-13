/**
 * ArmDisarmToggle — General-purpose arm/disarm toggle button.
 *
 * Uses vehicleControlService with correct PX4 payload `{ arm: boolean }`.
 * Does NOT optimistically set armed state — waits for telemetry confirmation.
 */

import React, { useState, useCallback } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { armVehicle, disarmVehicle } from '../../services/vehicleControlService';

interface ArmDisarmToggleProps {
  /** Current armed state from telemetry (server source of truth). */
  isArmed: boolean;
  disabled?: boolean;
  onSuccess?: (armed: boolean) => void;
  onError?: (err: Error) => void;
  compact?: boolean;
}

export default function ArmDisarmToggle({
  isArmed,
  disabled,
  onSuccess,
  onError,
  compact,
}: ArmDisarmToggleProps): React.ReactElement {
  const [isPending, setIsPending] = useState(false);

  const handlePress = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      if (isArmed) {
        await disarmVehicle();
        onSuccess?.(false);
      } else {
        await armVehicle();
        onSuccess?.(true);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsPending(false);
    }
  }, [isArmed, isPending, onSuccess, onError]);

  const isDisabled = disabled || isPending;
  const color = isArmed ? '#EF4444' : '#4ADE80';
  const label = isArmed ? 'DISARM' : 'ARM';
  const icon: any = isArmed ? 'lock-closed' : 'lock-open';

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactBtn, { borderColor: color }, isDisabled && styles.btnDisabled]}
        onPress={handlePress}
        disabled={isDisabled}
        accessibilityLabel={label}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon} size={14} color={color} />
        )}
        <Text style={[styles.compactText, { color }]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: color }, isDisabled && styles.btnDisabled]}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityLabel={label}
    >
      <View style={[styles.indicator, { backgroundColor: isArmed ? '#7F1D1D' : '#14532D' }]}>
        {isPending ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon} size={16} color={color} />
        )}
      </View>
      <Text style={[styles.label, { color }]}>
        {isPending ? (isArmed ? 'Disarming…' : 'Arming…') : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0F1C2E',
    borderWidth: 1,
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.4 },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#0F1C2E',
    borderWidth: 1,
    borderRadius: 5,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
