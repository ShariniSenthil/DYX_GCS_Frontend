import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { useRover } from '../../context/RoverContext';

interface ManualControlPanelProps {
  onExitManualMode?: () => void;
}

export const ManualControlPanel: React.FC<ManualControlPanelProps> = ({
  onExitManualMode,
}) => {
  const { telemetry, connectionState, services, socket } = useRover();
  const isConnected = connectionState === 'connected';

  const [leftThrottle, setLeftThrottle] = useState(0);
  const [rightThrottle, setRightThrottle] = useState(0);
  const [isManualModeActive, setIsManualModeActive] = useState(false);
  const [isEmergencyStopped, setIsEmergencyStopped] = useState(false);

  // Refs for simultaneous joystick control
  const leftThrottleRef = useRef(0);
  const rightThrottleRef = useRef(0);

  // Refs for throttling socket emissions
  const lastEmitTime = useRef(0);
  const emitInterval = 50; // 50ms = 20Hz
  const lastWarnTime = useRef(0);

  // Track joystick positions and touch IDs for multi-touch coordination
  const leftJoystickRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rightJoystickRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Track active touches for each joystick
  const leftTouchId = useRef<number | null>(null);
  const rightTouchId = useRef<number | null>(null);
  const leftStartY = useRef(0);
  const rightStartY = useRef(0);

  // Animated values for joystick knob positions
  const leftKnobY = useSharedValue(0);
  const rightKnobY = useSharedValue(0);

  // Refs for joystick view elements
  const leftViewRef = useRef<View>(null);
  const rightViewRef = useRef<View>(null);

  /**
   * Send manual control commands via Socket.IO
   */
  const sendManualControl = useCallback(() => {
    const now = Date.now();

    // Skip if socket not connected; log at most once every 2s to avoid spam
    if (!isConnected || !socket?.connected) {
      if (now - lastWarnTime.current > 2000) {
        console.warn('[ManualControl] Socket not connected');
        lastWarnTime.current = now;
      }
      return;
    }

    // Throttle emissions to prevent flooding
    if (now - lastEmitTime.current < emitInterval) {
      return;
    }
    
    lastEmitTime.current = now;
    
    // NRP_ROS LEGACY DISABLED — socket.emit('manual_control', PWM payload)
    // Use joystickLeaseService / useJoystickLease (4WD_SERVER) instead.
    console.warn('[ManualControl] NRP_ROS manual_control disabled — wire useJoystickLease');
  }, [isConnected, socket]);

  /**
   * Unified multi-touch handler - determines which joystick a touch belongs to
   */
  const handleTouchStart = useCallback((event: any) => {
    if (isEmergencyStopped) return;

    const touches = event.nativeEvent.touches;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const touchX = touch.pageX;
      const touchY = touch.pageY;

      // Check if touch is on left joystick
      if (leftJoystickRef.current) {
        const left = leftJoystickRef.current;
        if (
          touchX >= left.x &&
          touchX <= left.x + left.width &&
          touchY >= left.y &&
          touchY <= left.y + left.height &&
          leftTouchId.current === null
        ) {
          leftTouchId.current = touch.identifier;
          leftStartY.current = touch.pageY - left.y;
          continue;
        }
      }

      // Check if touch is on right joystick
      if (rightJoystickRef.current) {
        const right = rightJoystickRef.current;
        if (
          touchX >= right.x &&
          touchX <= right.x + right.width &&
          touchY >= right.y &&
          touchY <= right.y + right.height &&
          rightTouchId.current === null
        ) {
          rightTouchId.current = touch.identifier;
          rightStartY.current = touch.pageY - right.y;
        }
      }
    }
  }, [isEmergencyStopped]);

  /**
   * Handle touch movement for both joysticks
   */
  const handleTouchMove = useCallback((event: any) => {
    if (isEmergencyStopped) return;

    const touches = event.nativeEvent.touches;
    let leftUpdated = false;
    let rightUpdated = false;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];

      // Handle left joystick
      if (touch.identifier === leftTouchId.current && leftJoystickRef.current) {
        const dy = (touch.pageY - leftJoystickRef.current.y) - leftStartY.current;
        const maxMovement = (leftJoystickRef.current.height / 2) * 0.7;
        const clampedY = Math.max(-maxMovement, Math.min(maxMovement, dy));
        const normalized = -clampedY / maxMovement;
        const deadzone = 0.1;
        const value = Math.abs(normalized) < deadzone ? 0 : Math.max(-1, Math.min(1, normalized));

        leftThrottleRef.current = value;
        leftKnobY.value = clampedY;
        leftUpdated = true;
      }

      // Handle right joystick
      if (touch.identifier === rightTouchId.current && rightJoystickRef.current) {
        const dy = (touch.pageY - rightJoystickRef.current.y) - rightStartY.current;
        const maxMovement = (rightJoystickRef.current.height / 2) * 0.7;
        const clampedY = Math.max(-maxMovement, Math.min(maxMovement, dy));
        const normalized = -clampedY / maxMovement;
        const deadzone = 0.1;
        const value = Math.abs(normalized) < deadzone ? 0 : Math.max(-1, Math.min(1, normalized));

        rightThrottleRef.current = value;
        rightKnobY.value = clampedY;
        rightUpdated = true;
      }
    }

    // Batch state updates
    if (leftUpdated || rightUpdated) {
      if (leftUpdated) setLeftThrottle(leftThrottleRef.current);
      if (rightUpdated) setRightThrottle(rightThrottleRef.current);
      sendManualControl();
    }
  }, [isEmergencyStopped, sendManualControl, leftKnobY, rightKnobY]);

  /**
   * Handle touch end for both joysticks
   */
  const handleTouchEnd = useCallback((event: any) => {
    const changedTouches = event.nativeEvent.changedTouches;
    let leftReleased = false;
    let rightReleased = false;

    for (let i = 0; i < changedTouches.length; i++) {
      const touch = changedTouches[i];

      if (touch.identifier === leftTouchId.current) {
        leftTouchId.current = null;
        leftThrottleRef.current = 0;
        leftKnobY.value = withSpring(0, { damping: 15, stiffness: 150 });
        leftReleased = true;
      }

      if (touch.identifier === rightTouchId.current) {
        rightTouchId.current = null;
        rightThrottleRef.current = 0;
        rightKnobY.value = withSpring(0, { damping: 15, stiffness: 150 });
        rightReleased = true;
      }
    }

    // Batch state updates
    if (leftReleased || rightReleased) {
      if (leftReleased) setLeftThrottle(0);
      if (rightReleased) setRightThrottle(0);
      sendManualControl();
    }
  }, [sendManualControl, leftKnobY, rightKnobY]);

  /**
   * Activate manual mode - switch rover to MANUAL mode
   */
  const activateManualMode = useCallback(async () => {
    try {
      await services.setMode('MANUAL');
      setIsManualModeActive(true);
      Alert.alert('Manual Mode Active', 'Rover switched to MANUAL mode. You can now control the rover.');
    } catch (error) {
      Alert.alert('Error', 'Failed to switch to MANUAL mode');
      console.error('[ManualControl] Failed to activate manual mode:', error);
    }
  }, [services]);

  /**
   * Emergency stop - immediately stop both throttles and call PX4 e-stop.
   */
  const emergencyStop = useCallback(async () => {
    leftThrottleRef.current = 0;
    rightThrottleRef.current = 0;
    setIsEmergencyStopped(true);
    setLeftThrottle(0);
    setRightThrottle(0);
    
    // Send zero throttle command
    sendManualControl();
    
    try {
      await services.emergencyStop();
      Alert.alert('EMERGENCY STOP', 'PX4 emergency stop sent.');
    } catch (error) {
      Alert.alert('Error', 'Failed to send PX4 emergency stop');
      console.error('[ManualControl] Emergency stop failed:', error);
    }
  }, [services, sendManualControl]);

  /**
   * Reset emergency stop state
   */
  const resetEmergencyStop = useCallback(() => {
    Alert.alert(
      'Resume Manual Control',
      'Are you sure you want to resume manual control?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: () => {
            setIsEmergencyStopped(false);
            activateManualMode();
          },
        },
      ]
    );
  }, [activateManualMode]);

  /**
   * Exit manual mode and return to mission modes
   */
  const exitManualMode = useCallback(() => {
    Alert.alert(
      'Exit Manual Control',
      'This will stop manual control and return to mission modes. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          onPress: async () => {
            // Send zero throttle
            leftThrottleRef.current = 0;
            rightThrottleRef.current = 0;
            setLeftThrottle(0);
            setRightThrottle(0);
            sendManualControl();
            
            // Wait briefly for zero command to send
            await new Promise(resolve => setTimeout(resolve, 200));
            
            setIsManualModeActive(false);
            onExitManualMode?.();
          },
        },
      ]
    );
  }, [sendManualControl, onExitManualMode]);

  /**
   * Measure joystick positions after mount
   */
  useEffect(() => {
    const measureJoysticks = () => {
      setTimeout(() => {
        leftViewRef.current?.measureInWindow((x, y, width, height) => {
          leftJoystickRef.current = { x, y, width, height };
        });
        rightViewRef.current?.measureInWindow((x, y, width, height) => {
          rightJoystickRef.current = { x, y, width, height };
        });
      }, 100);
    };

    measureJoysticks();
  }, [isManualModeActive]);

  /**
   * Auto-center joysticks when disconnected
   */
  useEffect(() => {
    if (!isConnected) {
      setLeftThrottle(0);
      setRightThrottle(0);
      setIsManualModeActive(false);
    }
  }, [isConnected]);

  /**
   * Convert throttle value to percentage string
   */
  const toPercent = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  /**
   * Get throttle bar color based on value
   */
  const getThrottleColor = (value: number) => {
    if (value > 0) return '#10B981'; // Green for forward
    if (value < 0) return '#EF4444'; // Red for reverse
    return '#64748B'; // Gray for neutral
  };

  /**
   * Animated styles for joystick knobs
   */
  const leftKnobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: leftKnobY.value }],
  }));

  const rightKnobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rightKnobY.value }],
  }));

  /**
   * Render a single joystick visual
   */
  const renderJoystick = (
    label: string,
    knobStyle: any,
    joystickRef: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>,
    viewRef: React.RefObject<View | null>
  ) => {
    const radius = 126;
    const knobRadius = radius * 0.3;
    const containerSize = radius * 2;
    const deadzone = 0.1;

    return (
      <View
        ref={viewRef}
        style={[joystickStyles.container, { width: containerSize, height: containerSize }]}
        collapsable={false}
      >
        <Svg width={containerSize} height={containerSize} style={joystickStyles.svg}>
          <Defs>
            <RadialGradient id={`boundaryGradient-${label}`} cx="50%" cy="50%">
              <Stop offset="0%" stopColor="rgba(103, 232, 249, 0.1)" />
              <Stop offset="70%" stopColor="rgba(6, 182, 212, 0.2)" />
              <Stop offset="100%" stopColor="rgba(6, 182, 212, 0.4)" />
            </RadialGradient>
          </Defs>

          <Circle
            cx={radius}
            cy={radius}
            r={radius - 2}
            fill={`url(#boundaryGradient-${label})`}
            stroke="#06B6D4"
            strokeWidth={2}
            opacity={0.8}
          />

          <Circle
            cx={radius}
            cy={radius}
            r={deadzone * (radius - knobRadius - 5)}
            fill="none"
            stroke="rgba(103, 232, 249, 0.3)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </Svg>

        <Animated.View
          pointerEvents="none"
          style={[
            joystickStyles.knob,
            {
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: knobRadius,
            },
            knobStyle,
          ]}
        >
          <View style={joystickStyles.knobInner} />
        </Animated.View>

        <View style={joystickStyles.labelContainer} pointerEvents="none">
          <Text style={joystickStyles.label}>{label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Status Header */}
      <View style={styles.statusHeader}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Mode:</Text>
          <Text style={[styles.statusValue, isManualModeActive && styles.modeActive]}>
            {isManualModeActive ? 'MANUAL' : telemetry.state?.mode || 'UNKNOWN'}
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Battery:</Text>
          <Text style={styles.statusValue}>{telemetry.battery?.voltage?.toFixed(1) || '--'}V</Text>
        </View>
      </View>

      {/* Activation Button */}
      {!isManualModeActive && !isEmergencyStopped && (
        <TouchableOpacity 
          style={[styles.activateButton, !isConnected && styles.disabledButton]}
          onPress={activateManualMode}
          disabled={!isConnected}
        >
          <Text style={styles.activateButtonText}>🎮 ACTIVATE MANUAL CONTROL</Text>
        </TouchableOpacity>
      )}

      {/* Emergency Stop Warning */}
      {isEmergencyStopped && (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyText}>⚠️ EMERGENCY STOPPED</Text>
          <TouchableOpacity style={styles.resumeButton} onPress={resetEmergencyStop}>
            <Text style={styles.resumeButtonText}>Resume Control</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Control Buttons (moved upward) */}
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.emergencyButton, !isManualModeActive && styles.disabledButton]}
          onPress={emergencyStop}
          disabled={!isManualModeActive}
        >
          <Text style={styles.emergencyButtonText}>🛑 EMERGENCY STOP</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.exitButton}
          onPress={exitManualMode}
        >
          <Text style={styles.exitButtonText}>← Return to Auto</Text>
        </TouchableOpacity>
      </View>

      {/* Spacer pushes joysticks to bottom */}
      <View style={{ flex: 1 }} />

      {/* Dual Joystick Controls with unified multi-touch handler */}
      <View
        style={styles.joystickContainer}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        collapsable={false}
      >
        {/* Left Joystick */}
        <View style={[styles.joystickSection, styles.joystickLeft]} collapsable={false}>
          <Text style={styles.joystickLabel}>LEFT THROTTLE</Text>
          {renderJoystick('L', leftKnobStyle, leftJoystickRef, leftViewRef)}
        </View>

        {/* Left Throttle Bar */}
        <View style={styles.sideBar}>
          <Text style={styles.centerBarLabel}>L</Text>
          <View style={styles.throttleBarOverlay}>
            <View
              style={[
                styles.throttleBarOverlayFill,
                {
                  height: `${Math.abs(leftThrottle) * 100}%`,
                  backgroundColor: getThrottleColor(leftThrottle),
                },
              ]}
            />
          </View>
          <Text style={styles.throttleValue}>{toPercent(leftThrottle)}</Text>
        </View>

        {/* Spacer between bars */}
        <View style={{ flex: 0.85 }} />

        {/* Right Throttle Bar */}
        <View style={styles.sideBar}>
          <Text style={styles.centerBarLabel}>R</Text>
          <View style={styles.throttleBarOverlay}>
            <View
              style={[
                styles.throttleBarOverlayFill,
                {
                  height: `${Math.abs(rightThrottle) * 100}%`,
                  backgroundColor: getThrottleColor(rightThrottle),
                },
              ]}
            />
          </View>
          <Text style={styles.throttleValue}>{toPercent(rightThrottle)}</Text>
        </View>

        {/* Right Joystick */}
        <View style={[styles.joystickSection, styles.joystickRight]} collapsable={false}>
          <Text style={styles.joystickLabel}>RIGHT THROTTLE</Text>
          {renderJoystick('R', rightKnobStyle, rightJoystickRef, rightViewRef)}
        </View>
      </View>

      {/* Help Text */}
      <Text style={styles.helpText}>
        Tank-style control: Move joysticks up/down independently for left/right throttle
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.panelBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  statusHeader: {
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  statusValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  modeActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  activateButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#475569',
    opacity: 0.5,
  },
  activateButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  emergencyBanner: {
    backgroundColor: '#991B1B',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },
  emergencyText: {
    color: '#FECACA',
    fontWeight: '700',
    fontSize: 14,
  },
  resumeButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  resumeButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  joystickContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 24,
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    marginTop: 8,
  },
  joystickSection: {
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  joystickLeft: {
    alignItems: 'center',
  },
  joystickRight: {
    alignItems: 'center',
  },
  sideBar: {
    alignItems: 'center',
    gap: 3,
  },
  joystickLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  throttleValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  throttleOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -15 }, { translateY: -50 }],
    width: 30,
    height: 100,
    alignItems: 'center',
    gap: 3,
  },
  throttleBarOverlay: {
    width: 30,
    height: 80,
    backgroundColor: 'rgba(100, 116, 139, 0.25)',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
  },
  throttleBarOverlayFill: {
    width: '100%',
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emergencyButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  emergencyButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  exitButton: {
    flex: 1,
    backgroundColor: colors.inputBg,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  exitButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  helpText: {
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  centerBarLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

const joystickStyles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00F2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  knobInner: {
    width: '60%',
    height: '60%',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  labelContainer: {
    position: 'absolute',
    bottom: -25,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
