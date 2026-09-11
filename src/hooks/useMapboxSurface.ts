import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { MAPBOX_ACCESS_TOKEN } from "../config/mapboxConfig";

if (MAPBOX_ACCESS_TOKEN) {
  MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

/**
 * One native MapView for the process. Do not remount it on tab switches —
 * TextureView dies under display:none and looks like a missing map.
 */
export function useMapboxSurface() {
  const [usingFallback, setUsingFallback] = useState(!MAPBOX_ACCESS_TOKEN);
  const [mapReady, setMapReady] = useState(false);
  const [hasLayout, setHasLayout] = useState(false);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 1 && height > 1) {
      setHasLayout(true);
    }
  }, []);

  const onMapReady = useCallback(() => {
    setMapReady(true);
    setUsingFallback(false);
  }, []);

  const onMapError = useCallback(() => {
    if (!MAPBOX_ACCESS_TOKEN) {
      setUsingFallback(true);
    }
  }, []);

  return {
    usingFallback,
    mapReady,
    canMount: hasLayout,
    // Kept for callers; do not use as a React key — remounting MapView
    // while GL is initializing aborts the process on Android.
    mapKey: usingFallback ? "fallback" : "online",
    onLayout,
    onMapReady,
    onMapError,
  };
}

export default useMapboxSurface;
