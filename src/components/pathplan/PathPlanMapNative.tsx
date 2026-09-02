import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MarkerView, MapView, Camera, ShapeSource, LineLayer, CircleLayer } from '@rnmapbox/maps';
import Svg, { Polygon, Circle } from 'react-native-svg';
import {
  MAPBOX_STYLE_SATELLITE,
  MAPBOX_FALLBACK_STYLE_JSON,
} from '../../config/mapboxConfig';
import { useMapboxSurface } from '../../hooks/useMapboxSurface';

function RoverVehicle({ heading }: { heading: number | null | undefined }) {
  const rotationDeg = heading ?? 0;
  return (
    <View style={{ transform: [{ rotate: `${rotationDeg}deg` }] }}>
      <Svg width={64} height={64} viewBox="-20 -20 40 40">
        <Circle cx={0} cy={0} r={18.7} fill="rgba(14,165,233,0.12)" />
        <Polygon points="-6.5,11 6.5,11 6.5,-4 0,-7.5 -6.5,-4" fill="#0ea5e9" stroke="#ffffff" strokeWidth={1.8} strokeLinejoin="round" />
        <Polygon points="-9.5,5 -6.5,5 -6.5,11 -9.5,11" fill="#0f172a" />
        <Polygon points="9.5,5 6.5,5 6.5,11 9.5,11" fill="#0f172a" />
        <Polygon points="-2.5,3 2.5,3 2.5,-3 -2.5,-3" fill="#0f172a" />
        <Polygon points="-4.5,-2 4.5,-2 3.5,2 -3.5,2" fill="rgba(186,230,253,0.85)" />
        <Circle cx={0} cy={-7.5} r={2.5} fill="#fbbf24" stroke="#fff" strokeWidth={1} />
      </Svg>
    </View>
  );
}

export const PathPlanMapNative: React.FC<any> = ({
  waypoints = [],
  roverPosition = null,
  heading = null,
  onMapPress,
  visualization,
  isVisible: _isVisible = true,
}) => {
  const {
    usingFallback,
    canMount,
    mapKey,
    onLayout,
    onMapReady,
    onMapError,
  } = useMapboxSurface();
  const center = useMemo(() => {
    if (roverPosition && roverPosition.lon && roverPosition.lat) {
      return [roverPosition.lon, roverPosition.lat];
    }
    if (waypoints.length > 0) {
      return [waypoints[0].lon, waypoints[0].lat];
    }
    return [80.2707, 13.0827];
  }, [roverPosition, waypoints]);

  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);

  // Do not auto-follow the rover. Tab switches and live GPS would otherwise
  // yank the camera. Operators re-center with map controls when they want it.

  const lineGeoJSON = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: waypoints.map((wp: any) => [wp.lon, wp.lat]),
          },
        },
      ],
    };
  }, [waypoints]);

  const waypointGeoJSON = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: waypoints.map((wp: any, i: number) => ({
        type: 'Feature',
        id: i,
        properties: { id: wp.id || i },
        geometry: {
          type: 'Point',
          coordinates: [wp.lon, wp.lat],
        },
      })),
    };
  }, [waypoints]);

  if (MapView == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} collapsable={false} onLayout={onLayout}>
      {canMount && (
      <MapView
        key={mapKey}
        style={styles.map}
        {...(usingFallback
          ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
          : { styleURL: MAPBOX_STYLE_SATELLITE })}
        compassEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        surfaceView={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onDidFinishLoadingMap={onMapReady}
        onMapLoadingError={onMapError}
        onDidFailLoadingMap={onMapError}
        onPress={(e: any) => {
           if(onMapPress && e.geometry && e.geometry.coordinates) {
               onMapPress({ longitude: e.geometry.coordinates[0], latitude: e.geometry.coordinates[1] });
           }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: 18 }}
        />

        {lineGeoJSON && (
          <ShapeSource id="path-source" shape={lineGeoJSON as any}>
            <LineLayer id="path-layer" style={{ lineColor: '#3b82f6', lineWidth: 4 }} />
          </ShapeSource>
        )}

        {waypointGeoJSON && (
          <ShapeSource id="waypoint-source" shape={waypointGeoJSON as any}>
            <CircleLayer
              id="waypoint-layer"
              style={{
                circleRadius: 6,
                circleColor: '#ef4444',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}

        {roverPosition && visualization?.roverIcon !== false && (
          <MarkerView coordinate={[roverPosition.lon, roverPosition.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <RoverVehicle heading={heading} />
          </MarkerView>
        )}
      </MapView>
      )}
      {usingFallback && (
        <View style={styles.fallbackBanner} pointerEvents="none">
          <Text style={styles.fallbackBannerText}>
            Map tiles unavailable — showing rover & path only
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  map: { flex: 1 },
  fallbackBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  fallbackBannerText: {
    color: '#cbd5e1',
    fontSize: 12,
    textAlign: 'center',
  },
});
