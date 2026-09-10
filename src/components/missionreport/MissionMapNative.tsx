import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, StyleSheet, Text } from "react-native";
import {
  MarkerView,
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  CircleLayer,
} from "@rnmapbox/maps";
import Svg, { Polygon, Circle } from "react-native-svg";
import {
  MAPBOX_FALLBACK_STYLE_JSON,
  mapboxStyleUrlForMode,
} from "../../config/mapboxConfig";
import { MapBottomControlsBar } from "../shared/MapBottomControlsBar";
import type { MapStyleMode } from "../shared/MapBottomControlsBar";
import type { Waypoint } from "./types";
import type { LoadedPathPoint } from "../../services/missionApi";
import { useMapboxSurface } from "../../hooks/useMapboxSurface";

interface Props {
  roverLat?: number;
  roverLon?: number;
  waypoints?: Waypoint[];
  trajectoryPoints?: LoadedPathPoint[];
  heading?: number | null;
  activeWaypointIndex?: number | null;
  armed?: boolean;
  rtkFixType?: number;
  edgeToEdge?: boolean;
  isVisible?: boolean;
  statusMap?: Record<number, { status?: string } & Record<string, unknown>>;
}

function RoverVehicle({ heading, status }: { heading: number | null | undefined; status: string }) {
  const rotationDeg = heading ?? 0;
  const fill =
    status === "armed" ? "#22c55e" : status === "rtk" ? "#0ea5e9" : "#fbbf24";
  return (
    <View style={{ transform: [{ rotate: `${rotationDeg}deg` }] }}>
      <Svg width={64} height={64} viewBox="-20 -20 40 40">
        <Circle cx={0} cy={0} r={18.7} fill="rgba(14,165,233,0.12)" />
        <Polygon
          points="-6.5,11 6.5,11 6.5,-4 0,-7.5 -6.5,-4"
          fill={fill}
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <Polygon points="-9.5,5 -6.5,5 -6.5,11 -9.5,11" fill="#0f172a" />
        <Polygon points="9.5,5 6.5,5 6.5,11 9.5,11" fill="#0f172a" />
        <Polygon points="-2.5,3 2.5,3 2.5,-3 -2.5,-3" fill="#0f172a" />
        <Polygon points="-4.5,-2 4.5,-2 3.5,2 -3.5,2" fill="rgba(186,230,253,0.85)" />
        <Circle cx={0} cy={-7.5} r={2.5} fill="#fbbf24" stroke="#fff" strokeWidth={1} />
      </Svg>
    </View>
  );
}

const DEFAULT_ZOOM = 15;

function isValidLngLat(lon: unknown, lat: unknown): lon is number {
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function asLineCollection(coordinates: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      },
    ],
  };
}

