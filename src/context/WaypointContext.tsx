/**
 * WaypointContext — Mission and waypoint state (low-frequency updates)
 *
 * Split from RoverContext to prevent waypoint consumers from re-rendering
 * on every telemetry tick (20Hz). Components that only need mission data
 * (waypoints, mission mode, drawing tools) should use useWaypointContext()
 * instead of useRover() to avoid unnecessary re-renders.
 *
 * For backward compatibility, RoverContext still provides all these values
 * by composing from WaypointContext internally.
 *
 * Save strategy: saveWaypoints is debounced (800ms) to coalesce rapid updates.
 * flushWaypointSave() is called on unmount to prevent data loss on tab switch.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PersistentStorage from '../services/PersistentStorage';
import { Waypoint } from '../components/missionreport/types';

const TTS_LANGUAGE_STORAGE_KEY = 'tts_language';

export interface WaypointContextValue {
  // Waypoint state
  missionWaypoints: Waypoint[];
  setMissionWaypoints: (waypoints: Waypoint[]) => void;
  clearMissionWaypoints: () => void;

  // Mission mode
  missionMode: string;
  setMissionMode: (mode: string) => void;

  // TTS language (mission-related UI)
  ttsLanguage: string;
  setTTSLanguage: (language: string) => void;

  // PathPlan modal state
  showUploadPreview: boolean;
  setShowUploadPreview: (visible: boolean) => void;
  showManualConnectionCanvas: boolean;
  setShowManualConnectionCanvas: (visible: boolean) => void;
}

const WaypointContext = createContext<WaypointContextValue | null>(null);

interface WaypointProviderProps {
  children: ReactNode;
}

export function WaypointProvider({ children }: WaypointProviderProps): React.ReactElement {
  const [missionWaypoints, setMissionWaypointsState] = useState<Waypoint[]>([]);
  const [missionMode, setMissionModeState] = useState<string>('DGPS Mark');
  const [ttsLanguage, setTTSLanguageState] = useState<string>('en');
  const [showUploadPreview, setShowUploadPreviewState] = useState<boolean>(false);
  const [showManualConnectionCanvas, setShowManualConnectionCanvasState] = useState<boolean>(false);

  // Track if waypoints have been loaded from storage yet
  const waypointsLoadedRef = useRef(false);

  // Load persisted data on mount — including waypoints
  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        // Load waypoints (was saved but never loaded back)
        const savedWaypoints = await PersistentStorage.loadWaypoints();
        if (savedWaypoints && savedWaypoints.length > 0) {
          setMissionWaypointsState(savedWaypoints);
          console.log(`[WaypointContext] Loaded ${savedWaypoints.length} waypoints from storage`);
        }
        waypointsLoadedRef.current = true;

        const savedLanguage = await AsyncStorage.getItem(TTS_LANGUAGE_STORAGE_KEY);
        if (savedLanguage) {
          setTTSLanguageState(savedLanguage);
        }

        const savedMissionMode = await PersistentStorage.loadMissionMode();
        if (savedMissionMode) {
          setMissionModeState(savedMissionMode);
        }
      } catch (error) {
        console.error('[WaypointContext] Failed to load persisted data:', error);
        waypointsLoadedRef.current = true;
      }
    };
    loadPersistedData();
  }, []);

  // Flush pending waypoint save on unmount (tab switch) and app backgrounding
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        // App going to background or inactive — flush immediately
        PersistentStorage.flushWaypointSave();
      }
    });

    return () => {
      // Unmount (tab switch, etc.) — flush immediately
      PersistentStorage.flushWaypointSave();
      appStateSub.remove();
    };
  }, []);

  const setMissionWaypoints = useCallback((waypoints: Waypoint[]) => {
    if (!waypoints || !Array.isArray(waypoints)) {
      console.warn('[WaypointContext] Attempted to set invalid waypoints:', waypoints);
      return;
    }

    setMissionWaypointsState(waypoints);
    // Debounced save — coalesces rapid updates (drag, bulk add) into one write
    PersistentStorage.saveWaypoints(waypoints);
  }, []);

  const clearMissionWaypoints = useCallback(() => {
    setMissionWaypointsState([]);
    // Flush any pending save first, then clear
    PersistentStorage.flushWaypointSave();
    PersistentStorage.clearMissionData().catch(error => {
      console.error('[WaypointContext] Failed to clear persisted data:', error);
    });
  }, []);

  const setMissionMode = useCallback((mode: string) => {
    setMissionModeState(mode);
    PersistentStorage.saveMissionMode(mode).catch(error => {
      console.error('[WaypointContext] Failed to persist mission mode:', error);
    });
  }, []);

  const setTTSLanguage = useCallback(async (language: string) => {
    try {
      setTTSLanguageState(language);
      await AsyncStorage.setItem(TTS_LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
      console.error('[WaypointContext] Failed to save TTS language:', error);
    }
  }, []);

  const setShowUploadPreview = useCallback((visible: boolean) => {
    setShowUploadPreviewState(visible);
  }, []);

  const setShowManualConnectionCanvas = useCallback((visible: boolean) => {
    setShowManualConnectionCanvasState(visible);
  }, []);

  const contextValue = React.useMemo<WaypointContextValue>(() => ({
    missionWaypoints,
    setMissionWaypoints,
    clearMissionWaypoints,
    missionMode,
    setMissionMode,
    ttsLanguage,
    setTTSLanguage,
    showUploadPreview,
    setShowUploadPreview,
    showManualConnectionCanvas,
    setShowManualConnectionCanvas,
  }), [
    missionWaypoints,
    setMissionWaypoints,
    clearMissionWaypoints,
    missionMode,
    setMissionMode,
    ttsLanguage,
    setTTSLanguage,
    showUploadPreview,
    setShowUploadPreview,
    showManualConnectionCanvas,
    setShowManualConnectionCanvas,
  ]);

  return React.createElement(
    WaypointContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Hook: useWaypointContext
 *
 * Access mission/waypoint state without subscribing to telemetry updates.
 * Components using this hook will NOT re-render on telemetry changes (20Hz).
 */
export function useWaypointContext(): WaypointContextValue {
  const ctx = useContext(WaypointContext);
  if (!ctx) {
    throw new Error('useWaypointContext must be used within a WaypointProvider');
  }
  return ctx;
}

export default WaypointContext;