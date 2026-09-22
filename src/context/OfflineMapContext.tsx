import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, InteractionManager, Platform } from "react-native";
import { useTelemetry } from "./TelemetryContext";
import { useFieldMap } from "./FieldMapContext";
import {
  deriveOfflineMapRegion,
  ensureOfflineMapRegion,
  type OfflineMapProgress,
} from "../services/offlineMapService";

export type OfflineMapStatus = OfflineMapProgress | {
  phase: "unsupported";
  progress: 0;
  message: string;
};

type OfflineMapContextValue = {
  status: OfflineMapStatus;
  retry: () => void;
};

const OfflineMapContext = createContext<OfflineMapContextValue | null>(null);

const WAITING: OfflineMapStatus = {
  phase: "waiting",
  progress: 0,
  message: "Waiting for mission or rover location",
};
const OFFLINE_DOWNLOAD_DELAY_MS = 3_000;

export function OfflineMapProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { marking, mission } = useFieldMap();
  const { roverPosition } = useTelemetry();
  const [status, setStatus] = useState<OfflineMapStatus>(WAITING);
  const [attempt, setAttempt] = useState(0);
  const requestedKeyRef = useRef<string | null>(null);

  const region = useMemo(() => {
    const points = mission.waypoints.length > 0 ? mission.waypoints : marking.waypoints;
    return deriveOfflineMapRegion(points, roverPosition ? { lat: roverPosition.lat, lon: roverPosition.lng } : null);
  }, [marking.waypoints, mission.waypoints, roverPosition?.lat, roverPosition?.lng]);

  useEffect(() => {
    if (Platform.OS === "web") {
      setStatus({ phase: "unsupported", progress: 0, message: "Offline map downloads are available in the native app" });
      return;
    }
    if (!region) {
      setStatus(WAITING);
      return;
    }
    if (requestedKeyRef.current === region.key) return;

    requestedKeyRef.current = region.key;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Native offline pack enumeration can block Mapbox's UI thread. Let the
    // first visible map render and only start while the app is foregrounded.
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!active || AppState.currentState !== "active") return;
        void ensureOfflineMapRegion(region, (next) => {
          if (active) setStatus(next);
        }).catch((error: unknown) => {
          if (!active) return;
          const message = error instanceof Error ? error.message : "Offline map download failed";
          setStatus({ phase: "failed", progress: 0, message });
        });
      }, OFFLINE_DOWNLOAD_DELAY_MS);
    });
    return () => {
      active = false;
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [region, attempt]);

  const retry = useCallback(() => {
    requestedKeyRef.current = null;
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo(() => ({ status, retry }), [status, retry]);
  return <OfflineMapContext.Provider value={value}>{children}</OfflineMapContext.Provider>;
}

export function useOfflineMap(): OfflineMapContextValue {
  const context = useContext(OfflineMapContext);
  if (!context) throw new Error("useOfflineMap must be used within an OfflineMapProvider");
  return context;
}