const MissionMapNativeBase: React.FC<Props> = ({
  roverLat = 0,
  roverLon = 0,
  waypoints = [],
  trajectoryPoints = [],
  heading = null,
  activeWaypointIndex = null,
  armed = false,
  rtkFixType = 0,
  edgeToEdge = false,
  isVisible: _isVisible = true,
  statusMap,
}) => {
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>("satellite");
  const {
    usingFallback,
    mapReady,
    canMount,

    onLayout,
    onMapReady,
    onMapError,
  } = useMapboxSurface();

  const hasRoverPosition =
    isValidLngLat(roverLon, roverLat) && !(roverLat === 0 && roverLon === 0);
  const roverStatus = armed ? "armed" : rtkFixType >= 5 ? "rtk" : "disarmed";

  const center = useMemo<[number, number]>(() => {
    if (hasRoverPosition) return [roverLon, roverLat];
    const firstValid = waypoints.find((wp) => isValidLngLat(wp.lon, wp.lat));
    if (firstValid) return [firstValid.lon, firstValid.lat];
    return [80.2707, 13.0827];
  }, [hasRoverPosition, roverLat, roverLon, waypoints]);

  const waypointCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: waypoints
        .map((wp, index) => {
          if (!isValidLngLat(wp.lon, wp.lat)) return null;
          const status = statusMap?.[wp.sn]?.status;
          const completed = status === "completed" || status === "skipped";
          return {
            type: "Feature" as const,
            id: index,
            properties: {
              sn: wp.sn,
              active: index === activeWaypointIndex ? 1 : 0,
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
  }, [waypoints, statusMap, activeWaypointIndex]);

  const pathCollection = useMemo(() => {
    const coordinates = waypoints
      .filter((wp) => isValidLngLat(wp.lon, wp.lat))
      .map((wp) => [wp.lon, wp.lat] as [number, number]);
    if (coordinates.length < 2) return null;
    return asLineCollection(coordinates);
  }, [waypoints]);

  const trajectoryCollection = useMemo(() => {
    const coords = trajectoryPoints
      .map((pt) => {
        const lon = Number(pt.longitude);
        const lat = Number(pt.latitude);
        if (!isValidLngLat(lon, lat)) return null;
        return [lon, lat] as [number, number];
      })
      .filter((c): c is [number, number] => c != null);
    if (coords.length < 2) return null;
    return asLineCollection(coords);
  }, [trajectoryPoints]);

  const handleToggleMapStyle = useCallback(() => {
    if (usingFallback) return;
    const order: MapStyleMode[] = ["satellite", "streets", "dark"];
    setMapStyle(order[(order.indexOf(mapStyle) + 1) % order.length]);
  }, [mapStyle, usingFallback]);

  const handleFitMission = useCallback(() => {
    const pts = waypoints.filter((wp) => isValidLngLat(wp.lon, wp.lat));
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
      minLon = Math.min(minLon, roverLon);
      minLat = Math.min(minLat, roverLat);
      maxLon = Math.max(maxLon, roverLon);
      maxLat = Math.max(maxLat, roverLat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 400);
  }, [waypoints, hasRoverPosition, roverLat, roverLon]);

  const handleCenterRover = useCallback(() => {
    if (!hasRoverPosition) return;
    zoomRef.current = 22;
    cameraRef.current?.flyTo([roverLon, roverLat], 500);
    cameraRef.current?.zoomTo(22, 500);
  }, [hasRoverPosition, roverLat, roverLon]);

  const handleZoomIn = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current + 1, 22);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current - 1, 2);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const mapStyleProps = usingFallback
    ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
    : { styleURL: mapboxStyleUrlForMode(mapStyle) };

  if (MapView == null) {
    return (
      <View style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]}
      collapsable={false}
      onLayout={onLayout}
    >
      {canMount && (
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
        onDidFinishLoadingMap={onMapReady}
        onMapLoadingError={onMapError}
        onDidFailLoadingMap={onMapError}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: DEFAULT_ZOOM }}
        />

        {pathCollection && (
          <ShapeSource id="mission-path" shape={pathCollection as any}>
            <LineLayer
              id="mission-path-layer"
              style={{ lineColor: "#38bdf8", lineWidth: 3, lineOpacity: 0.85 }}
            />
          </ShapeSource>
        )}

        {trajectoryCollection && (
          <ShapeSource
            id="generated-trajectory"
            shape={trajectoryCollection as any}
          >
            <LineLayer
              id="generated-trajectory-layer"
              style={{ lineColor: "#f59e0b", lineWidth: 2, lineOpacity: 0.9 }}
            />
          </ShapeSource>
        )}

        {waypointCollection.features.length > 0 && (
          <ShapeSource id="mission-points" shape={waypointCollection as any}>
            <CircleLayer
              id="mission-points-layer"
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
          <MarkerView coordinate={[roverLon, roverLat]} anchor={{ x: 0.5, y: 0.5 }}>
            <RoverVehicle heading={heading} status={roverStatus} />
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
  mapContainer: {
    flex: 1,
    backgroundColor: "#1e293b",
  },
  edgeToEdge: {
    borderRadius: 0,
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

export const MissionMapNative = React.memo(MissionMapNativeBase);
