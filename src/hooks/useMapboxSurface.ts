import { useCallback, useState } from "react";
import { Dimensions, type LayoutChangeEvent } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { MAPBOX_ACCESS_TOKEN } from "../config/mapboxConfig";

if (MAPBOX_ACCESS_TOKEN) {
  MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

const windowSize = Dimensions.get("window");

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
  const [hasLayout, setHasLayout] = useState(
    windowSize.width > 1 && windowSize.height > 1,
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 1 && height > 1) {
      setHasLayout(true);
    }
  }, []);

  const markReady = useCallback(() => {
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
    mapKey: usingFallback ? "fallback" : "online",
    onLayout,
    onMapReady: markReady,
    onStyleLoaded: markReady,
    onMapError,
  };
}

export default useMapboxSurface;
