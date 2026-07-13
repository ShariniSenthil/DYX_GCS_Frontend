import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';

interface FailsafeRelaxNotificationProps {
  visible: boolean;
  accuracyError: number;
  threshold: number;
  onDismiss: () => void;
}

export const FailsafeRelaxNotification: React.FC<FailsafeRelaxNotificationProps> = ({
  visible,
  accuracyError,
  threshold,
  onDismiss,
}: FailsafeRelaxNotificationProps) => {
  const [slideAnim] = useState(new Animated.Value(-100));
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto-dismiss after 2 seconds
      dismissTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, 2000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [visible]);

  const handleDismiss = () => {
    // Slide out
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚠️</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Spray Suppressed</Text>
          <Text style={styles.message}>
            Accuracy: {accuracyError.toFixed(1)}mm (threshold: {threshold}mm)
          </Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#FFA500',
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  message: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.95,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
    lineHeight: 24,
  },
});
