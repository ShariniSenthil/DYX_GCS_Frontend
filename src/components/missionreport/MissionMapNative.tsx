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
  isVisible = true,
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

  const rawHasRoverPosition =
    isValidLngLat(roverLon, roverLat) && !(roverLat === 0 && roverLon === 0);
  const [mapRover, setMapRover] = useState<{
    lat: number;
    lon: number;
    heading: number | null;
    armed: boolean;
    rtkFixType: number;
  } | null>(null);
  const roverUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRoverUpdateRef = useRef(0);

  // Mapbox MarkerView is a native view. Updating it for every websocket packet
  // can overwhelm Android's renderer, so draw the latest rover position at a
  // stable 10 FPS. The raw telemetry is still used everywhere else.
  useEffect(() => {
    if (!isVisible || !rawHasRoverPosition) {
      if (roverUpdateRef.current) clearTimeout(roverUpdateRef.current);
      roverUpdateRef.current = null;
      setMapRover(null);
      return undefined;
    }
    const next = { lat: roverLat, lon: roverLon, heading, armed, rtkFixType };
    const apply = () => {
      lastRoverUpdateRef.current = Date.now();
      roverUpdateRef.current = null;
      setMapRover(next);
    };
    const wait = Math.max(0, 100 - (Date.now() - lastRoverUpdateRef.current));
    if (wait === 0) apply();
    else roverUpdateRef.current = setTimeout(apply, wait);
    return () => {
      if (roverUpdateRef.current) clearTimeout(roverUpdateRef.current);
      roverUpdateRef.current = null;
    };
  }, [isVisible, rawHasRoverPosition, roverLat, roverLon, heading, armed, rtkFixType]);

  const roverStatus = mapRover?.armed ? "armed" : (mapRover?.rtkFixType ?? 0) >= 5 ? "rtk" : "disarmed";

  const center = useMemo<[number, number]>(() => {
    if (mapRover) return [mapRover.lon, mapRover.lat];
    const firstValid = waypoints.find((wp) => isValidLngLat(wp.lon, wp.lat));
    if (firstValid) return [firstValid.lon, firstValid.lat];
    return [80.2707, 13.0827];
  }, [mapRover, waypoints]);

  const waypointCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      // Preserve the source sequence before sampling. A rendered subset must
      // still display the same mission numbers as the Marking Plan map.
      features: limitMapPoints(waypoints.map((waypoint, sequence) => ({ waypoint, sequence })))
        .map(({ waypoint: wp, sequence }) => {
          if (!isValidLngLat(wp.lon, wp.lat)) return null;
          const status = statusMap?.[wp.sn]?.status;
          const completed = status === "completed" || status === "skipped";
          return {
            type: "Feature" as const,
            id: sequence,
            properties: {
              sn: wp.sn,
              sequence: sequence + 1,
              active: sequence === activeWaypointIndex ? 1 : 0,
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
    if (mapRover) {
      minLon = Math.min(minLon, mapRover.lon);
      minLat = Math.min(minLat, mapRover.lat);
      maxLon = Math.max(maxLon, mapRover.lon);
      maxLat = Math.max(maxLat, mapRover.lat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 400);
  }, [waypoints, mapRover]);

  const handleCenterRover = useCallback(() => {
    if (!mapRover) return;
    zoomRef.current = 22;
    cameraRef.current?.flyTo([mapRover.lon, mapRover.lat], 500);
    cameraRef.current?.zoomTo(22, 500);
  }, [mapRover]);

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

  if (!isVisible) {
    // Cached tab: unmount the expensive native surface while it is hidden.
    // This prevents concurrent Mapbox surfaces and stale telemetry work.
    return <View style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]} />;
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
        // TextureView survives tab overlays/remounts more reliably than a
        // SurfaceView on the tablet during a live mission. The marker itself
        // is rate-limited above, so this safety choice does not cause churn.
        surfaceView={false}
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

        {mapRover && (
          <MarkerView
            coordinate={[mapRover.lon, mapRover.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            style={{ backgroundColor: "transparent" }}
          >
            <RoverVehicleIcon heading={mapRover.heading} status={roverStatus} />
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
