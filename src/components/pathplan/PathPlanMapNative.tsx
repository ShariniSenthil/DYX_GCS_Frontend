import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MarkerView, MapView, Camera, ShapeSource, LineLayer, CircleLayer } from '@rnmapbox/maps';
import { RoverVehicleIcon } from '../shared/RoverVehicleIcon';
import { TrajectoryStatusBanner } from '../shared/TrajectoryStatusBanner';
import {
  MAPBOX_STYLE_SATELLITE,
  MAPBOX_FALLBACK_STYLE_JSON,
} from '../../config/mapboxConfig';
import { useMapboxSurface } from '../../hooks/useMapboxSurface';
import { useBackendTrajectory } from '../../context/BackendTrajectoryContext';
import {
  AUTHORING_PREVIEW_LINE_COLOR,
  BACKEND_TRAJECTORY_LINE_COLOR,
  buildAuthoringPreviewCollection,
  buildBackendTrajectoryCollection,
  canDrawBackendLine,
} from '../../utils/backendTrajectoryPreview';

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
    mapReady,
    canMount,
    onLayout,
    onMapReady,
    onStyleLoaded,
    onMapError,
  } = useMapboxSurface();
  const { preview } = useBackendTrajectory();
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

  const isValidLngLat = (lon: unknown, lat: unknown): lon is number =>
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0);

  const trajectoryGeoJSON = useMemo(() => {
    if (!canDrawBackendLine(preview)) return null;
    return buildBackendTrajectoryCollection(preview.points, {
      sampleDisplayPoints: false,
    });
  }, [preview]);

  const authoringPreviewGeoJSON = useMemo(() => {
    if (canDrawBackendLine(preview)) return null;
    return buildAuthoringPreviewCollection(waypoints);
  }, [preview, waypoints]);

  const waypointGeoJSON = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return null;
    const features = waypoints
      .map((wp: any, i: number) => {
        if (!isValidLngLat(wp.lon, wp.lat)) return null;
        return {
          type: 'Feature',
          id: i,
          properties: { id: wp.id || i },
          geometry: {
            type: 'Point',
            coordinates: [wp.lon, wp.lat],
          },
        };
      })
      .filter(Boolean);
    if (features.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features,
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
        style={styles.map}
        {...(usingFallback
          ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
          : { styleURL: MAPBOX_STYLE_SATELLITE })}
        compassEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        surfaceView={true}
        pitchEnabled={false}
        rotateEnabled={false}
        onDidFinishLoadingStyle={onStyleLoaded}
        onDidFinishLoadingMap={onMapReady}
        onDidFinishRenderingMap={onMapReady}
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

        {authoringPreviewGeoJSON && (
          <ShapeSource id="authoring-path-source" shape={authoringPreviewGeoJSON as any} tolerance={0.00001} maxZoomLevel={22}>
            <LineLayer
              id="authoring-path-layer"
              style={{
                lineColor: AUTHORING_PREVIEW_LINE_COLOR,
                lineWidth: 4,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </ShapeSource>
        )}

        {trajectoryGeoJSON && (
          <ShapeSource id="path-source" shape={trajectoryGeoJSON as any} tolerance={0.00001} maxZoomLevel={22}>
            <LineLayer 
              id="path-layer" 
              style={{ 
                lineColor: BACKEND_TRAJECTORY_LINE_COLOR, 
                lineWidth: 4,
                lineJoin: 'round',
                lineCap: 'round'
              }} 
            />
          </ShapeSource>
        )}

        {waypointGeoJSON && visualization?.waypoints !== false && (
          <ShapeSource id="waypoint-source" shape={waypointGeoJSON as any} tolerance={0.00001} maxZoomLevel={22}>
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

        {roverPosition &&
          visualization?.roverIcon !== false &&
          isValidLngLat(roverPosition.lon, roverPosition.lat) && (
          <MarkerView
            coordinate={[roverPosition.lon, roverPosition.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            style={{ backgroundColor: "transparent" }}
          >
            <RoverVehicleIcon heading={heading} status="rtk" />
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
      <TrajectoryStatusBanner
        preview={preview}
        hasAuthoringPoints={waypoints.length >= 2}
      />
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
