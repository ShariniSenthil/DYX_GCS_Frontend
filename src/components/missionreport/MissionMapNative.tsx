import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import {
  MarkerView,
  MapView,
  Camera,
} from "@rnmapbox/maps";
import { RoverVehicleIcon } from "../shared/RoverVehicleIcon";
import { NativeTrajectoryLayer, NativeWaypointLayer } from "../shared/NativeMapLayers";
import { TrajectoryStatusBanner } from "../shared/TrajectoryStatusBanner";
import {
  MAPBOX_FALLBACK_STYLE_JSON,
  mapboxStyleUrlForMode,
} from "../../config/mapboxConfig";
import { MapBottomControlsBar } from "../shared/MapBottomControlsBar";
import type { MapStyleMode } from "../shared/MapBottomControlsBar";
import type { Waypoint } from "./types";
import type { LoadedPathPoint } from "../../services/missionApi";
import { useMapboxSurface } from "../../hooks/useMapboxSurface";
import { useBackendTrajectory } from "../../context/BackendTrajectoryContext";
import { useFieldMap } from "../../context/FieldMapContext";
import {
  BACKEND_LINE_RENDER,
  buildBackendTrajectoryCollection,
  canDrawBackendLine,
  limitMapPoints,
} from "../../utils/backendTrajectoryPreview";

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

const MissionMapNativeBase: React.FC<Props> = ({
  roverLat = 0,
  roverLon = 0,
  waypoints = [],
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
    onStyleLoaded,
    onMapError,
  } = useMapboxSurface();
  const { preview } = useBackendTrajectory();
  const { sharedCamera, setSharedCamera } = useFieldMap();

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
      features: limitMapPoints(waypoints)
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

  const showTrajectory = canDrawBackendLine(preview);
  const trajectoryCollection = useMemo(() => {
    if (!showTrajectory) return null;
    return buildBackendTrajectoryCollection(preview.points, BACKEND_LINE_RENDER);
  }, [showTrajectory, preview.points]);

  const handleToggleMapStyle = useCallback(() => {
    if (usingFallback) return;
    const order: MapStyleMode[] = ["satellite", "streets", "dark"];
    setMapStyle(order[(order.indexOf(mapStyle) + 1) % order.length]);
  }, [mapStyle, usingFallback]);

  const handleCameraChanged = useCallback(
    (event: any) => {
      const payload =
        typeof event?.payload === "string"
          ? (() => {
              try {
                return JSON.parse(event.payload);
              } catch {
                return null;
              }
            })()
          : event?.payload ?? event;
      const cameraCenter = payload?.properties?.center;
      const zoom = payload?.properties?.zoom;
      if (!Array.isArray(cameraCenter) || !isValidLngLat(cameraCenter[0], cameraCenter[1])) return;
      if (typeof zoom !== "number" || !Number.isFinite(zoom)) return;
      zoomRef.current = zoom;
      setSharedCamera(
        { centerCoordinate: [cameraCenter[0], cameraCenter[1]], zoomLevel: zoom },
        "mission",
      );
    },
    [setSharedCamera],
  );

  useEffect(() => {
    if (!mapReady || !sharedCamera || sharedCamera.source === "mission") return;
    zoomRef.current = sharedCamera.zoomLevel;
    cameraRef.current?.setCamera({
      centerCoordinate: sharedCamera.centerCoordinate,
      zoomLevel: sharedCamera.zoomLevel,
      animationDuration: 0,
      animationMode: "none",
    });
  }, [mapReady, sharedCamera]);

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
        onDidFinishLoadingStyle={onStyleLoaded}
        onDidFinishLoadingMap={onMapReady}
        onDidFinishRenderingMap={onMapReady}
        onMapLoadingError={onMapError}
        onDidFailLoadingMap={onMapError}
        onMapIdle={handleCameraChanged}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: DEFAULT_ZOOM }}
        />

        {trajectoryCollection && (
          <NativeTrajectoryLayer
            sourceId="generated-trajectory"
            layerId="generated-trajectory-line"
            shape={trajectoryCollection as any}
          />
        )}

        {waypointCollection.features.length > 0 && (
          <NativeWaypointLayer
            sourceId="mission-points"
            layerId="mission-points-layer"
            shape={waypointCollection as any}
          />
        )}

        {hasRoverPosition && (
          <MarkerView
            coordinate={[roverLon, roverLat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            style={{ backgroundColor: "transparent" }}
          >
            <RoverVehicleIcon heading={heading} status={roverStatus} />
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
