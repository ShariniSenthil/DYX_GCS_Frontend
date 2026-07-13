import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import Svg, { Line, G, Circle, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';

interface Props {
  visible: boolean;
  waypoints: PathPlanWaypoint[];
  onConnectionsComplete: (connectedWaypointIds: number[]) => void;
  onCancel: () => void;
  roverPosition?: { lat: number; lng: number; heading?: number } | null;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  latRange: number;
  lonRange: number;
}

interface CanvasWaypoint {
  id: number;
  x: number;
  y: number;
  lat: number;
  lon: number;
}

export const ManualPathConnectionCanvas: React.FC<Props> = ({
  visible,
  waypoints,
  onConnectionsComplete,
  onCancel,
  roverPosition,
}) => {
  const DOT_RADIUS = 12; // half of 24px dot
  const CAPTURE_RADIUS = 30; // comfortable touch capture radius

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasOrigin, setCanvasOrigin] = useState({ x: 0, y: 0 });
  const [connectedWaypoints, setConnectedWaypoints] = useState<number[]>([]);
  const [connectionMode, setConnectionMode] = useState<'tap' | 'drag'>('tap');
  const [isDragging, setIsDragging] = useState(false); // kept for drag logic gating via isDraggingRef
  const [isSequenceExpanded, setIsSequenceExpanded] = useState(false);
  const canvasRef = useRef<View>(null);

  // Pan/Zoom shared values for 60fps performance
  const scale = useSharedValue(1);
  const offset = useSharedValue({ x: 0, y: 0 });
  // Saved values for pinch focal-point zoom
  const savedScale = useSharedValue(1);
  const savedOffset = useSharedValue({ x: 0, y: 0 });
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  // Fence follower shared values (60fps, UI-thread driven)
  const fenceX = useSharedValue(0);
  const fenceY = useSharedValue(0);
  const fenceOpacity = useSharedValue(0);

  // Refs that always hold latest values to avoid stale closures
  const connectedWaypointsRef = useRef<number[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  // Bounding box calculation (static, only depends on waypoints)
  const bounds = useMemo(() => {
    if (waypoints.length === 0) {
      return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0, latRange: 0.001, lonRange: 0.001 };
    }
    const lats = waypoints.map(wp => wp.lat);
    const lons = waypoints.map(wp => wp.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = maxLat - minLat || 0.001;
    const lonRange = maxLon - minLon || 0.001;
    return { minLat, maxLat, minLon, maxLon, latRange, lonRange };
  }, [waypoints]);

  // Convert lat/lng to canvas coordinates using Web Mercator projection
  // Uses uniform scale so the geographic shape matches the map view exactly
  const latLngToCanvas = useCallback((lat: number, lon: number, bounds: Bounds, canvasSize: { width: number; height: number }): Point => {
    if (canvasSize.width === 0) {
      return { x: 0, y: 0 };
    }
    const padding = 0.1;

    // Convert to Web Mercator metres
    const toWebMercator = (lat: number, lon: number) => {
      const x = lon * 20037508.34 / 180;
      const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI;
      return { x, y };
    };

    const min = toWebMercator(bounds.minLat, bounds.minLon);
    const max = toWebMercator(bounds.maxLat, bounds.maxLon);
    const current = toWebMercator(lat, lon);

    const geoW = max.x - min.x || 1;
    const geoH = max.y - min.y || 1;

    // Available drawing area after padding
    const drawW = canvasSize.width  * (1 - 2 * padding);
    const drawH = canvasSize.height * (1 - 2 * padding);

    // Uniform scale – pick the smaller factor so everything fits
    const uniformScale = Math.min(drawW / geoW, drawH / geoH);

    // Center the drawing within the padded area
    const scaledW = geoW * uniformScale;
    const scaledH = geoH * uniformScale;
    const offsetX = canvasSize.width  * padding + (drawW - scaledW) / 2;
    const offsetY = canvasSize.height * padding + (drawH - scaledH) / 2;

    const x = offsetX + (current.x - min.x) * uniformScale;
    // Flip Y because screen Y goes down, geographic Y goes up
    const y = offsetY + (max.y - current.y) * uniformScale;

    return { x, y };
  }, []);

  // Get waypoints with canvas coordinates (static, does NOT depend on roverPosition)
  const canvasWaypoints: CanvasWaypoint[] = useMemo(() => {
    return waypoints.map(wp => {
      const pos = latLngToCanvas(wp.lat, wp.lon, bounds, canvasSize);
      return {
        id: wp.id,
        x: pos.x,
        y: pos.y,
        lat: wp.lat,
        lon: wp.lon,
      };
    });
  }, [waypoints, bounds, canvasSize, latLngToCanvas]);

  // Rover canvas position (dynamic, updates on GPS tick)
  const roverCanvasPosition = useMemo(() => {
    if (roverPosition == null || canvasSize.width === 0) return null;
    return latLngToCanvas(roverPosition.lat, roverPosition.lng, bounds, canvasSize);
  }, [roverPosition, bounds, canvasSize, latLngToCanvas]);

  // Haversine distance in meters
  const haversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Nearest waypoint calculation
  const nearestWaypoint = useMemo(() => {
    if (roverPosition == null || canvasWaypoints.length === 0) return null;
    let nearest = canvasWaypoints[0];
    let minDist = haversineDistance(roverPosition.lat, roverPosition.lng, nearest.lat, nearest.lon);
    for (let i = 1; i < canvasWaypoints.length; i++) {
      const dist = haversineDistance(roverPosition.lat, roverPosition.lng, canvasWaypoints[i].lat, canvasWaypoints[i].lon);
      if (dist < minDist) {
        minDist = dist;
        nearest = canvasWaypoints[i];
      }
    }
    return { waypoint: nearest, distance: minDist };
  }, [roverPosition, canvasWaypoints, haversineDistance]);


  // Handle waypoint tap to connect
  const handleWaypointTap = (waypointId: number) => {
    setConnectedWaypoints(prev => {
      // Don't add if already the last connected waypoint
      if (prev.length > 0 && prev[prev.length - 1] === waypointId) {
        return prev;
      }
      // Add to connection sequence
      return [...prev, waypointId];
    });
  };

  const handleFinish = () => {
    if (connectedWaypoints.length < 2) {
      Alert.alert('Connection Required', 'Please connect at least 2 marking points by tapping them');
      return;
    }

    onConnectionsComplete(connectedWaypoints);
  };

  const handleClear = () => {
    connectedWaypointsRef.current = [];
    setConnectedWaypoints([]);
    fenceOpacity.value = 0;
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  const handleUndo = () => {
    setConnectedWaypoints(prev => {
      const next = prev.slice(0, -1);
      connectedWaypointsRef.current = next;
      return next;
    });
  };

  const handleResetView = () => {
    if (roverPosition && canvasSize.width > 0) {
      const roverPt = latLngToCanvas(roverPosition.lat, roverPosition.lng, bounds, canvasSize);
      const targetOffset = {
        x: canvasSize.width / 2 - roverPt.x,
        y: canvasSize.height / 2 - roverPt.y,
      };
      offset.value = withTiming(
        { x: targetOffset.x, y: targetOffset.y },
        { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }
      );
    } else {
      offset.value = withTiming({ x: 0, y: 0 }, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    }
    scale.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  const handleZoomIn = () => {
    const newScale = Math.min(scale.value * 1.2, 5);
    scale.value = withTiming(newScale, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale.value / 1.2, 0.5);
    scale.value = withTiming(newScale, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  // Cancel the idle timer
  const cancelIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // Check if a point is near a waypoint (icon-size capture)
  const findWaypointNearPoint = useCallback((x: number, y: number): CanvasWaypoint | null => {
    let closest: CanvasWaypoint | null = null;
    let closestDist = Infinity;
    for (const wp of canvasWaypoints) {
      const dx = wp.x - x;
      const dy = wp.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= CAPTURE_RADIUS && distance < closestDist) {
        closest = wp;
        closestDist = distance;
      }
    }
    return closest;
  }, [canvasWaypoints, CAPTURE_RADIUS]);

  // Convert absolute screen coordinates to canvas space (accounting for canvas position + pan/zoom)
  const canvasPt = useCallback((absX: number, absY: number): Point => {
    const relX = absX - canvasOrigin.x;
    const relY = absY - canvasOrigin.y;
    return {
      x: (relX - offset.value.x) / scale.value,
      y: (relY - offset.value.y) / scale.value,
    };
  }, [canvasOrigin]);

  // ── JS-thread helpers called from gesture callbacks via runOnJS ──

  // Called when long-press activates (500ms)
  const onLongPressActivate = useCallback((screenX: number, screenY: number) => {
    cancelIdleTimer();
    const pt = canvasPt(screenX, screenY);
    const wp = findWaypointNearPoint(pt.x, pt.y);
    if (wp) {
      setIsDragging(true);
      isDraggingRef.current = true;
      if (!connectedWaypointsRef.current.includes(wp.id)) {
        connectedWaypointsRef.current = [...connectedWaypointsRef.current, wp.id];
        setConnectedWaypoints([...connectedWaypointsRef.current]);
      }
    } else if (connectedWaypointsRef.current.length > 0) {
      // Check if near the last connected point → resume
      const lastId = connectedWaypointsRef.current[connectedWaypointsRef.current.length - 1];
      const lastWp = canvasWaypoints.find(w => w.id === lastId);
      if (lastWp) {
        const dx = lastWp.x - pt.x;
        const dy = lastWp.y - pt.y;
        if (Math.sqrt(dx * dx + dy * dy) <= CAPTURE_RADIUS * 2) {
          // Resume from last point
          setIsDragging(true);
          isDraggingRef.current = true;
        }
      }
    }
  }, [canvasPt, findWaypointNearPoint, cancelIdleTimer, canvasWaypoints, CAPTURE_RADIUS]);

  // Called on drag move after long-press activation
  const onDragMove = useCallback((screenX: number, screenY: number) => {
    if (!isDraggingRef.current) return;
    const pt = canvasPt(screenX, screenY);
    const wp = findWaypointNearPoint(pt.x, pt.y);
    if (wp && !connectedWaypointsRef.current.includes(wp.id)) {
      connectedWaypointsRef.current = [...connectedWaypointsRef.current, wp.id];
      setConnectedWaypoints([...connectedWaypointsRef.current]);
    }
  }, [canvasPt, findWaypointNearPoint]);

  // Called when finger lifts
  const onDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    // Start 2s idle timer
    cancelIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      fenceOpacity.value = withTiming(0, { duration: 20 });
      setIsDragging(false);
      isDraggingRef.current = false;
    }, 20);
  }, [cancelIdleTimer]);

  // Double-tap zoom helper
  const onDoubleTap = useCallback((screenX: number, screenY: number) => {
    const relX = screenX - canvasOrigin.x;
    const relY = screenY - canvasOrigin.y;
    const oldScale = scale.value;
    const newScale = Math.min(oldScale * 2, 5);
    // Focal-point zoom: keep the tapped point fixed
    const newOffsetX = relX - (relX - offset.value.x) * (newScale / oldScale);
    const newOffsetY = relY - (relY - offset.value.y) * (newScale / oldScale);
    scale.value = withTiming(newScale, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offset.value = withTiming(
      { x: newOffsetX, y: newOffsetY },
      { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }
    );
  }, [canvasOrigin]);

  // ── Gesture: long-press (500ms) then drag to connect ──
  const longPressGesture = Gesture.LongPress()
    .enabled(connectionMode === 'drag')
    .minDuration(500)
    .onStart((e) => {
      // Move fence to touch position on UI thread immediately
      fenceX.value = e.absoluteX;
      fenceY.value = e.absoluteY;
      // Start opacity animation on UI thread (no JS bridge delay)
      fenceOpacity.value = withSpring(1);
      runOnJS(onLongPressActivate)(e.absoluteX, e.absoluteY);
    });

  const drawPanGesture = Gesture.Pan()
    .enabled(connectionMode === 'drag')
    .minDistance(0)
    .onUpdate((e) => {
      // Move fence on UI thread (zero delay)
      fenceX.value = e.absoluteX;
      fenceY.value = e.absoluteY;
      // Update JS-side for SVG preview line + waypoint capture
      runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      runOnJS(onDragEnd)();
    });

  // Long-press must activate first, then pan tracking continues
  const dragSequence = Gesture.Simultaneous(longPressGesture, drawPanGesture);

  // Pan gesture for map navigation – only when NOT in drag mode
  const panGesture = Gesture.Pan()
    .enabled(connectionMode !== 'drag')
    .onBegin(() => {
      savedOffset.value = offset.value;
    })
    .onUpdate((event) => {
      offset.value = {
        x: savedOffset.value.x + event.translationX,
        y: savedOffset.value.y + event.translationY,
      };
    });

  // Focal-point pinch zoom
  const pinchGesture = Gesture.Pinch()
    .onBegin((e) => {
      savedScale.value = scale.value;
      savedOffset.value = offset.value;
      pinchFocalX.value = e.focalX;
      pinchFocalY.value = e.focalY;
    })
    .onUpdate((event) => {
      const newScale = Math.min(Math.max(savedScale.value * event.scale, 0.5), 5);
      // Focal-point math: keep the pinch center fixed on screen
      const fX = pinchFocalX.value;
      const fY = pinchFocalY.value;
      offset.value = {
        x: fX - (fX - savedOffset.value.x) * (newScale / savedScale.value),
        y: fY - (fY - savedOffset.value.y) * (newScale / savedScale.value),
      };
      scale.value = newScale;
    });

  // Double-tap to zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      runOnJS(onDoubleTap)(e.absoluteX, e.absoluteY);
    });

  // Compose all gestures
  const composedGesture = Gesture.Simultaneous(
    Gesture.Race(dragSequence, panGesture),
    pinchGesture,
    doubleTapGesture,
  );

  // Animated style for the canvas transform
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value.x },
      { translateY: offset.value.y },
      { scale: scale.value },
    ],
  }));

  // Animated style for the fence follower (absolute positioned, UI-thread)
  // Re-purposed to be the shared value for the SVG elements instead of a View
  const animatedLineProps = useAnimatedProps(() => {
    // We need to convert absolute screen touch (fenceX/Y) back into canvas coordinates
    // for the SVG. Since SVG elements are inside the scaled/translated canvas,
    // this conversion happens on the UI thread for zero-delay tracking.
    const relX = fenceX.value - canvasOrigin.x;
    const relY = fenceY.value - canvasOrigin.y;
    const canvasX = (relX - offset.value.x) / scale.value;
    const canvasY = (relY - offset.value.y) / scale.value;

    return {
      x2: canvasX,
      y2: canvasY,
      opacity: fenceOpacity.value * 0.7,
    };
  }, [canvasOrigin]);

  const animatedCircleProps = useAnimatedProps(() => {
    const relX = fenceX.value - canvasOrigin.x;
    const relY = fenceY.value - canvasOrigin.y;
    const canvasX = (relX - offset.value.x) / scale.value;
    const canvasY = (relY - offset.value.y) / scale.value;

    return {
      cx: canvasX,
      cy: canvasY,
      opacity: fenceOpacity.value * 0.5,
    };
  }, [canvasOrigin]);

  // Center view on rover ONLY on component mount, not on every position update
  useEffect(() => {
    if (!roverPosition || canvasSize.width === 0) return;

    const roverPt = latLngToCanvas(roverPosition.lat, roverPosition.lng, bounds, canvasSize);
    const targetOffset = {
      x: canvasSize.width / 2 - roverPt.x,
      y: canvasSize.height / 2 - roverPt.y,
    };

    offset.value = withTiming(
      { x: targetOffset.x, y: targetOffset.y },
      { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }
    );
    scale.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [canvasSize]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          {/* Title & Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>✏️ Manual Path Connection</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <Text style={styles.info}>
                Connected: {connectedWaypoints.length}/{waypoints.length}
              </Text>
              {nearestWaypoint && (
                <Text style={[styles.info, { color: '#60A5FA' }]}>
                  Nearest: #{nearestWaypoint.waypoint.id} ({Math.round(nearestWaypoint.distance)}m)
                </Text>
              )}
            </View>
          </View>

          {/* All Controls in Single Row */}
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {/* Mode Toggle Buttons */}
            <TouchableOpacity
              style={[
                styles.modeToggleButton,
                connectionMode === 'tap' && styles.modeToggleButtonActive
              ]}
              onPress={() => setConnectionMode('tap')}
            >
              <Text style={[
                styles.modeToggleText,
                connectionMode === 'tap' && styles.modeToggleTextActive
              ]}>👆 Tap</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleButton,
                connectionMode === 'drag' && styles.modeToggleButtonActive
              ]}
              onPress={() => setConnectionMode('drag')}
            >
              <Text style={[
                styles.modeToggleText,
                connectionMode === 'drag' && styles.modeToggleTextActive
              ]}>✍️ Drag</Text>
            </TouchableOpacity>

            {/* Zoom Controls */}
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleZoomIn}
            >
              <Text style={styles.zoomButtonText}>🔍+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleZoomOut}
            >
              <Text style={styles.zoomButtonText}>🔍-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleResetView}
            >
              <Text style={styles.zoomButtonText}>🎯</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Canvas View */}
      <View
        ref={canvasRef}
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize({ width, height });
          // Measure the absolute position of the canvas on screen
          // so we can convert absoluteX/Y to canvas-relative coords
          setTimeout(() => {
            canvasRef.current?.measureInWindow?.((x: number, y: number) => {
              if (x != null && y != null) setCanvasOrigin({ x, y });
            });
          }, 100);
        }}
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '0 0' }, animatedStyle]}>
            <Svg style={StyleSheet.absoluteFill}>
              {/* Rover marker */}
              {roverCanvasPosition && roverPosition && (
                <G key="rover">
                  <Circle cx={roverCanvasPosition.x} cy={roverCanvasPosition.y} r={20} fill="#60A5FA" opacity={0.3} />
                  <Circle cx={roverCanvasPosition.x} cy={roverCanvasPosition.y} r={12} fill="#60A5FA" stroke="#fff" strokeWidth={2} />
                  {roverPosition.heading != null && (
                    <Line
                      x1={roverCanvasPosition.x}
                      y1={roverCanvasPosition.y}
                      x2={roverCanvasPosition.x + Math.sin(roverPosition.heading * Math.PI / 180) * 25}
                      y2={roverCanvasPosition.y - Math.cos(roverPosition.heading * Math.PI / 180) * 25}
                      stroke="#fff"
                      strokeWidth={3}
                    />
                  )}
                  <SvgText
                    x={roverCanvasPosition.x}
                    y={roverCanvasPosition.y + 35}
                    fill="#60A5FA"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    ROVER
                  </SvgText>
                </G>
              )}

              {/* Grid lines (subtle) */}
              <G key="vertical-grid">
                {Array.from({ length: 21 }).map((_, i) => {
                  const x = (canvasSize.width / 20) * i;
                  return (
                    <Line
                      key={`v-${i}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={canvasSize.height}
                      stroke="#f0f0f0"
                      strokeWidth={1}
                    />
                  );
                })}
              </G>
              <G key="horizontal-grid">
                {Array.from({ length: 21 }).map((_, i) => {
                  const y = (canvasSize.height / 20) * i;
                  return (
                    <Line
                      key={`h-${i}`}
                      x1={0}
                      y1={y}
                      x2={canvasSize.width}
                      y2={y}
                      stroke="#f0f0f0"
                      strokeWidth={1}
                    />
                  );
                })}
              </G>

              {/* Connection lines between connected waypoints */}
              {connectedWaypoints.length > 1 && connectedWaypoints.map((id, index) => {
                if (index === 0) return null;
                const fromWp = canvasWaypoints.find(wp => wp.id === connectedWaypoints[index - 1]);
                const toWp = canvasWaypoints.find(wp => wp.id === id);
                if (!fromWp || !toWp) return null;

                return (
                  <Line
                    key={`conn-${index}-${connectedWaypoints[index - 1]}-${id}`}
                    x1={fromWp.x}
                    y1={fromWp.y}
                    x2={toWp.x}
                    y2={toWp.y}
                    stroke="#4ADE80"
                    strokeWidth={3}
                    strokeDasharray="5, 5"
                  />
                );
              })}

              {/* Preview line from last connected point to current drag position */}
              {/* Always mounted — opacity driven by fenceOpacity on UI thread for zero-delay show/hide */}
              {(() => {
                const lastId = connectedWaypoints.length > 0
                  ? connectedWaypoints[connectedWaypoints.length - 1]
                  : null;
                const lastWp = lastId != null
                  ? canvasWaypoints.find(wp => wp.id === lastId)
                  : null;

                return (
                  <>
                    <AnimatedLine
                      key="preview-line"
                      x1={lastWp?.x ?? 0}
                      y1={lastWp?.y ?? 0}
                      animatedProps={animatedLineProps}
                      stroke="#60A5FA"
                      strokeWidth={3}
                      strokeDasharray="6, 4"
                    />
                    <AnimatedCircle
                      animatedProps={animatedCircleProps}
                      r={12}
                      fill="#60A5FA"
                    />
                  </>
                );
              })()}
            </Svg>

            {/* Waypoint markers — uniform 24px size in all modes */}
            {canvasWaypoints.map((wp, wpIndex) => {
              const isConnected = connectedWaypoints.includes(wp.id);
              const connectionIndex = connectedWaypoints.indexOf(wp.id);

              const baseSize = DOT_RADIUS * 2; // always 24px
              const circleSize = isConnected ? baseSize + 4 : baseSize;
              const markerSize = circleSize + 16;

              return (
                <TouchableOpacity
                  key={`wp-${wpIndex}-${wp.id}`}
                  style={[
                    styles.waypointMarker,
                    {
                      left: wp.x - markerSize / 2,
                      top: wp.y - markerSize / 2,
                      width: markerSize,
                      height: markerSize,
                    },
                  ]}
                  onPress={() => handleWaypointTap(wp.id)}
                  activeOpacity={0.7}
                  disabled={connectionMode === 'drag'}
                >
                  <View
                    style={[
                      styles.waypointCircle,
                      {
                        backgroundColor: isConnected ? '#4ADE80' : '#f97316',
                        width: circleSize,
                        height: circleSize,
                      },
                    ]}
                  >
                    <Text style={styles.waypointIdText}>
                      {wp.id}
                    </Text>
                  </View>
                  {isConnected && (
                    <View style={styles.connectionBadge}>
                      <Text style={styles.connectionBadgeText}>{connectionIndex + 1}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Preview line overlay — rendered on top of waypoint markers */}
            <Svg style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="none">
              {(() => {
                const lastId = connectedWaypoints.length > 0
                  ? connectedWaypoints[connectedWaypoints.length - 1]
                  : null;
                const lastWp = lastId != null
                  ? canvasWaypoints.find(wp => wp.id === lastId)
                  : null;

                return (
                  <>
                    <AnimatedLine
                      key="preview-line"
                      x1={lastWp?.x ?? 0}
                      y1={lastWp?.y ?? 0}
                      animatedProps={animatedLineProps}
                      stroke="#60A5FA"
                      strokeWidth={3}
                      strokeDasharray="6, 4"
                    />
                    <AnimatedCircle
                      animatedProps={animatedCircleProps}
                      r={12}
                      fill="#60A5FA"
                    />
                  </>
                );
              })()}
            </Svg>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Connection Sequence Sidebar - Vertical, Collapsible */}
      {connectedWaypoints.length > 0 && (
        <View style={[styles.sequenceSidebar, isSequenceExpanded && styles.sequenceSidebarExpanded]}>
          {/* Toggle Button */}
          <TouchableOpacity
            style={styles.sequenceToggleButton}
            onPress={() => setIsSequenceExpanded(!isSequenceExpanded)}
          >
            <Text style={styles.sequenceToggleText}>
              {isSequenceExpanded ? '◀' : '▶'}
            </Text>
          </TouchableOpacity>

          {/* Expanded Content */}
          {isSequenceExpanded && (
            <View style={styles.sequenceContent}>
              <Text style={styles.sequenceTitle}>Sequence</Text>
              <View style={styles.sequenceListVertical}>
                {connectedWaypoints.map((id, index) => (
                  <View key={`seq-${index}-${id}`}>
                    <View style={styles.sequenceItemVertical}>
                      <View style={styles.sequenceBadge}>
                        <Text style={styles.sequenceBadgeText}>#{id}</Text>
                      </View>
                    </View>
                    {index < connectedWaypoints.length - 1 && (
                      <Text style={styles.sequenceArrowVertical}>↓</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>✕ Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleUndo}
          disabled={connectedWaypoints.length === 0}
        >
          <Text style={[styles.secondaryButtonText, connectedWaypoints.length === 0 && { opacity: 0.5 }]}>
            ↶ Undo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleClear}
          disabled={connectedWaypoints.length === 0}
        >
          <Text style={[styles.secondaryButtonText, connectedWaypoints.length === 0 && { opacity: 0.5 }]}>
            🗑️ Clear
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, connectedWaypoints.length < 2 && { opacity: 0.5 }]}
          onPress={handleFinish}
          disabled={connectedWaypoints.length < 2}
        >
          <Text style={styles.primaryButtonText}>✓ Finish ({connectedWaypoints.length})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f5f5f5',
    zIndex: 3000,
  },
  header: {
    backgroundColor: colors.headerBlue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#1e3a8a',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  info: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '600',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#ffffff',
    margin: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionBox: {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: [{ translateX: -150 }],
    width: 300,
    backgroundColor: 'rgba(74, 222, 128, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  instructionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  sequenceBox: {
    backgroundColor: colors.cardBg,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sequenceSidebar: {
    position: 'absolute',
    left: 0,
    top: 80,
    bottom: 80,
    width: 50,
    backgroundColor: 'transparent',
    zIndex: 1000,
    flexDirection: 'row',
  },
  sequenceSidebarExpanded: {
    width: 200,
    backgroundColor: colors.cardBg,
    borderRightWidth: 2,
    borderRightColor: colors.border,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  sequenceToggleButton: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.headerBlue,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  sequenceToggleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sequenceContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-start',
  },
  sequenceTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sequenceListVertical: {
    gap: 8,
  },
  sequenceItemVertical: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sequenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sequenceBadge: {
    backgroundColor: colors.headerBlue,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  sequenceBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  sequenceArrow: {
    color: colors.textSecondary,
    fontSize: 12,
    marginHorizontal: 4,
  },
  sequenceArrowVertical: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#e5e7eb',
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1.5,
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  waypointMarker: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointCircle: {
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  waypointIdText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  connectionBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  connectionBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  modeToggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modeToggleButtonActive: {
    backgroundColor: '#4ADE80',
    borderColor: '#22c55e',
  },
  modeToggleText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  modeToggleTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  zoomButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  zoomButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ManualPathConnectionCanvas;
