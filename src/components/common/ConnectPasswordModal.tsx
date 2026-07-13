/**
 * ConnectPasswordModal — draggable operator password entry when connecting to a rover.
 * Drag the header grip to reposition when the keyboard covers the card.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const CARD_MAX_WIDTH = 440;
const SCREEN_PADDING = 20;
const INITIAL_TOP_RATIO = 0.18;

export interface ConnectPasswordModalProps {
  visible: boolean;
  roverName: string;
  roverId?: string;
  host: string;
  accentColor?: string;
  isConnecting: boolean;
  error: string | null;
  onClose: () => void;
  onConnect: (password: string) => void;
}

export default function ConnectPasswordModal({
  visible,
  roverName,
  roverId,
  host,
  accentColor = '#4ade80',
  isConnecting,
  error,
  onClose,
  onConnect,
}: ConnectPasswordModalProps): React.ReactElement {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cardHeightRef = useRef(400);

  const cardWidth = Math.min(CARD_MAX_WIDTH, screenWidth - SCREEN_PADDING * 2);
  const initialLeft = (screenWidth - cardWidth) / 2;
  const initialTop = Math.max(SCREEN_PADDING, screenHeight * INITIAL_TOP_RATIO);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const dragBounds = useSharedValue({
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  });

  const updateDragBounds = useCallback(
    (cardHeight: number) => {
      dragBounds.value = {
        minX: SCREEN_PADDING - initialLeft,
        maxX: screenWidth - cardWidth - initialLeft - SCREEN_PADDING,
        minY: SCREEN_PADDING - initialTop,
        maxY: screenHeight - cardHeight - initialTop - SCREEN_PADDING,
      };
    },
    [screenWidth, screenHeight, cardWidth, initialLeft, initialTop, dragBounds],
  );

  useEffect(() => {
    updateDragBounds(400);
  }, [updateDragBounds]);

  const nudgeAboveKeyboard = useCallback(
    (keyboardHeight: number) => {
      const b = dragBounds.value;
      const bottom = initialTop + translateY.value + cardHeightRef.current;
      const safeBottom = screenHeight - keyboardHeight - SCREEN_PADDING;
      if (bottom > safeBottom) {
        const delta = bottom - safeBottom;
        const nextY = Math.min(Math.max(translateY.value - delta, b.minY), b.maxY);
        translateY.value = withSpring(nextY, { damping: 18, stiffness: 220 });
      }
    },
    [screenHeight, initialTop, dragBounds, translateY],
  );

  const resetPosition = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    panStartX.value = 0;
    panStartY.value = 0;
  }, [translateX, translateY, panStartX, panStartY]);

  const shake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(8, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [shakeX]);

  useEffect(() => {
    if (visible) {
      setPassword('');
      setShowPassword(false);
      resetPosition();
      scale.value = withSpring(1, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 180 });
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 320);
      return () => clearTimeout(focusTimer);
    }

    scale.value = 0.92;
    opacity.value = 0;
    return undefined;
  }, [visible, resetPosition, scale, opacity]);

  useEffect(() => {
    if (error) shake();
  }, [error, shake]);

  useEffect(() => {
    if (!visible) return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      nudgeAboveKeyboard(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      // Keep user-chosen position after keyboard dismisses
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, nudgeAboveKeyboard]);

  const panGesture = Gesture.Pan()
    .enabled(!isConnecting)
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
      dragScale.value = withSpring(1.02, { damping: 16, stiffness: 260 });
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      translateX.value = panStartX.value + e.translationX;
      translateY.value = panStartY.value + e.translationY;
    })
    .onEnd(() => {
      const b = dragBounds.value;
      translateX.value = withSpring(
        Math.min(Math.max(translateX.value, b.minX), b.maxX),
        { damping: 18, stiffness: 220 },
      );
      translateY.value = withSpring(
        Math.min(Math.max(translateY.value, b.minY), b.maxY),
        { damping: 18, stiffness: 220 },
      );
      dragScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      runOnJS(setIsDragging)(false);
    })
    .onFinalize(() => {
      dragScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      runOnJS(setIsDragging)(false);
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value + shakeX.value },
      { translateY: translateY.value },
      { scale: scale.value * dragScale.value },
    ],
  }));

  const handleConnect = () => {
    if (!password.trim()) {
      shake();
      return;
    }
    onConnect(password);
  };

  const handleClose = () => {
    if (isConnecting) return;
    Keyboard.dismiss();
    setPassword('');
    setShowPassword(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={handleClose} disabled={isConnecting} />

          <Animated.View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              cardHeightRef.current = h;
              updateDragBounds(h);
            }}
            style={[
              styles.card,
              {
                width: cardWidth,
                left: initialLeft,
                top: initialTop,
                borderColor: accentColor + '33',
                shadowOpacity: isDragging ? 0.45 : 0.28,
              },
              cardAnimatedStyle,
            ]}
          >
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

            <GestureDetector gesture={panGesture}>
              <Animated.View style={[styles.dragHandle, { borderColor: accentColor + '22' }]}>
                <Ionicons name="reorder-three" size={22} color="rgba(255,255,255,0.35)" />
              </Animated.View>
            </GestureDetector>

            <View style={styles.headerRow}>
              <View style={[styles.iconWrap, { borderColor: accentColor + '44' }]}>
                <Ionicons name="shield-checkmark" size={22} color={accentColor} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Operator Authentication</Text>
                <Text style={styles.subtitle}>Enter password to connect to this rover</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                disabled={isConnecting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            <View style={[styles.roverPanel, { borderColor: accentColor + '28' }]}>
              <View style={styles.roverPanelRow}>
                <Ionicons name="hardware-chip" size={16} color={accentColor} />
                <Text style={styles.roverName} numberOfLines={1}>{roverName}</Text>
              </View>
              {roverId ? (
                <Text style={styles.roverId} numberOfLines={1}>{roverId}</Text>
              ) : null}
              <View style={styles.hostRow}>
                <Ionicons name="globe-outline" size={12} color={accentColor} />
                <Text style={[styles.hostText, { color: accentColor }]} numberOfLines={1}>
                  {host}
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Enter operator password"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleConnect}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isConnecting}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                disabled={isConnecting}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={handleClose}
                disabled={isConnecting}
                activeOpacity={0.75}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnConnect,
                  { backgroundColor: accentColor },
                  (!password.trim() || isConnecting) && styles.btnConnectDisabled,
                ]}
                onPress={handleConnect}
                disabled={!password.trim() || isConnecting}
                activeOpacity={0.85}
              >
                {isConnecting ? (
                  <ActivityIndicator size="small" color="#0F172A" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={16} color="#0F172A" />
                    <Text style={styles.btnConnectText}>Connect</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  card: {
    position: 'absolute',
    backgroundColor: '#151619',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 14,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  dragHandle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -24,
    marginBottom: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(74,222,128,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    paddingTop: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
  },
  roverPanel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 18,
    gap: 4,
  },
  roverPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roverName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  roverId: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginLeft: 24,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginLeft: 24,
  },
  hostText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    marginBottom: 8,
  },
  inputRowError: {
    borderColor: 'rgba(239,68,68,0.6)',
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#F1F5F9',
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#EF4444',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  btnConnect: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  btnConnectDisabled: {
    opacity: 0.45,
  },
  btnConnectText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
});