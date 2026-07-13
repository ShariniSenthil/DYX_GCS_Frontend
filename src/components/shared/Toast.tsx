import React, { useEffect, useMemo, useRef } from 'react';
import { Text, StyleSheet, Animated, PanResponder, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/colors';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  visible: boolean;
  type: ToastType;
  title?: string;
  message?: string;
  position?: 'top' | 'bottom' | 'bottom-right';
  style?: any;
  onDismiss?: () => void;
  showCloseButton?: boolean;
}

export const Toast: React.FC<ToastProps> = ({
  visible,
  type,
  title,
  message,
  position = 'bottom',
  style,
  onDismiss,
  showCloseButton = false,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateX.setValue(0);
    }
  }, [translateX, visible]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(onDismiss),
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Boolean(onDismiss) && Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!onDismiss) return;

        if (Math.abs(gestureState.dx) > 64) {
          Animated.timing(translateX, {
            toValue: gestureState.dx > 0 ? 420 : -420,
            duration: 140,
            useNativeDriver: true,
          }).start(onDismiss);
          return;
        }

        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 5,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 5,
        }).start();
      },
    }),
    [onDismiss, translateX],
  );

  if (!visible) return null;

  const positionStyle =
    position === 'top'
      ? { top: 24, left: 16, right: 16 }
      : position === 'bottom-right'
        ? { bottom: 24, right: 16, width: 320 }
        : { bottom: 24, left: 16, right: 16 };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        positionStyle,
        styles[type],
        style,
        { transform: [{ translateX }] },
      ]}
    >
      <View style={styles.content}>
        {title && <Text style={styles.title}>{title}</Text>}
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
      {showCloseButton && onDismiss && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onDismiss}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
        >
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    zIndex: 9999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  content: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  closeButtonText: {
    color: '#E5F1FF',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '600',
  },
  success: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  error: {
    backgroundColor: '#dc2626',
    borderColor: '#991b1b',
  },
  info: {
    backgroundColor: '#0891b2',
    borderColor: '#0e7490',
  },
});
