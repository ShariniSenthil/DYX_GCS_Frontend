import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { MAPBOX_ACCESS_TOKEN } from "../config/mapboxConfig";

/**
 * One native MapView for the process. Do not remount it on tab switches —
 * TextureView dies under display:none and looks like a missing map.
 */
export function useMapboxSurface() {
  const [usingFallback, setUsingFallback] = useState(!MAPBOX_ACCESS_TOKEN);
  const [mapReady, setMapReady] = useState(false);
  const [hasLayout, setHasLayout] = useState(false);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    mapReadyRef.current = mapReady;
  }, [mapReady]);

  useEffect(() => {
    if (MAPBOX_ACCESS_TOKEN) {
      MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
    }
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 1 && height > 1) {
      setHasLayout(true);
    }
  }, []);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const onMapError = useCallback(() => {
    setUsingFallback(true);
  }, []);

  useEffect(() => {
    if (mapReady || usingFallback) return undefined;
    const id = setTimeout(() => {
      if (!mapReadyRef.current) {
        setUsingFallback(true);
      }
    }, 4000);
    return () => clearTimeout(id);
  }, [mapReady, usingFallback]);

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
