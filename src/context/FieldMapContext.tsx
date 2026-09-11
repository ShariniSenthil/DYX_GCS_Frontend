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

  const value = useMemo<FieldMapContextValue>(
    () => ({
      activeSurface,
      setActiveSurface,
      marking,
      mission,
      setMarkingSnapshot,
      setMissionSnapshot,
      markingPressRef,
    }),
    [
      activeSurface,
      setActiveSurface,
      marking,
      mission,
      setMarkingSnapshot,
      setMissionSnapshot,
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
