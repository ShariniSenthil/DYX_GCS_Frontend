import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

export type FieldMapSurface = "marking" | "mission";

export interface FieldMapCamera {
  centerCoordinate: [number, number];
  zoomLevel: number;
  source: FieldMapSurface;
  revision: number;
}

export interface FieldMapWaypoint {
  lat: number;
  lon: number;
  sn?: number;
}

export interface FieldMapSnapshot {
  waypoints: FieldMapWaypoint[];
  statusMap?: Record<number, { status?: string }>;
  activeWaypointIndex?: number | null;
  trajectoryPoints?: Array<{ latitude: number; longitude: number }>;
}

export type MarkingPressHandler = (coord: {
  longitude: number;
  latitude: number;
}) => void;

export interface FieldMapContextValue {
  activeSurface: FieldMapSurface;
  setActiveSurface: (surface: FieldMapSurface) => void;
  marking: FieldMapSnapshot;
  mission: FieldMapSnapshot;
  setMarkingSnapshot: (snapshot: FieldMapSnapshot) => void;
  setMissionSnapshot: (snapshot: FieldMapSnapshot) => void;
  sharedCamera: FieldMapCamera | null;
  setSharedCamera: (
    camera: Omit<FieldMapCamera, "source" | "revision">,
    source: FieldMapSurface,
  ) => void;
  markingPressRef: MutableRefObject<MarkingPressHandler | null>;
}

const EMPTY_SNAPSHOT: FieldMapSnapshot = {
  waypoints: [],
};

const FieldMapContext = createContext<FieldMapContextValue | null>(null);

export function FieldMapProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const [activeSurface, setActiveSurfaceState] =
    useState<FieldMapSurface>("mission");
  const [marking, setMarking] = useState<FieldMapSnapshot>(EMPTY_SNAPSHOT);
  const [mission, setMission] = useState<FieldMapSnapshot>(EMPTY_SNAPSHOT);
  const [sharedCamera, setSharedCameraState] = useState<FieldMapCamera | null>(
    null,
  );
  const markingPressRef = useRef<MarkingPressHandler | null>(null);

  const setActiveSurface = useCallback((surface: FieldMapSurface) => {
    setActiveSurfaceState(surface);
  }, []);

  const setMarkingSnapshot = useCallback((snapshot: FieldMapSnapshot) => {
    setMarking({
      waypoints: snapshot.waypoints ?? [],
      statusMap: snapshot.statusMap,
      activeWaypointIndex: snapshot.activeWaypointIndex,
      trajectoryPoints: snapshot.trajectoryPoints,
    });
  }, []);

  const setMissionSnapshot = useCallback((snapshot: FieldMapSnapshot) => {
    setMission({
      waypoints: snapshot.waypoints ?? [],
      statusMap: snapshot.statusMap,
      activeWaypointIndex: snapshot.activeWaypointIndex,
      trajectoryPoints: snapshot.trajectoryPoints,
    });
  }, []);

  const setSharedCamera = useCallback(
    (
      camera: Omit<FieldMapCamera, "source" | "revision">,
      source: FieldMapSurface,
    ) => {
      const [longitude, latitude] = camera.centerCoordinate;
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(camera.zoomLevel) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }

      setSharedCameraState((previous) => {
        const unchanged =
          previous != null &&
          Math.abs(previous.centerCoordinate[0] - longitude) < 0.000001 &&
          Math.abs(previous.centerCoordinate[1] - latitude) < 0.000001 &&
          Math.abs(previous.zoomLevel - camera.zoomLevel) < 0.01;
        if (unchanged) return previous;

        return {
          centerCoordinate: [longitude, latitude],
          zoomLevel: camera.zoomLevel,
          source,
          revision: (previous?.revision ?? 0) + 1,
        };
      });
    },
    [],
  );

  const value = useMemo<FieldMapContextValue>(
    () => ({
      activeSurface,
      setActiveSurface,
      marking,
      mission,
      setMarkingSnapshot,
      setMissionSnapshot,
      sharedCamera,
      setSharedCamera,
      markingPressRef,
    }),
    [
      activeSurface,
      setActiveSurface,
      marking,
      mission,
      setMarkingSnapshot,
      setMissionSnapshot,
      sharedCamera,
      setSharedCamera,
    ],
  );

  return (
    <FieldMapContext.Provider value={value}>
      {children}
    </FieldMapContext.Provider>
  );
}

export function useFieldMap(): FieldMapContextValue {
  const ctx = useContext(FieldMapContext);
  if (!ctx) {
    throw new Error("useFieldMap must be used within a FieldMapProvider");
  }
  return ctx;
}

export default FieldMapContext;
