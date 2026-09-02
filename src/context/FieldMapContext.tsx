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
import type { LoadedPathPoint } from "../services/missionApi";

export type FieldMapWaypoint = {
  lat: number;
  lon: number;
  sn?: number;
  id?: string | number;
};

export type FieldMapSnapshot = {
  waypoints: FieldMapWaypoint[];
  trajectoryPoints?: LoadedPathPoint[];
  statusMap?: Record<number, { status?: string } & Record<string, unknown>>;
  activeWaypointIndex?: number | null;
};

export type FieldMapPress = (coord: {
  longitude: number;
  latitude: number;
}) => void;

type Surface = "marking" | "mission";

type FieldMapContextValue = {
  activeSurface: Surface;
  setActiveSurface: (surface: Surface) => void;
  marking: FieldMapSnapshot;
  mission: FieldMapSnapshot;
  publishMarking: (snapshot: FieldMapSnapshot) => void;
  publishMission: (snapshot: FieldMapSnapshot) => void;
  markingPressRef: MutableRefObject<FieldMapPress | undefined>;
};

const EMPTY: FieldMapSnapshot = { waypoints: [] };

const FieldMapContext = createContext<FieldMapContextValue | null>(null);

function waypointsUnchanged(
  a: FieldMapWaypoint[],
  b: FieldMapWaypoint[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].lat !== b[i].lat || a[i].lon !== b[i].lon) return false;
  }
  return true;
}

function snapshotsUnchanged(a: FieldMapSnapshot, b: FieldMapSnapshot): boolean {
  if (a.activeWaypointIndex !== b.activeWaypointIndex) return false;
  if (!waypointsUnchanged(a.waypoints, b.waypoints)) return false;
  if ((a.trajectoryPoints?.length ?? 0) !== (b.trajectoryPoints?.length ?? 0)) {
    return false;
  }
  if (a.statusMap !== b.statusMap) return false;
  return true;
}

export function FieldMapProvider({ children }: { children: ReactNode }) {
  const [activeSurface, setActiveSurface] = useState<Surface>("mission");
  const [marking, setMarking] = useState<FieldMapSnapshot>(EMPTY);
  const [mission, setMission] = useState<FieldMapSnapshot>(EMPTY);
  const markingPressRef = useRef<FieldMapPress | undefined>(undefined);

  const publishMarking = useCallback((snapshot: FieldMapSnapshot) => {
    setMarking((prev) => (snapshotsUnchanged(prev, snapshot) ? prev : snapshot));
  }, []);

  const publishMission = useCallback((snapshot: FieldMapSnapshot) => {
    setMission((prev) => (snapshotsUnchanged(prev, snapshot) ? prev : snapshot));
  }, []);

  const value = useMemo<FieldMapContextValue>(
    () => ({
      activeSurface,
      setActiveSurface,
      marking,
      mission,
      publishMarking,
      publishMission,
      markingPressRef,
    }),
    [
      activeSurface,
      marking,
      mission,
      publishMarking,
      publishMission,
    ],
  );

  return (
    <FieldMapContext.Provider value={value}>{children}</FieldMapContext.Provider>
  );
}

export function useFieldMap(): FieldMapContextValue {
  const ctx = useContext(FieldMapContext);
  if (!ctx) {
    throw new Error("useFieldMap must be used within FieldMapProvider");
  }
  return ctx;
}

export function useFieldMapOptional(): FieldMapContextValue | null {
  return useContext(FieldMapContext);
}
