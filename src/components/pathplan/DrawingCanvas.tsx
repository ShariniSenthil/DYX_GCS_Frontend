import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, PanResponder, Dimensions, TouchableOpacity, Text, GestureResponderEvent } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface DrawSettings {
  drawingWidth: number;
  drawingHeight: number;
  waypointSpacing: number;
  startPosition: { lat: number; lng: number };
}

interface Props {
  visible: boolean;
  drawSettings: DrawSettings;
  onDrawingComplete: (coords: { latitude: number; longitude: number }[]) => void;
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
}

// Haversine formula to calculate distance between two points
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const DrawingCanvas: React.FC<Props> = ({
  visible,
  drawSettings,
  onDrawingComplete,
  onCancel,
}) => {
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const canvasRef = useRef<View>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Convert canvas coordinates to lat/lng based on drawing area settings
  const canvasToLatLng = useCallback((point: Point): { latitude: number; longitude: number } => {
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return { latitude: 0, longitude: 0 };
    }

    const { startPosition, drawingWidth, drawingHeight } = drawSettings;

    // Calculate meters per pixel
    const metersPerPixelX = drawingWidth / canvasSize.width;
    const metersPerPixelY = drawingHeight / canvasSize.height;

    // Calculate offset from center of canvas
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const offsetX = (point.x - centerX) * metersPerPixelX;
    const offsetY = (centerY - point.y) * metersPerPixelY; // Invert Y (screen Y goes down, lat goes up)

    // Convert meters to degrees (approximate)
    // 1 degree of latitude ≈ 111,320 meters
    // 1 degree of longitude ≈ 111,320 * cos(latitude) meters
    const latOffset = offsetY / 111320;
    const lngOffset = offsetX / (111320 * Math.cos(startPosition.lat * Math.PI / 180));

    return {
      latitude: startPosition.lat + latOffset,
      longitude: startPosition.lng + lngOffset,
    };
  }, [canvasSize, drawSettings]);

  // Sample points from path at specified spacing with interpolation
  const samplePathPoints = useCallback((allPaths: Point[][]): { latitude: number; longitude: number }[] => {
    const result: { latitude: number; longitude: number }[] = [];
    const spacing = drawSettings.waypointSpacing;

    for (const path of allPaths) {
      if (path.length === 0) continue;

      // Always add first point
      let lastSampledLatLng = canvasToLatLng(path[0]);
      result.push(lastSampledLatLng);
      
      let accumulatedDistance = 0;

      for (let i = 1; i < path.length; i++) {
        const prevLatLng = canvasToLatLng(path[i - 1]);
        const currentLatLng = canvasToLatLng(path[i]);

        // Distance between consecutive drawn points
        const segmentDist = haversineDistance(
          prevLatLng.latitude,
          prevLatLng.longitude,
          currentLatLng.latitude,
          currentLatLng.longitude
        );

        // Check if we need to interpolate waypoints along this segment
        let remainingInSegment = segmentDist;
        let segmentProgress = 0;

        while (accumulatedDistance + remainingInSegment >= spacing) {
          // Calculate how far along this segment we need to place the next waypoint
          const distanceNeeded = spacing - accumulatedDistance;
          segmentProgress += distanceNeeded / segmentDist;

          // Interpolate position
          const interpolatedLat = prevLatLng.latitude + (currentLatLng.latitude - prevLatLng.latitude) * segmentProgress;
          const interpolatedLng = prevLatLng.longitude + (currentLatLng.longitude - prevLatLng.longitude) * segmentProgress;

          result.push({
            latitude: interpolatedLat,
            longitude: interpolatedLng,
          });

          lastSampledLatLng = { latitude: interpolatedLat, longitude: interpolatedLng };
          remainingInSegment -= distanceNeeded;
          accumulatedDistance = 0;
        }

        // Accumulate remaining distance for next iteration
        accumulatedDistance += remainingInSegment;
      }

      // Add NaN separator between paths (different strokes)
      if (result.length > 0 && path !== allPaths[allPaths.length - 1]) {
        result.push({ latitude: NaN, longitude: NaN });
      }
    }

    return result;
  }, [canvasToLatLng, drawSettings.waypointSpacing]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(prev => [...prev, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        if (currentPath.length > 0) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath([]);
        }
      },
    })
  ).current;

  const handleFinish = () => {
    const allPaths = currentPath.length > 0 ? [...paths, currentPath] : paths;
    if (allPaths.length === 0 || allPaths.every(p => p.length === 0)) {
      onCancel();
      return;
    }

    const coords = samplePathPoints(allPaths);
    // Filter out NaN separators for counting
    const validCoords = coords.filter(c => !isNaN(c.latitude) && !isNaN(c.longitude));
    
    if (validCoords.length > 0) {
      onDrawingComplete(coords);
    } else {
      onCancel();
    }
  };

  const handleClear = () => {
    setPaths([]);
    setCurrentPath([]);
  };

  const handleUndo = () => {
    if (paths.length > 0) {
      setPaths(prev => prev.slice(0, -1));
    }
  };

  // Generate SVG path string from points
  const pointsToPathString = (points: Point[]): string => {
    if (points.length === 0) return '';
    const [first, ...rest] = points;
    let d = `M ${first.x} ${first.y}`;
    for (const point of rest) {
      d += ` L ${point.x} ${point.y}`;
    }
    return d;
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header with instructions */}
      <View style={styles.header}>
        <Text style={styles.title}>✏️ Draw Your Profile</Text>
        <Text style={styles.subtitle}>
          Draw on the canvas below. Your drawing will be converted to waypoints.
        </Text>
        <Text style={styles.info}>
          Area: {drawSettings.drawingWidth}m × {drawSettings.drawingHeight}m | Spacing: {drawSettings.waypointSpacing}m
        </Text>
      </View>

      {/* Drawing Canvas */}
      <View
        ref={canvasRef}
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        {/* Grid lines */}
        <Svg style={StyleSheet.absoluteFill}>
          {/* Vertical grid lines */}
          {Array.from({ length: 11 }).map((_, i) => {
            const x = (canvasSize.width / 10) * i;
            return (
              <Path
                key={`v-${i}`}
                d={`M ${x} 0 L ${x} ${canvasSize.height}`}
                stroke="#e0e0e0"
                strokeWidth={i === 5 ? 2 : 1}
                strokeDasharray={i === 5 ? '' : '5,5'}
              />
            );
          })}
          {/* Horizontal grid lines */}
          {Array.from({ length: 11 }).map((_, i) => {
            const y = (canvasSize.height / 10) * i;
            return (
              <Path
                key={`h-${i}`}
                d={`M 0 ${y} L ${canvasSize.width} ${y}`}
                stroke="#e0e0e0"
                strokeWidth={i === 5 ? 2 : 1}
                strokeDasharray={i === 5 ? '' : '5,5'}
              />
            );
          })}

          {/* Center point (start position) */}
          <Circle
            cx={canvasSize.width / 2}
            cy={canvasSize.height / 2}
            r={8}
            fill="#ef4444"
            stroke="#fff"
            strokeWidth={2}
          />

          {/* Completed paths */}
          {paths.map((path, index) => (
            <Path
              key={`path-${index}-${path.length}-${path[0]?.x || 0}`}
              d={pointsToPathString(path)}
              stroke="#1e40af"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}

          {/* Current drawing path */}
          {currentPath.length > 0 && (
            <Path
              d={pointsToPathString(currentPath)}
              stroke="#3b82f6"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}

          {/* Waypoint dots preview - show sampled points */}
          {(() => {
            const sampledPoints = samplePathPoints(paths);
            return sampledPoints
              .filter(coord => !isNaN(coord.latitude) && !isNaN(coord.longitude))
              .map((coord, i) => {
                // Convert lat/lng back to canvas coordinates for display
                const { startPosition, drawingWidth, drawingHeight } = drawSettings;
                const metersPerPixelX = drawingWidth / canvasSize.width;
                const metersPerPixelY = drawingHeight / canvasSize.height;
                const centerX = canvasSize.width / 2;
                const centerY = canvasSize.height / 2;
                
                const latOffset = coord.latitude - startPosition.lat;
                const lngOffset = coord.longitude - startPosition.lng;
                const offsetXMeters = lngOffset * (111320 * Math.cos(startPosition.lat * Math.PI / 180));
                const offsetYMeters = latOffset * 111320;
                
                const x = centerX + (offsetXMeters / metersPerPixelX);
                const y = centerY - (offsetYMeters / metersPerPixelY);
                
                return (
                  <Circle
                    key={`wp-${i}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill="#22c55e"
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              });
          })()}
        </Svg>

        {/* Corner labels showing dimensions */}
        <View style={styles.cornerLabel}>
          <Text style={styles.cornerText}>0,0</Text>
        </View>
        <View style={[styles.cornerLabel, { right: 8, left: undefined }]}>
          <Text style={styles.cornerText}>{drawSettings.drawingWidth}m</Text>
        </View>
        <View style={[styles.cornerLabel, { bottom: 8, top: undefined }]}>
          <Text style={styles.cornerText}>{drawSettings.drawingHeight}m</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleUndo} disabled={paths.length === 0}>
          <Text style={[styles.secondaryButtonText, paths.length === 0 && { opacity: 0.5 }]}>↩ Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleClear} disabled={paths.length === 0 && currentPath.length === 0}>
          <Text style={[styles.secondaryButtonText, (paths.length === 0 && currentPath.length === 0) && { opacity: 0.5 }]}>🗑️ Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.primaryButton, (paths.length === 0 && currentPath.length === 0) && { opacity: 0.5 }]} 
          onPress={handleFinish}
          disabled={paths.length === 0 && currentPath.length === 0}
        >
          <Text style={styles.primaryButtonText}>✓ Finish Drawing</Text>
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
    zIndex: 2000,
  },
  header: {
    backgroundColor: '#1e40af',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#1e3a8a',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginBottom: 4,
  },
  info: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#ffffff',
    margin: 12,
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
  cornerLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cornerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
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
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default DrawingCanvas;
