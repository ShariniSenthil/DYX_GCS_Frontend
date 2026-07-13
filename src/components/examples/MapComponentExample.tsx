/**
 * Example: Map Component with Readiness Tracking
 * 
 * This example shows how to integrate component readiness
 * into a map rendering component
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useComponentLifecycle } from '../../hooks/useComponentReadiness';

interface MapComponentProps {
  waypoints: Array<{ lat: number; lng: number }>;
  roverPosition: { lat: number; lng: number } | null;
}

export function MapComponentExample({ waypoints, roverPosition }: MapComponentProps) {
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Track map initialization - critical because mission control depends on it
  const { setReady, setProgress, setError } = useComponentLifecycle(
    'mission-map',
    'Mission Map',
    'map',
    true // Critical - app should wait for map
  );

  useEffect(() => {
    async function initializeMap() {
      try {
        setProgress(20, 'Loading map tiles...');
        
        // Simulate map tile loading
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setProgress(50, 'Rendering waypoints...');
        
        // Wait for waypoints to be processed
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setProgress(80, 'Setting initial view...');
        
        // Set initial map region
        if (waypoints.length > 0 && mapRef.current) {
          // Calculate bounds and fit to waypoints
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        setProgress(100, 'Map ready');
        setMapReady(true);
        setReady('Map initialized successfully');
        
      } catch (error) {
        console.error('[MapComponent] Initialization error:', error);
        setError(error instanceof Error ? error.message : 'Map initialization failed');
      }
    }

    initializeMap();
  }, [waypoints, setProgress, setReady, setError]);

  const handleMapReady = () => {
    console.log('[MapComponent] Native map ready');
    // Additional setup when native map is ready
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        onMapReady={handleMapReady}
        initialRegion={{
          latitude: waypoints[0]?.lat || 0,
          longitude: waypoints[0]?.lng || 0,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* Waypoints */}
        {mapReady && waypoints.map((wp, idx) => (
          <Marker
            key={idx}
            coordinate={{ latitude: wp.lat, longitude: wp.lng }}
            title={`WP ${idx + 1}`}
          />
        ))}

        {/* Rover position */}
        {mapReady && roverPosition && (
          <Marker
            coordinate={{ 
              latitude: roverPosition.lat, 
              longitude: roverPosition.lng 
            }}
            title="Robot"
            pinColor="blue"
          />
        )}

        {/* Path */}
        {mapReady && waypoints.length > 1 && (
          <Polyline
            coordinates={waypoints.map(wp => ({ 
              latitude: wp.lat, 
              longitude: wp.lng 
            }))}
            strokeColor="#3B82F6"
            strokeWidth={3}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
