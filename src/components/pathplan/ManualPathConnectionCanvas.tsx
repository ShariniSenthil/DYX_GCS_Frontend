import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ScrollView } from 'react-native';
import Svg, { Line, G, Circle, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDecay,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PathPlanWaypoint } from '../../types/pathplan';

interface Props {
  visible: boolean;
  waypoints: PathPlanWaypoint[];
  onConnectionsComplete: (connectedWaypointIds: number[]) => void;
  onDeleteWaypoints?: (deletedWaypointIds: number[]) => void;
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
  onDeleteWaypoints,
  onCancel,
  roverPosition,
}) => {
  const DOT_RADIUS = 10; // half of 24px dot
  const CAPTURE_RADIUS = 50; // comfortable touch capture radius

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasOrigin, setCanvasOrigin] = useState({ x: 0, y: 0 });
  const [connectedWaypoints, setConnectedWaypoints] = useState<number[]>([]);
  const [connectionMode, setConnectionMode] = useState<'tap' | 'drag' | 'pan' | 'del'>('tap');
  const [isDragging, setIsDragging] = useState(false); // kept for drag logic gating via isDraggingRef
  const [isSequenceExpanded, setIsSequenceExpanded] = useState(true);
  const [markedForDeletion, setMarkedForDeletion] = useState<number[]>([]);
  const canvasRef = useRef<View>(null);
  const lastTapTimestampRef = useRef<number>(0);

  // Pan/Zoom shared values for 60fps performance
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  // Saved values for pinch focal-point zoom
  const savedScale = useSharedValue(1);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  // NOTE: All gesture/animation code must use offsetX/offsetY (scalar shared values).
  // Do NOT use "offset.value = { x, y }" — that pattern requires an object shared value
  // which is not declared here and causes Reanimated crashes.

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
    const padOffX = canvasSize.width  * padding + (drawW - scaledW) / 2;
    const padOffY = canvasSize.height * padding + (drawH - scaledH) / 2;

    const x = padOffX + (current.x - min.x) * uniformScale;
    // Flip Y because screen Y goes down, geographic Y goes up
    const y = padOffY + (max.y - current.y) * uniformScale;

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
    // Debounce: reject double-fires from gesture system + TouchableOpacity
    // racing on the same touch within 300ms
    const now = Date.now();
    if (now - lastTapTimestampRef.current < 300) return;
    lastTapTimestampRef.current = now;

    if (connectionMode === 'del') {
      handleDeleteTap(waypointId);
      return;
    }
    // Use ref as single source of truth to avoid stale closure / double-fire issues
    const current = connectedWaypointsRef.current;
    let next: number[];
    if (current.includes(waypointId)) {
      next = current.filter(id => id !== waypointId);
    } else {
      next = [...current, waypointId];
    }
    connectedWaypointsRef.current = next;
    setConnectedWaypoints([...next]);
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

  // Delete mode: toggle waypoint selection for deletion
  const handleDeleteTap = (waypointId: number) => {
    setMarkedForDeletion(prev =>
      prev.includes(waypointId) ? prev.filter(id => id !== waypointId) : [...prev, waypointId]
    );
  };

  const handleConfirmDelete = () => {
    if (markedForDeletion.length === 0) return;
    Alert.alert(
      'Delete Waypoints',
      `Remove ${markedForDeletion.length} marking point(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Also remove deleted waypoints from the connection sequence
            setConnectedWaypoints(prev => {
              const next = prev.filter(id => !markedForDeletion.includes(id));
              connectedWaypointsRef.current = next;
              return next;
            });
            onDeleteWaypoints?.(markedForDeletion);
            setMarkedForDeletion([]);
            setConnectionMode('tap');
          },
        },
      ]
    );
  };

  const handleCancelDelete = () => {
    setMarkedForDeletion([]);
    setConnectionMode('tap');
  };

  const handleFitToMission = () => {
    if (canvasWaypoints.length === 0 || canvasSize.width === 0) return;

    // Calculate bounding box of all waypoints
    let minX = canvasWaypoints[0].x;
    let maxX = canvasWaypoints[0].x;
    let minY = canvasWaypoints[0].y;
    let maxY = canvasWaypoints[0].y;

    for (const wp of canvasWaypoints) {
      minX = Math.min(minX, wp.x);
      maxX = Math.max(maxX, wp.x);
      minY = Math.min(minY, wp.y);
      maxY = Math.max(maxY, wp.y);
    }

    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const padding = 40;

    // Calculate scale to fit all waypoints with padding
    const scaleX = (canvasSize.width - padding * 2) / width;
    const scaleY = (canvasSize.height - padding * 2) / height;
    const newScale = Math.min(scaleX, scaleY, 3);

    // Center the bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const targetOffsetX = canvasSize.width / 2 - centerX * newScale;
    const targetOffsetY = canvasSize.height / 2 - centerY * newScale;

    scale.value = withTiming(newScale, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetX.value = withTiming(targetOffsetX, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetY.value = withTiming(targetOffsetY, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  const handleZoomIn = () => {
    const oldScale = scale.value;
    const newScale = Math.min(oldScale * 1.2, 5);
    // Zoom toward canvas center (focal-point math)
    const cx = canvasSize.width / 2;
    const cy = canvasSize.height / 2;
    const newOffX = cx - (cx - offsetX.value) * (newScale / oldScale);
    const newOffY = cy - (cy - offsetY.value) * (newScale / oldScale);
    scale.value = withTiming(newScale, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetX.value = withTiming(newOffX, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetY.value = withTiming(newOffY, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  const handleZoomOut = () => {
    const oldScale = scale.value;
    const newScale = Math.max(oldScale / 1.2, 0.5);
    const cx = canvasSize.width / 2;
    const cy = canvasSize.height / 2;
    const newOffX = cx - (cx - offsetX.value) * (newScale / oldScale);
    const newOffY = cy - (cy - offsetY.value) * (newScale / oldScale);
    scale.value = withTiming(newScale, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetX.value = withTiming(newOffX, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetY.value = withTiming(newOffY, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
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
      x: (relX - offsetX.value) / scale.value,
      y: (relY - offsetY.value) / scale.value,
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
    const newOffX = relX - (relX - offsetX.value) * (newScale / oldScale);
    const newOffY = relY - (relY - offsetY.value) * (newScale / oldScale);
    scale.value = withTiming(newScale, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetX.value = withTiming(newOffX, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    offsetY.value = withTiming(newOffY, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
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

  // Pan gesture for map navigation – requires 2 fingers when in tap/del mode, 1 finger in pan mode
  const panGesture = Gesture.Pan()
    .enabled(connectionMode !== 'drag')
    .minPointers(connectionMode === 'pan' ? 1 : 2)
    .onBegin(() => {
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
    })
    .onUpdate((event) => {
      offsetX.value = savedOffsetX.value + event.translationX;
      offsetY.value = savedOffsetY.value + event.translationY;
    })
    .onEnd((event) => {
      // Momentum deceleration for smooth pan release
      offsetX.value = withDecay({ velocity: event.velocityX, deceleration: 0.997 });
      offsetY.value = withDecay({ velocity: event.velocityY, deceleration: 0.997 });
    });

  // Focal-point pinch zoom — incremental per-frame math (no drift)
  const pinchGesture = Gesture.Pinch()
    .onBegin((e) => {
      // Snapshot current state for the first frame
      savedScale.value = scale.value;
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
      pinchFocalX.value = e.focalX;
      pinchFocalY.value = e.focalY;
    })
    .onUpdate((event) => {
      // Incremental: compute delta from previous frame, not from onBegin
      const prevScale = savedScale.value;
      const newScale = Math.min(Math.max(prevScale * event.scale, 0.5), 5);
      const fX = event.focalX;
      const fY = event.focalY;
      const ratio = newScale / prevScale;

      // Focal-point offset: keep the pinch center fixed on screen
      // Also account for finger movement (focal drift) since last frame
      const focalDX = fX - pinchFocalX.value;
      const focalDY = fY - pinchFocalY.value;
      offsetX.value = fX - (fX - savedOffsetX.value) * ratio + focalDX;
      offsetY.value = fY - (fY - savedOffsetY.value) * ratio + focalDY;
      scale.value = newScale;

      // Save current state as baseline for next frame
      savedScale.value = newScale;
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
      pinchFocalX.value = fX;
      pinchFocalY.value = fY;
    });

  // Double-tap to zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      runOnJS(onDoubleTap)(e.absoluteX, e.absoluteY);
    });

  // Compose all gestures — pinch and pan run simultaneously (2-finger pan+zoom),
  // drag sequence races with pan (one wins), double-tap is independent
  const composedGesture = Gesture.Simultaneous(
    Gesture.Race(dragSequence, panGesture),
    pinchGesture,
    doubleTapGesture,
  );

  // Animated style for the canvas transform
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
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
    const canvasX = (relX - offsetX.value) / scale.value;
    const canvasY = (relY - offsetY.value) / scale.value;

    return {
      x2: canvasX,
      y2: canvasY,
      opacity: fenceOpacity.value * 0.7,
    };
  }, [canvasOrigin]);

  const animatedCircleProps = useAnimatedProps(() => {
    const relX = fenceX.value - canvasOrigin.x;
    const relY = fenceY.value - canvasOrigin.y;
    const canvasX = (relX - offsetX.value) / scale.value;
    const canvasY = (relY - offsetY.value) / scale.value;

    return {
      cx: canvasX,
      cy: canvasY,
      opacity: fenceOpacity.value * 0.5,
    };
  }, [canvasOrigin]);

  useEffect(() => {
    return () => {
      cancelIdleTimer();
    };
  }, [cancelIdleTimer]);

  // Center view on rover ONLY on component mount, not on every position update
  useEffect(() => {
    if (!roverPosition || canvasSize.width === 0) return;

    const roverPt = latLngToCanvas(roverPosition.lat, roverPosition.lng, bounds, canvasSize);

    offsetX.value = withTiming(
      canvasSize.width / 2 - roverPt.x,
      { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }
    );
    offsetY.value = withTiming(
      canvasSize.height / 2 - roverPt.y,
      { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }
    );
    scale.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [canvasSize]);

  // Progress percentage for the bar
  const progressPercent = waypoints.length > 0 ? (connectedWaypoints.length / waypoints.length) * 100 : 0;

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header - Centered title + progress */}
      <View style={styles.header}>
        <Text style={styles.title}>✏️ Manual Path Connection</Text>
        <View style={styles.progressRow}>
          <Text style={styles.info}>
            Connected: {connectedWaypoints.length} / {waypoints.length} marking points
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      </View>

      {/* Main content area */}
      <View style={styles.mainArea}>
        {/* Sequence Sidebar - Left, always visible */}
        <View style={[styles.sequenceSidebar, !isSequenceExpanded && styles.sequenceSidebarCollapsed]}>
          {/* Tab Header with toggle */}
          <View style={styles.seqTabRow}>
            <TouchableOpacity
              style={styles.seqTabActive}
              onPress={() => setIsSequenceExpanded(!isSequenceExpanded)}
            >
              <Text style={styles.seqTabTextActive}>
                {isSequenceExpanded ? '◀ SEQ' : '▶'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sequence Items - shown when expanded */}
          {isSequenceExpanded && (
            <ScrollView style={styles.sequenceContent} showsVerticalScrollIndicator={true}>
              {connectedWaypoints.length === 0 ? (
                <Text style={styles.seqEmptyText}>Tap a point to start</Text>
              ) : (
                connectedWaypoints.map((id, index) => (
                  <View key={`seq-${index}-${id}`}>
                    <View style={styles.sequenceItemVertical}>
                      <View style={styles.sequenceBadge}>
                        <Text style={styles.sequenceBadgeText}>#{id}</Text>
                      </View>
                    </View>
                    {index < connectedWaypoints.length - 1 && (
                      <View style={styles.sequenceConnector}>
                        <View style={styles.sequenceConnectorLine} />
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>

        {/* Canvas View */}
        <View
          ref={canvasRef}
          style={styles.canvas}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasSize({ width, height });
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

              {/* Preview line from last connected point to current drag position — only in drag mode */}
              {connectionMode === 'drag' && (() => {
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
              const isMarkedForDeletion = markedForDeletion.includes(wp.id);

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
                  disabled={connectionMode === 'drag' && !connectedWaypoints.includes(wp.id)}
                >
                  <View
                    style={[
                      styles.waypointCircle,
                      {
                        backgroundColor: isMarkedForDeletion
                          ? '#ef4444'
                          : isConnected
                            ? '#4ADE80'
                            : '#f97316',
                        width: circleSize,
                        height: circleSize,
                        borderColor: isMarkedForDeletion ? '#fca5a5' : '#fff',
                      },
                    ]}
                  >
                    <Text style={styles.waypointIdText}>
                      {isMarkedForDeletion ? '✕' : wp.id}
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

            {/* Preview line overlay — rendered on top of waypoint markers, only in drag mode */}
            {connectionMode === 'drag' && (
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
            )}
          </Animated.View>
        </GestureDetector>

        {/* Floating Mode Toggle - Top Right */}
        <View style={styles.floatingModeGroup}>
          <TouchableOpacity
            style={[styles.floatingBtn, connectionMode === 'tap' && styles.floatingBtnActive]}
            onPress={() => setConnectionMode('tap')}
          >
            <Text style={[styles.floatingBtnText, connectionMode === 'tap' && styles.floatingBtnTextActive]}>👆 Tap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floatingBtn, connectionMode === 'drag' && styles.floatingBtnActive]}
            onPress={() => setConnectionMode('drag')}
          >
            <Text style={[styles.floatingBtnText, connectionMode === 'drag' && styles.floatingBtnTextActive]}>✍️ Drag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floatingBtn, connectionMode === 'pan' && styles.floatingBtnActive]}
            onPress={() => setConnectionMode('pan')}
          >
            <Text style={[styles.floatingBtnText, connectionMode === 'pan' && styles.floatingBtnTextActive]}>🖐 Pan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floatingBtn, connectionMode === 'del' && styles.floatingBtnActiveDel]}
            onPress={() => {
              setConnectionMode('del');
              setMarkedForDeletion([]);
            }}
          >
            <Text style={[styles.floatingBtnText, connectionMode === 'del' && styles.floatingBtnTextActiveDel]}>🗑 Del</Text>
          </TouchableOpacity>
        </View>

        {/* Floating Tool Buttons - Top Left */}
        <View style={styles.floatingZoomGroup}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleZoomIn}>
            <Text style={styles.toolBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={handleFitToMission}>
            <Text style={styles.toolBtnText}>◎</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={handleZoomOut}>
            <Text style={styles.toolBtnText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>


      </View>

      {/* Delete Mode Confirmation Bar */}
      {connectionMode === 'del' && (
        <View style={styles.deleteBar}>
          <Text style={styles.deleteBarText}>
            {markedForDeletion.length === 0
              ? 'Tap waypoints to mark for deletion'
              : `${markedForDeletion.length} point(s) selected`}
          </Text>
          <View style={styles.deleteBarActions}>
            <TouchableOpacity style={styles.deleteBarCancel} onPress={handleCancelDelete}>
              <Text style={styles.deleteBarCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBarConfirm, markedForDeletion.length === 0 && { opacity: 0.4 }]}
              onPress={handleConfirmDelete}
              disabled={markedForDeletion.length === 0}
            >
              <Text style={styles.deleteBarConfirmText}>Delete ({markedForDeletion.length})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Action Bar */}
      <View style={styles.buttonRow}>
        <View style={styles.buttonRowLeft}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleUndo}
            disabled={connectedWaypoints.length === 0}
          >
            <Text style={[styles.secondaryButtonText, connectedWaypoints.length === 0 && { opacity: 0.4 }]}>
              ↩ Undo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            disabled={connectedWaypoints.length === 0}
          >
            <Text style={[styles.clearButtonText, connectedWaypoints.length === 0 && { opacity: 0.4 }]}>
              🗑 Clear
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, connectedWaypoints.length < 2 && { opacity: 0.5 }]}
          onPress={handleFinish}
          disabled={connectedWaypoints.length < 2}
        >
          <Text style={styles.primaryButtonText}>Finish ({connectedWaypoints.length})</Text>
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
    backgroundColor: '#0A1628',
    zIndex: 3000,
  },
  header: {
    backgroundColor: '#0F1D32',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  info: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#1e3a5f',
    borderRadius: 2,
    maxWidth: 120,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#4ADE80',
    borderRadius: 2,
  },
  mainArea: {
    flex: 1,
    flexDirection: 'row',
  },
  // Sequence Sidebar
  sequenceSidebar: {
    width: 100,
    backgroundColor: '#0F1D32',
    borderRightWidth: 1,
    borderRightColor: '#1e3a5f',
  },
  sequenceSidebarCollapsed: {
    width: 40,
  },
  seqTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  seqTabActive: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#4ADE80',
  },
  seqTabTextActive: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  seqEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 16,
  },
  sequenceContent: {
    flex: 1,
    padding: 10,
  },
  sequenceItemVertical: {
    alignItems: 'center',
  },
  sequenceBadge: {
    backgroundColor: '#4ADE80',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  sequenceBadgeText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  sequenceConnector: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
  },
  sequenceConnectorLine: {
    width: 2,
    height: 20,
    backgroundColor: '#4ADE80',
  },
  // Canvas
  canvas: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#ffffff',
    margin: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  // Floating Mode Toggle
  floatingModeGroup: {
    position: 'absolute',
    top: 20,
    right: 12,
    gap: 6,
    zIndex: 1100,
  },
  floatingBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 29, 50, 0.85)',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#1e3a5f',
  },
  floatingBtnActive: {
    backgroundColor: '#4ADE80',
    borderColor: '#22c55e',
  },
  floatingBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  floatingBtnTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  floatingBtnActiveDel: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  floatingBtnTextActiveDel: {
    color: '#fff',
    fontWeight: '700',
  },
  // Floating Tool Buttons
  floatingToolGroup: {
    position: 'absolute',
    right: 12,
    top: 170,
    backgroundColor: 'rgba(15, 29, 50, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    overflow: 'hidden',
    zIndex: 1100,
  },
  floatingZoomGroup: {
    position: 'absolute',
    left: 12,
    top: 20,
    backgroundColor: 'rgba(15, 29, 50, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    overflow: 'hidden',
    zIndex: 1100,
  },
  toolBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  toolBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Bottom Bar
  buttonRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
    backgroundColor: '#0F1D32',
    borderTopWidth: 1,
    borderTopColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonRowLeft: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Waypoint markers
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
  // Delete bar
  deleteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a0a0a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#ef4444',
  },
  deleteBarText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBarActions: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteBarCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b7280',
  },
  deleteBarCancelText: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBarConfirm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  deleteBarConfirmText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default ManualPathConnectionCanvas;
