import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MapboxGL, { MarkerView, MapView, Camera, ShapeSource, LineLayer } from '@rnmapbox/maps';
import Svg, { Polygon, Circle } from 'react-native-svg';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_SATELLITE } from '../../config/mapboxConfig';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

function RoverVehicle({ heading }: { heading: number | null | undefined }) {
  const rotationDeg = heading ?? 0;
  return (
    <View style={{ transform: [{ rotate: `${rotationDeg}deg` }] }}>
      <Svg width={40} height={40} viewBox="-20 -20 40 40">
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

// Ensure the props interface matches the usage in the app
export const PathPlanMapNative: React.FC<any> = ({
  waypoints = [],
  roverPosition = null,
  heading = null,
  onMapPress,
  visualization,
}) => {
  const center = useMemo(() => {
    if (roverPosition && roverPosition.lon && roverPosition.lat) {
      return [roverPosition.lon, roverPosition.lat];
    }
    if (waypoints.length > 0) {
      return [waypoints[0].lon, waypoints[0].lat];
    }
    return [80.2707, 13.0827];
  }, [roverPosition, waypoints]);

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

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map}
        styleURL={MAPBOX_STYLE_SATELLITE}
        compassEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onPress={(e: any) => {
           if(onMapPress && e.geometry && e.geometry.coordinates) {
               onMapPress({ longitude: e.geometry.coordinates[0], latitude: e.geometry.coordinates[1] });
           }
        }}
      >
        <Camera 
          zoomLevel={18}
          centerCoordinate={center}
          animationMode="flyTo"
          animationDuration={300}
        />

        {lineGeoJSON && (
          <ShapeSource id="path-source" shape={lineGeoJSON as any}>
            <LineLayer id="path-layer" style={{ lineColor: '#3b82f6', lineWidth: 4 }} />
          </ShapeSource>
        )}

        {/* Waypoints */}
        {waypoints.map((wp: any, i: number) => (
          <MarkerView key={wp.id || i} coordinate={[wp.lon, wp.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.waypointDot} />
          </MarkerView>
        ))}

        {/* Rover Vehicle */}
        {roverPosition && visualization?.roverIcon !== false && (
          <MarkerView coordinate={[roverPosition.lon, roverPosition.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <RoverVehicle heading={heading} />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  map: { flex: 1 },
  waypointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#ffffff',
  }
});
