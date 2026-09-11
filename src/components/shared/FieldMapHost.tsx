import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
} from "@rnmapbox/maps";
import { RoverVehicleIcon } from "./RoverVehicleIcon";
import {
  MAPBOX_FALLBACK_STYLE_JSON,
  mapboxStyleUrlForMode,
} from "../../config/mapboxConfig";
import { useFieldMap } from "../../context/FieldMapContext";
import { useTelemetry } from "../../context/TelemetryContext";
import { useMapboxSurface } from "../../hooks/useMapboxSurface";
import { MapBottomControlsBar } from "./MapBottomControlsBar";
import type { MapStyleMode } from "./MapBottomControlsBar";

const DEFAULT_ZOOM = 16;
const ROVER_THROTTLE_MS = 200;
const CHENNAI: [number, number] = [80.2707, 13.0827];

function isValidLngLat(lon: unknown, lat: unknown): lon is number {
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

function asLineCollection(coordinates: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates },
      },
    ],
  };
}

const FieldMapHostBase: React.FC = () => {
  const {
    activeSurface,
    marking,
    mission,
    markingPressRef,
  } = useFieldMap();
  const { telemetry, roverPosition } = useTelemetry();
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const didFitRef = useRef(false);
  const lastRoverTs = useRef(0);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>("satellite");
  const [rover, setRover] = useState({
    lat: 0,
    lon: 0,
    heading: null as number | null,
    armed: false,
    rtk: 0,
  });

  const {
    usingFallback,
    mapReady,
    canMount,
    onLayout,
    onMapReady,
    onStyleLoaded,
    onMapError,
  } = useMapboxSurface();

  useEffect(() => {
    const yaw = telemetry.attitude?.yaw_deg;
    const next = {
      lat: roverPosition?.lat ?? 0,
      lon: roverPosition?.lng ?? 0,
      heading:
        typeof yaw === "number" && Number.isFinite(yaw) ? yaw : null,
      armed: telemetry.state?.armed ?? false,
      rtk: telemetry.rtk?.fix_type ?? 0,
    };
    const now = Date.now();
    const wait = ROVER_THROTTLE_MS - (now - lastRoverTs.current);
    if (wait <= 0) {
      lastRoverTs.current = now;
      setRover(next);
      return undefined;
    }
    const id = setTimeout(() => {
      lastRoverTs.current = Date.now();
      setRover(next);
    }, wait);
    return () => clearTimeout(id);
  }, [
    roverPosition?.lat,
    roverPosition?.lng,
    telemetry.attitude?.yaw_deg,
    telemetry.state?.armed,
    telemetry.rtk?.fix_type,
  ]);

  const snapshot = activeSurface === "marking" ? marking : mission;
  const fallbackSnapshot =
    snapshot.waypoints.length > 0
      ? snapshot
      : marking.waypoints.length > 0
        ? marking
        : mission;

  const hasRoverPosition = isValidLngLat(rover.lon, rover.lat);
  const roverStatus = rover.armed
    ? "armed"
    : rover.rtk >= 5
      ? "rtk"
      : "disarmed";

  const defaultCenter = useMemo<[number, number]>(() => {
    if (hasRoverPosition) return [rover.lon, rover.lat];
    const first = fallbackSnapshot.waypoints.find((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (first) return [first.lon, first.lat];
    return CHENNAI;
  }, [hasRoverPosition, rover.lat, rover.lon, fallbackSnapshot.waypoints]);

  if (initialCenterRef.current == null && (hasRoverPosition || fallbackSnapshot.waypoints.length > 0)) {
    initialCenterRef.current = defaultCenter;
  }

  const waypointCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: fallbackSnapshot.waypoints
        .map((wp, index) => {
          if (!isValidLngLat(wp.lon, wp.lat)) return null;
          const sn = typeof wp.sn === "number" ? wp.sn : index + 1;
          const status = fallbackSnapshot.statusMap?.[sn]?.status;
          const completed = status === "completed" || status === "skipped";
          return {
            type: "Feature" as const,
            id: index,
            properties: {
              sn,
              active: index === fallbackSnapshot.activeWaypointIndex ? 1 : 0,
              completed: completed ? 1 : 0,
            },
            geometry: {
              type: "Point" as const,
              coordinates: [wp.lon, wp.lat],
            },
          };
        })
        .filter((feature): feature is NonNullable<typeof feature> => feature != null),
    };
  }, [
    fallbackSnapshot.waypoints,
    fallbackSnapshot.statusMap,
    fallbackSnapshot.activeWaypointIndex,
  ]);

  const pathCollection = useMemo(() => {
    const coordinates = fallbackSnapshot.waypoints
      .filter((wp) => isValidLngLat(wp.lon, wp.lat))
      .map((wp) => [wp.lon, wp.lat] as [number, number]);
    if (coordinates.length < 2) return null;
    return asLineCollection(coordinates);
  }, [fallbackSnapshot.waypoints]);

  const trajectoryCollection = useMemo(() => {
    if (activeSurface !== "mission") return null;
    const coords = (fallbackSnapshot.trajectoryPoints ?? [])
      .map((pt) => {
        const lon = Number(pt.longitude);
        const lat = Number(pt.latitude);
        if (!isValidLngLat(lon, lat)) return null;
        return [lon, lat] as [number, number];
      })
      .filter((c): c is [number, number] => c != null);
    if (coords.length < 2) return null;
    return asLineCollection(coords);
  }, [activeSurface, fallbackSnapshot.trajectoryPoints]);

  const handleToggleMapStyle = useCallback(() => {
    if (usingFallback) return;
    const order: MapStyleMode[] = ["satellite", "streets", "dark"];
    setMapStyle(order[(order.indexOf(mapStyle) + 1) % order.length]);
  }, [mapStyle, usingFallback]);

  const handleFitMission = useCallback(() => {
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (pts.length === 0) return;
    let minLon = pts[0].lon;
    let minLat = pts[0].lat;
    let maxLon = pts[0].lon;
    let maxLat = pts[0].lat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    if (hasRoverPosition) {
      minLon = Math.min(minLon, rover.lon);
      minLat = Math.min(minLat, rover.lat);
      maxLon = Math.max(maxLon, rover.lon);
      maxLat = Math.max(maxLat, rover.lat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 400);
  }, [fallbackSnapshot.waypoints, hasRoverPosition, rover.lat, rover.lon]);

  useEffect(() => {
    if (didFitRef.current || !mapReady) return;
    if (fallbackSnapshot.waypoints.length === 0) return;
    didFitRef.current = true;
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (pts.length === 0) return;
    let minLon = pts[0].lon;
    let minLat = pts[0].lat;
    let maxLon = pts[0].lon;
    let maxLat = pts[0].lat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    if (hasRoverPosition) {
      minLon = Math.min(minLon, rover.lon);
      minLat = Math.min(minLat, rover.lat);
      maxLon = Math.max(maxLon, rover.lon);
      maxLat = Math.max(maxLat, rover.lat);
    }
    cameraRef.current?.fitBounds(
      [maxLon, maxLat],
      [minLon, minLat],
      50,
      0,
    );
  }, [
    fallbackSnapshot.waypoints,
    mapReady,
    hasRoverPosition,
    rover.lat,
    rover.lon,
  ]);

  const handleCenterRover = useCallback(() => {
    if (!hasRoverPosition) return;
    zoomRef.current = 22;
    cameraRef.current?.flyTo([rover.lon, rover.lat], 500);
    cameraRef.current?.zoomTo(22, 500);
  }, [hasRoverPosition, rover.lat, rover.lon]);

  const handleZoomIn = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current + 1, 22);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current - 1, 2);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handlePress = useCallback(
    (event: any) => {
      if (activeSurface !== "marking") return;
      const press = markingPressRef.current;
      const coords = event?.geometry?.coordinates;
      if (!press || !coords || coords.length < 2) return;
      press({ longitude: coords[0], latitude: coords[1] });
    },
    [activeSurface, markingPressRef],
  );

  const mapStyleProps = usingFallback
    ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
    : { styleURL: mapboxStyleUrlForMode(mapStyle) };

  const cameraCenter = initialCenterRef.current ?? defaultCenter;

  const initialZoom = useMemo(() => {
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (pts.length < 2) return DEFAULT_ZOOM;
    let minLon = pts[0].lon;
    let minLat = pts[0].lat;
    let maxLon = pts[0].lon;
    let maxLat = pts[0].lat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    if (span > 0.05) return 13;
    if (span > 0.02) return 14;
    if (span > 0.008) return 15;
    if (span > 0.003) return 16;
    return 17;
  }, [fallbackSnapshot.waypoints]);

  if (MapView == null) {
    return (
      <View style={styles.root}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} collapsable={false} onLayout={onLayout}>
      {canMount ? (
      <MapView
          style={styles.map}
          {...mapStyleProps}
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
          onPress={handlePress}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: cameraCenter,
              zoomLevel: initialZoom,
            }}
          />

          {pathCollection && (
            <ShapeSource id="field-path" shape={pathCollection as any}>
              <LineLayer
                id="field-path-layer"
                style={{ lineColor: "#38bdf8", lineWidth: 3, lineOpacity: 0.85 }}
              />
            </ShapeSource>
          )}

          {trajectoryCollection && (
            <ShapeSource
              id="field-trajectory"
              shape={trajectoryCollection as any}
            >
              <LineLayer
                id="field-trajectory-layer"
                style={{ lineColor: "#f59e0b", lineWidth: 2, lineOpacity: 0.9 }}
              />
            </ShapeSource>
          )}

          {waypointCollection.features.length > 0 && (
            <ShapeSource id="field-points" shape={waypointCollection as any}>
              <CircleLayer
                id="field-points-layer"
                style={{
                  circleRadius: [
                    "case",
                    ["==", ["get", "active"], 1],
                    8,
                    5,
                  ],
                  circleColor: [
                    "case",
                    ["==", ["get", "completed"], 1],
                    "#22c55e",
                    ["==", ["get", "active"], 1],
                    "#fbbf24",
                    "#ef4444",
                  ],
                  circleStrokeColor: "#ffffff",
                  circleStrokeWidth: 2,
                } as any}
              />
            </ShapeSource>
          )}

          {hasRoverPosition && (
            <MarkerView
              coordinate={[rover.lon, rover.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
              style={{ backgroundColor: "transparent" }}
            >
              <RoverVehicleIcon heading={rover.heading} status={roverStatus} />
            </MarkerView>
          )}
        </MapView>
      ) : (
        <View style={styles.map} />
      )}

      {usingFallback && !mapReady && (
        <View style={styles.fallbackBanner} pointerEvents="none">
          <Text style={styles.fallbackBannerText}>
            Map tiles unavailable — showing rover & path only
          </Text>
        </View>
      )}

      <MapBottomControlsBar
        mapStyle={mapStyle}
        disabled={!mapReady}
        onToggleMapStyle={handleToggleMapStyle}
        onFitMission={handleFitMission}
        onCenterRover={handleCenterRover}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
  },
  map: {
    flex: 1,
  },
  fallbackBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  fallbackBannerText: {
    color: "#cbd5e1",
    fontSize: 12,
    textAlign: "center",
  },
});

export const FieldMapHost = React.memo(FieldMapHostBase);
export default FieldMapHost;
