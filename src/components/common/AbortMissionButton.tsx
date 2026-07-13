/**
 * AbortMissionButton — Hard abort with confirmation dialog.
 *
 * Distinct from emergency stop (which is on the HeaderBar).
 * This issues POST /api/mission/abort which forces MANUAL + disarm.
 * Use when soft stop is not responding.
 */

import React, { useState, useCallback } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { abortMission } from '../../services/missionLifecycleService';
import { MISSION_ABORT_ENABLED } from '../../config/featureFlags';

interface AbortMissionButtonProps {
  onAborted?: () => void;
  disabled?: boolean;
}

export default function AbortMissionButton({
  onAborted,
  disabled,
}: AbortMissionButtonProps): React.ReactElement | null {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!MISSION_ABORT_ENABLED) return null;

  const handleAbort = useCallback(async () => {
    setIsAborting(true);
    setError(null);
    try {
      await abortMission();
      setShowConfirm(false);
      onAborted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abort failed');
    } finally {
      setIsAborting(false);
    }
  }, [onAborted]);

  return (
    <>
      <TouchableOpacity
        style={[styles.btn, disabled && styles.btnDisabled]}
        onPress={() => setShowConfirm(true)}
        disabled={disabled}
        accessibilityLabel="Hard abort mission"
        accessibilityRole="button"
      >
        <Ionicons name="warning" size={14} color="#EF4444" />
        <Text style={styles.btnText}>ABORT</Text>
      </TouchableOpacity>

      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Ionicons name="warning" size={32} color="#EF4444" style={styles.icon} />
            <Text style={styles.title}>Hard Abort Mission?</Text>
            <Text style={styles.body}>
              This will immediately switch to MANUAL mode and disarm the vehicle.
              Use only when soft stop is not responding. The rover will stop in
              place without spray safety procedures.
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowConfirm(false)}
                disabled={isAborting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.abortBtn, isAborting && styles.btnDisabled]}
                onPress={handleAbort}
                disabled={isAborting}
              >
                {isAborting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.abortBtnText}>ABORT NOW</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1C0A0A',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    borderRadius: 4,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#0F1C2E',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  icon: { marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#F1F5F9', marginBottom: 10 },
  body: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  errorText: { fontSize: 12, color: '#EF4444', marginBottom: 10, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  abortBtn: {
    flex: 1,
    paddingVertical: 11,
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    alignItems: 'center',
  },
  abortBtnText: { fontSize: 14, color: '#FFF', fontWeight: '700', letterSpacing: 0.5 },
});
