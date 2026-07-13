import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../../theme/colors';

interface FailsafeStrictPopupProps {
  visible: boolean;
  wpDistCm: number;      // Distance to waypoint in cm (replaces accuracyError)
  thresholdCm: number;   // Threshold in cm (6.0 cm for servo suppression)
  onAcknowledge: () => void;
  onResume: () => void;
  onRestart: () => void;
  onStop: () => void;
}

export const FailsafeStrictPopup: React.FC<FailsafeStrictPopupProps> = ({
  visible,
  wpDistCm,
  thresholdCm,
  onAcknowledge,
  onResume,
  onRestart,
  onStop,
}: FailsafeStrictPopupProps) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (visible && !acknowledged) {
      // Pulse animation for alert
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [visible, acknowledged, pulseAnim]);

  useEffect(() => {
    if (visible && acknowledged && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, acknowledged, countdown]);

  useEffect(() => {
    if (!visible) {
      setAcknowledged(false);
      setCountdown(5);
    }
  }, [visible]);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    onAcknowledge();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {!acknowledged ? (
            <>
              <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.icon}>⚠️</Text>
              </Animated.View>
              <Text style={styles.title}>GPS Failsafe Triggered</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>WP Distance:</Text>
                <Text style={styles.infoValue}>{wpDistCm.toFixed(1)} cm</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Threshold:</Text>
                <Text style={styles.infoValue}>{thresholdCm.toFixed(1)} cm</Text>
              </View>
              <Text style={styles.message}>
                Waypoint distance has exceeded the safe threshold. Mission has been paused. Please acknowledge to
                continue.
              </Text>
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleAcknowledge}>
                <Text style={styles.buttonPrimaryText}>Acknowledge</Text>
              </TouchableOpacity>
            </>
          ) : countdown > 0 ? (
            <>
              <Text style={styles.icon}>⏳</Text>
              <Text style={styles.title}>Waiting for Stable GPS</Text>
              <Text style={styles.countdown}>{countdown}</Text>
              <Text style={styles.message}>Monitoring GPS stability before resuming operations...</Text>
            </>
          ) : (
            <>
              <Text style={styles.icon}>✅</Text>
              <Text style={styles.title}>GPS Stable - Choose Action</Text>
              <Text style={styles.message}>GPS has stabilized. Select an action to continue:</Text>
              <TouchableOpacity style={styles.buttonSuccess} onPress={onResume}>
                <Text style={styles.buttonSuccessText}>Resume Mission</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonWarning} onPress={onRestart}>
                <Text style={styles.buttonWarningText}>Restart from Waypoint 1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonDanger} onPress={onStop}>
                <Text style={styles.buttonDangerText}>Stop Mission</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 420,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  iconContainer: {
    marginBottom: 16,
  },
  icon: {
    fontSize: 56,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.panelBg,
    borderRadius: 8,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 20,
  },
  countdown: {
    fontSize: 56,
    fontWeight: 'bold',
    color: colors.primary,
    marginVertical: 16,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    marginTop: 8,
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonSuccess: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    marginBottom: 10,
  },
  buttonSuccessText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonWarning: {
    backgroundColor: '#FFA500',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    marginBottom: 10,
  },
  buttonWarningText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
  },
  buttonDangerText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
