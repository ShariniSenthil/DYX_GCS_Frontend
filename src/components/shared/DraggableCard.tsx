/**
 * DraggableCard — floating panel wrapper using react-native-reanimated v3 +
 * react-native-gesture-handler Gesture.Pan.
 *
 * handleType:
 *   'horizontal' — built-in top bar with title + optional close button
 *   'vertical'   — built-in left-side strip handle
 *   'custom'     — injects { dragGesture, isDraggingActive } into the child
 *                  so the child's own header wraps <GestureDetector>
 *   'none'       — no handle rendered; card is not draggable
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface DraggableCardProps {
  children: React.ReactNode;
  style?: any;
  handleType?: 'horizontal' | 'vertical' | 'custom' | 'none';
  title?: string;
  onClose?: () => void;
  onLayout?: (event: any) => void;
}

export const DraggableCard: React.FC<DraggableCardProps> = ({
  children,
  style,
  handleType = 'horizontal',
  title = 'Widget',
  onClose,
  onLayout,
}) => {
  const [isDraggingActive, setIsDraggingActive] = useState(false);

  // Accumulated position after each drag — persists between gestures
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  // Live position during a drag gesture
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const dragScale = useSharedValue(1);

  /**
   * Gesture.Pan + activateAfterLongPress(300):
   *   - Long-press for 300 ms unlocks the pan — prevents accidental drags
   *     on a map screen where normal swipes navigate the map.
   *   - Runs on the UI thread via Reanimated (no JS bridge, no useNativeDriver:false).
   *   - onBegin: snapshot current offset into translateX/Y so onUpdate deltas
   *     are relative, preventing position jumps.
   *   - onEnd: persist final position back into offset* shared values.
   */
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onBegin(() => {
      // Snapshot current accumulated position
      translateX.value = offsetX.value;
      translateY.value = offsetY.value;
      dragScale.value = withSpring(1.03, { damping: 16, stiffness: 260 });
      runOnJS(setIsDraggingActive)(true);
    })
    .onUpdate((e) => {
      translateX.value = offsetX.value + e.translationX;
      translateY.value = offsetY.value + e.translationY;
    })
    .onEnd(() => {
      // Persist final position
      offsetX.value = translateX.value;
      offsetY.value = translateY.value;
      dragScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      runOnJS(setIsDraggingActive)(false);
    })
    .onFinalize(() => {
      // Safety: always reset scale even if gesture is cancelled
      dragScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      runOnJS(setIsDraggingActive)(false);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: dragScale.value },
    ],
  }));

  // ── Built-in handle renderers ──────────────────────────────────────────────

  const renderVerticalHandle = () => (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.verticalHandle, isDraggingActive && styles.handleActive]}>
        <MaterialCommunityIcons
          name="drag-vertical"
          size={16}
          color={isDraggingActive ? '#67E8F9' : 'rgba(103,232,249,0.4)'}
        />
      </View>
    </GestureDetector>
  );

  const renderHorizontalHandle = () => (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.horizontalHandle, isDraggingActive && styles.handleActive]}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="drag-horizontal"
            size={14}
            color={isDraggingActive ? '#67E8F9' : 'rgba(103,232,249,0.4)'}
          />
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
    </GestureDetector>
  );

  // ── Custom mode: inject gesture + state into child ────────────────────────

  const childrenWithGesture =
    handleType === 'custom'
      ? React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as any, {
                dragGesture: panGesture,
                isDraggingActive,
              })
            : child
        )
      : children;

  // ── Layout ────────────────────────────────────────────────────────────────

  const isVertical = handleType === 'vertical';

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.cardContainer,
        isDraggingActive && styles.cardContainerActive,
        isVertical && { flexDirection: 'row' },
        animatedStyle,
        style,
      ]}
    >
      {handleType === 'vertical' && renderVerticalHandle()}

      {handleType === 'custom' ? (
        childrenWithGesture
      ) : (
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {handleType === 'horizontal' && renderHorizontalHandle()}
          {children}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    borderRadius: 12,
  },
  cardContainerActive: {
    borderColor: '#67E8F9',
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  horizontalHandle: {
    flexDirection: 'row',
    width: '100%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(103, 232, 249, 0.08)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingHorizontal: 10,
  },
  handleActive: {
    backgroundColor: 'rgba(103, 232, 249, 0.06)',
    borderBottomColor: 'rgba(103, 232, 249, 0.25)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#E5F1FF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalHandle: {
    height: '100%',
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(103, 232, 249, 0.08)',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
});
