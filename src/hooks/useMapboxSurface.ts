import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, type LayoutChangeEvent } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { MAPBOX_ACCESS_TOKEN } from "../config/mapboxConfig";

if (MAPBOX_ACCESS_TOKEN) {
  MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

const windowSize = Dimensions.get("window");
const MAP_READY_TIMEOUT_MS = 6_000;

/**
 * One native MapView for the process. Do not remount it on tab switches —
 * TextureView dies under display:none and looks like a missing map.
 *
 * Treat style-loaded as ready so the operator sees rover/points without
 * waiting for every satellite tile.
 */
export function useMapboxSurface() {
  const [usingFallback, setUsingFallback] = useState(!MAPBOX_ACCESS_TOKEN);
  const [mapReady, setMapReady] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [hasLayout, setHasLayout] = useState(
    windowSize.width > 1 && windowSize.height > 1,
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 1 && height > 1) {
      setHasLayout(true);
    }
  }, []);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReadyTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const markReady = useCallback(() => {
    clearReadyTimeout();
    setMapReady(true);
    // A locally rendered fallback is a successful recovery. Do not switch it
    // straight back to the remote style or an offline tablet loops forever.
  }, [clearReadyTimeout]);

  const onMapError = useCallback(() => {
    clearReadyTimeout();
    setMapReady(false);
    // Network, token and native style failures must all produce a usable
    // local map. Previously a valid token incorrectly left this blank.
    setUsingFallback(true);
  }, [clearReadyTimeout]);

  useEffect(() => {
    clearReadyTimeout();
    if (!hasLayout || mapReady || usingFallback) return undefined;

    timeoutRef.current = setTimeout(() => {
      // Never leave a remote MapView blank indefinitely. The local style
      // still renders mission layers and gives the operator a visible state.
      setMapReady(false);
      setUsingFallback(true);
      setRestartKey((value) => value + 1);
    }, MAP_READY_TIMEOUT_MS);

    return clearReadyTimeout;
  }, [clearReadyTimeout, hasLayout, mapReady, usingFallback]);

  useEffect(() => clearReadyTimeout, [clearReadyTimeout]);

  return {
    usingFallback,
    mapReady,
    canMount: hasLayout,
    mapKey: `${usingFallback ? "fallback" : "online"}-${restartKey}`,
    onLayout,
    onMapReady: markReady,
    onStyleLoaded: markReady,
    onMapError,
  };
}

export default useMapboxSurface;
